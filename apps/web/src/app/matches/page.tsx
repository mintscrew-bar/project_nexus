"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Clock,
  User,
  Target,
  Users,
  ArrowRight,
  BarChart3,
  Trophy,
  Swords,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Button, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { statsApi } from "@/lib/api-client";
import { MatchesTour } from "@/components/onboarding/PrimaryPageTours";
import { AdSlotCard } from "@/components/ads/AdSlot";

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

const FEATURE_CARDS: Array<{
  icon: LucideIcon;
  index: string;
  title: string;
  description: string;
  tone: string;
}> = [
  {
    icon: BarChart3,
    index: "01",
    title: "매치 상세 분석",
    description: "KDA, CS, 딜량과 시야 점수를 경기별로 비교합니다.",
    tone: "text-cyan-300 bg-cyan-300/[0.08] border-cyan-300/10",
  },
  {
    icon: Trophy,
    index: "02",
    title: "챔피언 통계",
    description: "챔피언별 승률과 평균 성적, 플레이 빈도를 확인합니다.",
    tone: "text-amber-300 bg-amber-300/[0.08] border-amber-300/10",
  },
  {
    icon: Target,
    index: "03",
    title: "포지션 분석",
    description: "선호 포지션과 라인별 성적 변화를 한눈에 보여줍니다.",
    tone: "text-violet-300 bg-violet-300/[0.08] border-violet-300/10",
  },
  {
    icon: Swords,
    index: "04",
    title: "NEXUS 내전 기록",
    description: "토너먼트 참가 이력과 팀 성적을 계정 기록과 연결합니다.",
    tone: "text-emerald-300 bg-emerald-300/[0.08] border-emerald-300/10",
  },
];

function formatRecentTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return new Date(timestamp).toLocaleDateString("ko-KR");
}

