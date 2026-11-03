"use client";

import { useParams, useRouter } from "next/navigation";
import { useGamePrefix } from "@/hooks/useCurrentGame";
import { useRequireGame } from "@/components/games/RequireGame";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { userApi, matchApi, statsApi, rankingApi } from "@/lib/api-client";
import { LoadingSpinner, Button, Badge, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  ArrowLeft,
  User,
  Trophy,
  Target,
  Calendar,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

import type {
  RiotAccount,
  NexusMatchHistory,
} from "@/components/matches/match-utils";
import RecentStatsSummary from "@/components/matches/RecentStatsSummary";
import { CustomGameStatsCard } from "@/components/matches/CustomGameStatsCard";
import {
  ChampionStatsCard,
  type ChampionStat,
} from "@/components/matches/ChampionStatsCard";
import { AdSlotCard } from "@/components/ads/AdSlot";
import { InternalMatchHistoryRow } from "@/components/matches/internal-match/InternalMatchHistoryRow";

interface UserData {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  createdAt: string;
}

export default function UserStatsPage() {
  // 소환사 검색·챔피언 기록은 롤 전용 개념이다. `/pubg/...` 에서는 404.
  useRequireGame("LOL");
  const params = useParams();
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const userId = params.userId as string;
  const { addToast } = useToast();

  const [user, setUser] = useState<UserData | null>(null);
  const [matchHistory, setMatchHistory] = useState<NexusMatchHistory[]>([]);
  const [riotAccounts, setRiotAccounts] = useState<RiotAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const primaryAccount =
    riotAccounts.find((a) => a.isPrimary) || riotAccounts[0];

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      setError(null);

      // user, matches, riotAccounts 병렬 조회 — 순차 대기 제거
      // matches는 21개 조회해 hasMore 판단 (20개 반환 시 마지막 페이지 오인 방지)
      const [userResult, matchesResult, accountsResult] =
        await Promise.allSettled([
          userApi.getProfile(userId),
          matchApi.getUserMatchHistory(userId, 21, 0),
          statsApi.getUserRiotAccounts(userId),
        ]);

      if (userResult.status === "rejected") {
        const err: any = userResult.reason;
        setError(
          err.response?.data?.message || "유저 정보를 불러오는데 실패했습니다.",
        );
        setIsLoading(false);
        return;
      }

      setUser(userResult.value);

      if (matchesResult.status === "fulfilled") {
        const fetched = matchesResult.value;
        // 21개 조회 후 20개만 표시 — 21개 이상이면 다음 페이지 존재
        setMatchHistory(fetched.slice(0, 20));
        setHasMore(fetched.length > 20);
      }

      if (accountsResult.status === "fulfilled") {
        setRiotAccounts(accountsResult.value);
      }

      setIsLoading(false);
    };

    fetchUserData();
  }, [userId]);

  const loadMoreMatches = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      // 21개 조회 후 20개만 추가 — hasMore 정확한 판단
      const moreMatches = await matchApi.getUserMatchHistory(
        userId,
        21,
        matchHistory.length,
      );
      setMatchHistory((prev) => [...prev, ...moreMatches.slice(0, 20)]);
      setHasMore(moreMatches.length > 20);
    } catch (err) {
      console.error("Failed to load more matches:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const calculateStats = () => {
    const totalGames = matchHistory.length;
    const wins = matchHistory.filter((m) => m.participant.win).length;
    const losses = totalGames - wins;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    let totalKills = 0,
      totalDeaths = 0,
      totalAssists = 0;
    matchHistory.forEach((m) => {
      totalKills += m.participant.kills;
      totalDeaths += m.participant.deaths;
      totalAssists += m.participant.assists;
    });

    const avgKDA =
      totalGames > 0 && totalDeaths > 0
        ? ((totalKills + totalAssists) / totalDeaths).toFixed(2)
        : totalGames > 0
          ? (totalKills + totalAssists).toFixed(2)
          : "0.00";

    return { totalGames, wins, losses, winRate, avgKDA };
  };

  // 백엔드에서 챔피언 통계 조회 (전체 MatchParticipant 집계)
  const { data: championStats = [] } = useQuery<ChampionStat[]>({
    queryKey: ["championStats", userId],
    queryFn: () => statsApi.getUserChampionStats(userId),
    staleTime: 5 * 60 * 1000,
    enabled: !isLoading && !!user,
  });

  // Nexus 랭킹 조회
  const { data: nexusRanking } = useQuery({
    queryKey: ["nexusRanking", userId],
    queryFn: () => rankingApi.getUserRanking(userId),
    staleTime: 5 * 60 * 1000,
    enabled: !isLoading && !!user,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="border-b border-bg-tertiary">
          <div className="container mx-auto px-4 py-4">
            <Skeleton className="h-5 w-36" />
          </div>
        </div>
        <div className="container mx-auto px-4 py-8">
          {/* 유저 헤더 스켈레톤 */}
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
            <div className="flex items-start gap-6">
              <Skeleton className="w-24 h-24 rounded-xl flex-shrink-0" />
              <div className="flex-grow space-y-3">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-4 w-48" />
                <div className="flex items-center gap-4 mt-4">
                  <Skeleton className="h-20 w-28 rounded-lg" />
                  <Skeleton className="h-20 w-28 rounded-lg" />
                  <Skeleton className="h-20 w-28 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* 전적 요약 스켈레톤 */}
              <Skeleton className="h-48 w-full rounded-xl" />
              {/* 매치 목록 스켈레톤 */}
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
                <Skeleton className="h-7 w-40 mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
                <Skeleton className="h-7 w-28 mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-accent-danger mb-4">
            {error || "유저를 찾을 수 없습니다."}
          </p>
          <Button onClick={() => router.push(`${gamePrefix}/matches`)}>
            전적 검색으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const stats = calculateStats();

  return (
    <div className="min-h-screen">
      {/* Back Button */}
      <div className="border-b border-bg-tertiary">
        <div className="container mx-auto px-4 py-4">
          <Link
            href={`${gamePrefix}/matches`}
            className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            전적 검색으로 돌아가기
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* User Header */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              {user.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.username}
                  width={96}
                  height={96}
                  className="w-24 h-24 rounded-xl border-2 border-accent-primary"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl border-2 border-accent-primary bg-bg-tertiary flex items-center justify-center">
                  <User className="h-12 w-12 text-text-tertiary" />
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="flex-grow">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
                  {user.username}
                </h1>
                {primaryAccount && (
                  <Link
                    href={`${gamePrefix}/matches/summoner/${encodeURIComponent(primaryAccount.gameName)}/${encodeURIComponent(primaryAccount.tagLine)}`}
                    className="text-sm text-accent-primary hover:text-accent-hover flex items-center gap-1"
                  >
                    <ExternalLink className="h-4 w-4" />
                    소환사 전적 페이지로 이동
                  </Link>
                )}
              </div>
              <p className="text-text-secondary flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                가입일: {new Date(user.createdAt).toLocaleDateString("ko-KR")}
              </p>

              {/* Stats Summary */}
              <div className="flex items-center gap-4 mt-4">
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-text-secondary mb-1">총 게임</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {stats.totalGames}
                  </p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-text-secondary mb-1">승률</p>
                  <p className="text-2xl font-bold text-accent-primary">
                    {stats.winRate}%
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {stats.wins}승 {stats.losses}패
                  </p>
                </div>
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <p className="text-sm text-text-secondary mb-1">평균 KDA</p>
                  <p className="text-2xl font-bold text-accent-success">
                    {stats.avgKDA}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Riot Accounts */}
        {riotAccounts.length > 0 && (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-accent-primary" />
              연동된 Riot 계정
            </h2>
            <div className="space-y-3">
              {riotAccounts.map((account) => (
                <Link
                  key={account.id}
                  href={`${gamePrefix}/matches/summoner/${encodeURIComponent(account.gameName)}/${encodeURIComponent(account.tagLine)}`}
                  className="flex items-center justify-between p-4 bg-bg-tertiary rounded-lg hover:bg-bg-elevated transition-colors"
                >
                  <div>
                    <p className="font-semibold text-text-primary">
                      {account.gameName}#{account.tagLine}
                      {account.isPrimary && (
                        <Badge variant="primary" className="ml-2">
                          대표 계정
                        </Badge>
                      )}
                    </p>
                    {account.tier && account.rank && (
                      <p className="text-sm text-text-secondary">
                        {account.tier} {account.rank} - {account.lp} LP
                      </p>
                    )}
                  </div>
                  <ArrowLeft className="h-5 w-5 text-text-tertiary rotate-180" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 내전 지표 + 내전 챔피언 — 한 줄에 같은 높이로.
            챔피언 카드는 높이를 정하지 않고(absolute) 내전 지표 높이에 맞춰 안에서 스크롤한다. */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* 챔피언 카드는 고정 폭 — 1/3 비율이면 와이드 화면에서 줄이 좌우로 너무 길어졌다 */}
          <div className="min-w-0">
            {/* 경매 매물 카드와 같은 여덟 칸 + 라인별 승률. Riot 게임 전적이 있던 자리 */}
            <CustomGameStatsCard userId={userId} ranking={nexusRanking} />
          </div>
          <div className="relative">
            <div className="lg:absolute lg:inset-0">
              <ChampionStatsCard stats={championStats} fill />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* 최근 내전 요약 — 2026-11-03 Riot 랭크·일반 전적은 유저 검색 화면에서 뺐다.
                Riot 계정을 안 넘기면 요약 컴포넌트가 내전 탭 하나만 그린다. */}
          <RecentStatsSummary nexusMatches={matchHistory} />

          {/* 광고 — 요약과 내전 기록 사이, 문서 흐름 안에만 둔다 */}
          <AdSlotCard slotKey="profile" minHeight={90} />

          {/* Nexus Match Detail List */}
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-accent-primary" />
              넥서스 내전 기록
            </h2>

            {matchHistory.length === 0 ? (
              <div className="text-center py-16">
                <Target className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  매치 기록이 없습니다
                </h3>
                <p className="text-text-secondary">
                  토너먼트에 참가하면 여기에 전적이 표시됩니다.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 일반 전적과 같은 행 — 누르면 그 자리에서 내전 상세가 펼쳐진다 */}
                <div className="overflow-hidden rounded-lg divide-y divide-bg-tertiary/40">
                  {matchHistory.map((match) => (
                    <InternalMatchHistoryRow
                      key={match.matchId}
                      match={match}
                    />
                  ))}
                </div>

                {/* 더 보기 버튼 */}
                {hasMore && (
                  <div className="text-center pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={loadMoreMatches}
                      disabled={isLoadingMore}
                    >
                      {isLoadingMore ? "로딩 중..." : "더 보기"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
