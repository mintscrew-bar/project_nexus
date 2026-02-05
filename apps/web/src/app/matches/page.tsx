"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, Clock, User, Target, Users } from "lucide-react";
import { Button, Input, Badge } from "@/components/ui";
import { statsApi } from "@/lib/api-client";

interface RecentSearch {
  type: "summoner" | "user";
  gameName?: string;
  tagLine?: string;
  username?: string;
  userId?: string;
  timestamp: number;
}

interface SearchResult {
  id: string;
  username: string;
  avatar?: string;
  primaryRiotAccount?: {
    gameName: string;
    tagLine: string;
    tier?: string;
    rank?: string;
  } | null;
}

export default function StatsPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [searchType, setSearchType] = useState<"summoner" | "user">("summoner");
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load recent searches from localStorage
    const saved = localStorage.getItem("recentSearches");
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (error) {
        console.error("Failed to load recent searches:", error);
      }
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search for users
  useEffect(() => {
    if (searchType === "user" && searchInput.trim().length >= 2) {
      const timer = setTimeout(async () => {
        setIsSearching(true);
        try {
          const results = await statsApi.searchUsers(searchInput.trim(), 10);
          setSearchResults(results);
          setShowDropdown(true);
        } catch (error) {
          console.error("Failed to search users:", error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);

      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  }, [searchInput, searchType]);

  const saveRecentSearch = (search: RecentSearch) => {
    const updated = [
      search,
      ...recentSearches.filter(
        (s) =>
          !(
            s.type === search.type &&
            s.gameName === search.gameName &&
            s.tagLine === search.tagLine &&
            s.userId === search.userId
          )
      ),
    ].slice(0, 10); // Keep only 10 recent searches

    setRecentSearches(updated);
    localStorage.setItem("recentSearches", JSON.stringify(updated));
  };

  const handleSearch = () => {
    const trimmed = searchInput.trim();
    if (!trimmed) return;

    if (searchType === "summoner") {
      // Check if it's a Riot ID (gameName#tagLine)
      if (trimmed.includes("#")) {
        const [gameName, tagLine] = trimmed.split("#");
        if (gameName && tagLine) {
          saveRecentSearch({
            type: "summoner",
            gameName: gameName.trim(),
            tagLine: tagLine.trim(),
            timestamp: Date.now(),
          });
          router.push(`/matches/summoner/${encodeURIComponent(gameName.trim())}/${encodeURIComponent(tagLine.trim())}`);
        }
      } else {
        alert("소환사 이름은 '게임명#태그' 형식으로 입력해주세요. (예: Hide on bush#KR1)");
      }
    } else {
      // User search - if only one result, go directly
      if (searchResults.length === 1) {
        handleUserSelect(searchResults[0]);
      } else if (searchResults.length === 0) {
        alert("검색 결과가 없습니다.");
      }
    }
  };

  const handleUserSelect = (user: SearchResult) => {
    saveRecentSearch({
      type: "user",
      username: user.username,
      userId: user.id,
      timestamp: Date.now(),
    });
    setShowDropdown(false);
    router.push(`/matches/user/${user.id}`);
  };

  const handleRecentSearchClick = (search: RecentSearch) => {
    if (search.type === "summoner" && search.gameName && search.tagLine) {
      router.push(`/matches/summoner/${encodeURIComponent(search.gameName)}/${encodeURIComponent(search.tagLine)}`);
    } else if (search.type === "user" && search.userId) {
      router.push(`/matches/user/${search.userId}`);
    }
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem("recentSearches");
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-accent-primary/10 to-bg-primary border-b border-bg-tertiary">
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="flex items-center justify-center mb-6">
            <Target className="h-16 w-16 text-accent-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">
            전적 검색
          </h1>
          <p className="text-lg text-text-secondary mb-8 max-w-2xl mx-auto">
            소환사 전적을 검색하고 상세한 통계를 확인하세요
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto">
            {/* Search Type Tabs */}
            <div className="flex gap-2 mb-4 justify-center">
              <button
                onClick={() => {
                  setSearchType("summoner");
                  setSearchInput("");
                  setSearchResults([]);
                }}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  searchType === "summoner"
                    ? "bg-accent-primary text-white"
                    : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                <Target className="h-4 w-4" />
                소환사 검색
              </button>
              <button
                onClick={() => {
                  setSearchType("user");
                  setSearchInput("");
                  setSearchResults([]);
                }}
                className={`px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                  searchType === "user"
                    ? "bg-accent-primary text-white"
                    : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                <Users className="h-4 w-4" />
                Nexus 유저 검색
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-grow" ref={dropdownRef}>
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-tertiary z-10" />
                <Input
                  type="text"
                  placeholder={
                    searchType === "summoner"
                      ? "소환사 이름 + #태그 (예: Hide on bush#KR1)"
                      : "Nexus 유저명 검색"
                  }
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  onFocus={() => {
                    if (searchType === "user" && searchResults.length > 0) {
                      setShowDropdown(true);
                    }
                  }}
                  className="pl-10 h-14 text-lg"
                />

                {/* Search Results Dropdown */}
                {searchType === "user" && showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleUserSelect(user)}
                        className="w-full flex items-center gap-3 p-4 hover:bg-bg-tertiary transition-colors text-left border-b border-bg-tertiary/50 last:border-b-0"
                      >
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.username}
                            className="w-12 h-12 rounded-full"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center">
                            <User className="h-6 w-6 text-text-tertiary" />
                          </div>
                        )}
                        <div className="flex-grow">
                          <p className="font-semibold text-text-primary">
                            {user.username}
                          </p>
                          {user.primaryRiotAccount && (
                            <p className="text-sm text-text-secondary">
                              {user.primaryRiotAccount.gameName}#{user.primaryRiotAccount.tagLine}
                              {user.primaryRiotAccount.tier && user.primaryRiotAccount.rank && (
                                <span className="ml-2 text-accent-primary">
                                  {user.primaryRiotAccount.tier} {user.primaryRiotAccount.rank}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Loading indicator */}
                {searchType === "user" && isSearching && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl p-4 text-center">
                    <p className="text-text-secondary">검색 중...</p>
                  </div>
                )}
              </div>
              <Button
                onClick={handleSearch}
                size="lg"
                className="h-14 px-8"
              >
                검색
              </Button>
            </div>
            <p className="text-sm text-text-tertiary mt-2 text-left">
              {searchType === "summoner" ? (
                <>💡 팁: 소환사 이름과 태그를 함께 입력하세요 (예: Hide on bush#KR1)</>
              ) : (
                <>💡 팁: 최소 2글자 이상 입력하면 자동완성 결과가 표시됩니다</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Recent Searches */}
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <Clock className="h-5 w-5 text-accent-primary" />
                최근 검색
              </h2>
              {recentSearches.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearRecentSearches}
                  className="text-text-tertiary hover:text-text-secondary"
                >
                  전체 삭제
                </Button>
              )}
            </div>

            {recentSearches.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 text-text-tertiary mx-auto mb-3 opacity-50" />
                <p className="text-text-secondary">최근 검색 기록이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => handleRecentSearchClick(search)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-bg-tertiary hover:bg-bg-elevated transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {search.type === "summoner" ? (
                        <User className="h-4 w-4 text-accent-primary" />
                      ) : (
                        <User className="h-4 w-4 text-accent-success" />
                      )}
                      <div>
                        <p className="font-medium text-text-primary">
                          {search.type === "summoner"
                            ? `${search.gameName}#${search.tagLine}`
                            : search.username}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          {new Date(search.timestamp).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                    </div>
                    <Search className="h-4 w-4 text-text-tertiary" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Popular Features */}
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-accent-primary" />
              주요 기능
            </h2>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-bg-tertiary">
                <h3 className="font-semibold text-text-primary mb-2">
                  📊 상세한 전적 분석
                </h3>
                <p className="text-sm text-text-secondary">
                  매치별 KDA, CS, 딜량, 와드 등 모든 통계를 확인하세요
                </p>
              </div>

              <div className="p-4 rounded-lg bg-bg-tertiary">
                <h3 className="font-semibold text-text-primary mb-2">
                  🏆 챔피언 통계
                </h3>
                <p className="text-sm text-text-secondary">
                  챔피언별 승률, 평균 KDA, 선호도를 한눈에 파악하세요
                </p>
              </div>

              <div className="p-4 rounded-lg bg-bg-tertiary">
                <h3 className="font-semibold text-text-primary mb-2">
                  📈 포지션 분석
                </h3>
                <p className="text-sm text-text-secondary">
                  포지션별 성적과 선호 라인을 확인하세요
                </p>
              </div>

              <div className="p-4 rounded-lg bg-bg-tertiary">
                <h3 className="font-semibold text-text-primary mb-2">
                  🎮 Nexus 토너먼트 기록
                </h3>
                <p className="text-sm text-text-secondary">
                  플랫폼 내 토너먼트 참가 기록과 성적을 확인하세요
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