export default function StatsPage() {
  const router = useRouter();
  const { addToast } = useToast();
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
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
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
          ),
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
          router.push(
            `/matches/summoner/${encodeURIComponent(gameName.trim())}/${encodeURIComponent(tagLine.trim())}`,
          );
        }
      } else {
        addToast(
          "소환사 이름은 '게임명#태그' 형식으로 입력해주세요. (예: Hide on bush#KR1)",
          "error",
        );
      }
    } else {
      // User search - if only one result, go directly
      if (searchResults.length === 1) {
        handleUserSelect(searchResults[0]);
      } else if (searchResults.length === 0) {
        addToast("검색 결과가 없습니다.", "info");
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
      router.push(
        `/matches/summoner/${encodeURIComponent(search.gameName)}/${encodeURIComponent(search.tagLine)}`,
      );
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
      <MatchesTour />
      {/* Hero Section */}
      <div className="relative isolate overflow-hidden border-b border-white/[0.07] bg-[#0b0c11]">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:48px_48px]"
        />
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-0 -z-10 h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-[140px]"
        />
        <div className="container mx-auto max-w-[1480px] px-4 py-12 text-center md:px-6 md:py-20">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200/75">
            <Sparkles className="h-3.5 w-3.5" />
            Nexus match intelligence
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-black leading-[1.05] tracking-[-0.05em] text-white sm:text-5xl md:text-6xl">
            기록에서 다음 승리의
            <br className="hidden sm:block" /> 단서를 찾으세요
          </h1>
          <p className="mx-auto mb-8 mt-6 max-w-2xl text-sm leading-6 text-white/45 md:text-base md:leading-7">
            Riot ID 또는 NEXUS 유저를 검색하고 경기 흐름, 챔피언 성적과 내전
            기록을 한곳에서 확인하세요.
          </p>

          {/* Search Bar */}
          <div
            data-tour="matches-search"
            className="mx-auto max-w-3xl rounded-2xl border border-white/[0.09] bg-black/25 p-3 shadow-[0_24px_70px_rgba(0,0,0,0.3)] backdrop-blur-sm sm:p-4"
          >
            {/* Search Type Tabs */}
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => {
                  setSearchType("summoner");
                  setSearchInput("");
                  setSearchResults([]);
                }}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  searchType === "summoner"
                    ? "bg-white/[0.09] text-white shadow-sm"
                    : "text-white/35 hover:text-white/65"
                }`}
              >
                <Target className="h-4 w-4" />
                소환사 검색
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchType("user");
                  setSearchInput("");
                  setSearchResults([]);
                }}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  searchType === "user"
                    ? "bg-white/[0.09] text-white shadow-sm"
                    : "text-white/35 hover:text-white/65"
                }`}
              >
                <Users className="h-4 w-4" />
                Nexus 유저 검색
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-grow" ref={dropdownRef}>
                <Search className="absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-white/30" />
                <Input
                  type="text"
                  aria-label={
                    searchType === "summoner"
                      ? "소환사 검색"
                      : "Nexus 유저 검색"
                  }
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
                  className="h-12 border-white/[0.08] bg-white/[0.04] pl-12 text-sm text-white placeholder:text-white/25 focus:ring-violet-400 md:h-14 md:text-base"
                />

                {/* Search Results Dropdown */}
                {searchType === "user" &&
                  showDropdown &&
                  searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-bg-tertiary rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                      {searchResults.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => handleUserSelect(user)}
                          className="w-full flex items-center gap-3 p-4 hover:bg-bg-tertiary transition-colors text-left border-b border-bg-tertiary/50 last:border-b-0"
                        >
                          {user.avatar ? (
                            <Image
                              src={user.avatar}
                              alt={user.username}
                              width={48}
                              height={48}
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
                                {user.primaryRiotAccount.gameName}#
                                {user.primaryRiotAccount.tagLine}
                                {user.primaryRiotAccount.tier &&
                                  user.primaryRiotAccount.rank && (
                                    <span className="ml-2 text-accent-primary">
                                      {user.primaryRiotAccount.tier}{" "}
                                      {user.primaryRiotAccount.rank}
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
                className="h-12 bg-white px-5 text-sm font-bold text-[#111218] hover:bg-violet-100 md:h-14 md:px-8 md:text-base"
              >
                검색
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 px-1 text-left text-[11px] text-white/30">
              {searchType === "summoner" ? (
                <>게임명과 태그를 함께 입력하세요 · 예: Hide on bush#KR1</>
              ) : (
                <>두 글자 이상 입력하면 NEXUS 유저가 자동으로 검색됩니다.</>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-[1480px] px-4 pt-6 md:px-6 md:pt-8">
        <AdSlotCard slotKey="matchHub" minHeight={90} />
      </div>

      {/* Content Section */}
      <div className="container mx-auto max-w-[1480px] px-4 py-8 md:px-6 md:py-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          {/* Recent Searches */}
          <section
            data-tour="matches-recent"
            className="overflow-hidden rounded-2xl border border-white/[0.06] bg-bg-secondary/60 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Clock className="h-4 w-4 text-violet-400" />
                최근 검색 기록
              </h2>
              {recentSearches.length > 0 && (
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="text-xs text-text-tertiary transition-colors hover:text-text-secondary"
                >
                  전체 삭제
                </button>
              )}
            </div>

            {recentSearches.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10">
                  <Clock className="h-6 w-6 text-violet-400/70" />
                </div>
                <p className="mt-4 text-sm font-semibold text-text-secondary">
                  최근 검색 기록이 없습니다
                </p>
                <p className="mt-1 text-xs text-text-tertiary">
                  검색한 소환사와 유저가 이곳에 저장됩니다.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => handleRecentSearchClick(search)}
                    className="group flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.025]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                          search.type === "summoner"
                            ? "bg-violet-500/10 text-violet-400"
                            : "bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {search.type === "summoner"
                            ? `${search.gameName}#${search.tagLine}`
                            : search.username}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-tertiary">
                          {search.type === "summoner"
                            ? "Riot ID"
                            : "NEXUS 유저"}{" "}
                          · {formatRecentTime(search.timestamp)}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-violet-400" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Popular Features */}
          <section data-tour="matches-features">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400/70">
                Match analysis
              </p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.025em] text-text-primary">
                숫자를 경기력으로 바꾸는 분석
              </h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FEATURE_CARDS.map((feature) => (
                <div
                  key={feature.index}
                  className="group min-h-[150px] rounded-2xl border border-white/[0.06] bg-bg-secondary/60 p-5 transition-all hover:-translate-y-0.5 hover:border-violet-400/20"
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border ${feature.tone}`}
                    >
                      <feature.icon className="h-5 w-5" />
                    </span>
                    <span className="text-[10px] font-bold tabular-nums text-text-tertiary/50">
                      {feature.index}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-text-primary">
                    {feature.title}
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-text-tertiary">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
