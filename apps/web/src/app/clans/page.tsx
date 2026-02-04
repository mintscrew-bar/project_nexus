"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { clanApi } from "@/lib/api-client";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  LoadingSpinner,
  EmptyState,
  Badge,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Users, Search, Plus, Crown, Shield, UserCheck } from "lucide-react";

interface ClanMember {
  id: string;
  role: "OWNER" | "OFFICER" | "MEMBER";
}

interface Clan {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  logo: string | null;
  isRecruiting: boolean;
  maxMembers: number;
  minTier: string | null;
  discord: string | null;
  members: ClanMember[];
  owner: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export default function ClansPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();

  const [clans, setClans] = useState<Clan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showRecruitingOnly, setShowRecruitingOnly] = useState(false);
  const [myClan, setMyClan] = useState<Clan | null>(null);
  const { addToast } = useToast();

  // Debounce search query for API calls
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const fetchClans = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await clanApi.getClans({
        search: debouncedSearchQuery || undefined,
        isRecruiting: showRecruitingOnly || undefined,
      });
      setClans(data);
    } catch (err: any) {
      setError(err.message || "클랜 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchQuery, showRecruitingOnly]);

  const fetchMyClan = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await clanApi.getMyClan();
      setMyClan(data);
    } catch {
      setMyClan(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchClans();
  }, [fetchClans]);

  useEffect(() => {
    fetchMyClan();
  }, [fetchMyClan]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchClans();
  };

  const handleJoinClan = async (clanId: string) => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }

    try {
      await clanApi.joinClan(clanId);
      addToast("클랜에 가입되었습니다.", "success");
      fetchMyClan();
      fetchClans();
    } catch (err: any) {
      addToast(err.message || "클랜 가입에 실패했습니다.", "error");
    }
  };

  const getTierBadgeColor = (tier: string | null) => {
    if (!tier) return "default";
    const t = tier.toUpperCase();
    if (t.includes("CHALLENGER") || t.includes("GRANDMASTER")) return "gold";
    if (t.includes("MASTER") || t.includes("DIAMOND")) return "primary";
    if (t.includes("PLATINUM") || t.includes("EMERALD")) return "success";
    return "default";
  };

  if (isLoading && clans.length === 0) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">클랜 목록 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
              <Shield className="h-8 w-8 text-accent-primary" />
              클랜
            </h1>
            <p className="text-text-secondary mt-1">
              클랜에 가입하여 함께 내전을 즐기세요
            </p>
          </div>
          {isAuthenticated && !myClan && (
            <Button onClick={() => router.push("/clans/create")}>
              <Plus className="h-4 w-4 mr-2" />
              클랜 만들기
            </Button>
          )}
        </div>

        {/* My Clan Card */}
        {myClan && (
          <Card className="mb-6 border-accent-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-accent-gold" />
                내 클랜
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg bg-bg-tertiary flex items-center justify-center overflow-hidden relative">
                    {myClan.logo ? (
                      <Image
                        src={myClan.logo}
                        alt={myClan.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <Shield className="h-8 w-8 text-text-tertiary" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary text-lg">
                      [{myClan.tag}] {myClan.name}
                    </p>
                    <p className="text-sm text-text-secondary">
                      멤버 {myClan.members.length}/{myClan.maxMembers}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => router.push(`/clans/${myClan.id}`)}
                >
                  클랜 페이지
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <form onSubmit={handleSearch} className="flex-grow flex gap-2">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
              <Input
                type="text"
                placeholder="클랜 이름 또는 태그로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="secondary">
              검색
            </Button>
          </form>
          <Button
            variant={showRecruitingOnly ? "primary" : "secondary"}
            onClick={() => setShowRecruitingOnly(!showRecruitingOnly)}
          >
            <UserCheck className="h-4 w-4 mr-2" />
            모집 중만
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-xl p-4 mb-6">
            <p className="text-accent-danger">{error}</p>
          </div>
        )}

        {/* Clans List */}
        {clans.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="클랜이 없습니다"
            description={
              searchQuery
                ? "검색 조건에 맞는 클랜이 없습니다."
                : "첫 번째 클랜을 만들어보세요!"
            }
            action={
              isAuthenticated && !myClan
                ? {
                    label: "클랜 만들기",
                    onClick: () => router.push("/clans/create"),
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clans.map((clan) => (
              <Card
                key={clan.id}
                hoverable
                onClick={() => router.push(`/clans/${clan.id}`)}
                className="cursor-pointer"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-lg bg-bg-tertiary flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                      {clan.logo ? (
                        <Image
                          src={clan.logo}
                          alt={clan.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <Shield className="h-7 w-7 text-text-tertiary" />
                      )}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-text-primary truncate">
                          [{clan.tag}] {clan.name}
                        </p>
                        {clan.isRecruiting && (
                          <Badge variant="success" size="sm">
                            모집 중
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                        {clan.description || "클랜 소개가 없습니다."}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {clan.members.length}/{clan.maxMembers}
                        </span>
                        {clan.minTier && (
                          <Badge
                            variant={getTierBadgeColor(clan.minTier)}
                            size="sm"
                          >
                            {clan.minTier}+
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Join Button */}
                  {isAuthenticated &&
                    !myClan &&
                    clan.isRecruiting &&
                    clan.members.length < clan.maxMembers && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="w-full mt-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJoinClan(clan.id);
                        }}
                      >
                        가입하기
                      </Button>
                    )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
