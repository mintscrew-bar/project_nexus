"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { userApi, matchApi, statsApi, rankingApi } from "@/lib/api-client";
import { LoadingSpinner, Button, Badge, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, User, Trophy, Target, TrendingUp, Calendar, ExternalLink } from "lucide-react";
import Link from "next/link";

import { getChampionIcon } from "@/components/matches/match-utils";
import type { RiotAccount, NexusMatchHistory } from "@/components/matches/match-utils";
import RecentStatsSummary from "@/components/matches/RecentStatsSummary";
import RiotMatchList from "@/components/matches/RiotMatchList";

interface UserData {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  createdAt: string;
}

export default function UserStatsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const { addToast } = useToast();

  const [user, setUser] = useState<UserData | null>(null);
  const [matchHistory, setMatchHistory] = useState<NexusMatchHistory[]>([]);
  const [riotAccounts, setRiotAccounts] = useState<RiotAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const primaryAccount = riotAccounts.find(a => a.isPrimary) || riotAccounts[0];

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      setError(null);

      // user, matches, riotAccounts 병렬 조회 — 순차 대기 제거
      // matches는 21개 조회해 hasMore 판단 (20개 반환 시 마지막 페이지 오인 방지)
      const [userResult, matchesResult, accountsResult] = await Promise.allSettled([
        userApi.getProfile(userId),
        matchApi.getUserMatchHistory(userId, 21, 0),
        statsApi.getUserRiotAccounts(userId),
      ]);

      if (userResult.status === "rejected") {
        const err: any = userResult.reason;
        setError(err.response?.data?.message || "유저 정보를 불러오는데 실패했습니다.");
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

  const navigateToSummoner = (gameName: string, tagLine: string) => {
    if (gameName && tagLine) {
      router.push(`/matches/summoner/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
    }
  };

  const loadMoreMatches = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      // 21개 조회 후 20개만 추가 — hasMore 정확한 판단
      const moreMatches = await matchApi.getUserMatchHistory(userId, 21, matchHistory.length);
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

    let totalKills = 0, totalDeaths = 0, totalAssists = 0;
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
  const { data: championStats = [] } = useQuery<any[]>({
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
      <div className="min-h-screen bg-bg-primary">
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
          <p className="text-accent-danger mb-4">{error || "유저를 찾을 수 없습니다."}</p>
          <Button onClick={() => router.push("/matches")}>
            전적 검색으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const stats = calculateStats();

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Back Button */}
      <div className="border-b border-bg-tertiary">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/matches"
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
                <h1 className="text-3xl font-bold text-text-primary">
                  {user.username}
                </h1>
                {primaryAccount && (
                  <Link
                    href={`/matches/summoner/${encodeURIComponent(primaryAccount.gameName)}/${encodeURIComponent(primaryAccount.tagLine)}`}
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
                  href={`/matches/summoner/${encodeURIComponent(account.gameName)}/${encodeURIComponent(account.tagLine)}`}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent Stats Summary (Ranked / Nexus tabs) */}
            <RecentStatsSummary
              gameName={primaryAccount?.gameName}
              tagLine={primaryAccount?.tagLine}
              puuid={primaryAccount?.puuid}
              nexusMatches={matchHistory}
            />

            {/* Riot Match List */}
            {primaryAccount ? (
              <RiotMatchList
                gameName={primaryAccount.gameName}
                tagLine={primaryAccount.tagLine}
                puuid={primaryAccount.puuid}
                navigateToSummoner={navigateToSummoner}
              />
            ) : (
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
                <div className="text-center py-12">
                  <Target className="h-12 w-12 text-text-tertiary mx-auto mb-3 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    Riot 계정이 연동되지 않았습니다
                  </h3>
                  <p className="text-text-secondary text-sm">
                    Riot 계정을 연동하면 솔로 랭크, 자유 랭크 등의 전적을 확인할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

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
                  {matchHistory.map((match) => (
                    <Link
                      key={match.matchId}
                      href={`/matches/match/${match.matchId}`}
                      className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                        match.participant.win
                          ? "bg-accent-success/10 border border-accent-success/30 hover:bg-accent-success/20"
                          : "bg-accent-danger/10 border border-accent-danger/30 hover:bg-accent-danger/20"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <Image
                          src={getChampionIcon(match.participant.championName)}
                          alt={match.participant.championName}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-lg"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={match.participant.win ? "success" : "danger"}>
                              {match.participant.win ? "승리" : "패배"}
                            </Badge>
                            <span className="text-sm text-text-secondary">
                              {match.participant.position}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-text-primary">
                            {match.participant.championName}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {match.team.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-text-primary">
                          {match.participant.kills} / {match.participant.deaths} / {match.participant.assists}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {match.participant.kda.toFixed(2)} KDA
                        </p>
                      </div>
                    </Link>
                  ))}

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

          {/* Champion Statistics */}
          <div className="space-y-6">
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent-primary" />
                챔피언 통계
              </h2>

              {championStats.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-text-secondary text-sm">
                    챔피언 통계가 없습니다
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {championStats.slice(0, 5).map((stat) => {
                    const champWinRate = Math.round((stat.wins / stat.games) * 100);
                    const avgKDA =
                      stat.deaths === 0
                        ? stat.kills + stat.assists
                        : ((stat.kills + stat.assists) / stat.deaths).toFixed(2);

                    return (
                      <div
                        key={stat.championId}
                        className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Image
                            src={getChampionIcon(stat.championName)}
                            alt={stat.championName}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-lg"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          <div>
                            <p className="font-semibold text-text-primary text-sm">
                              {stat.championName}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {stat.wins}승 {stat.losses}패
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-bold text-sm ${
                              champWinRate >= 60
                                ? "text-accent-success"
                                : champWinRate >= 50
                                ? "text-accent-primary"
                                : "text-accent-danger"
                            }`}
                          >
                            {champWinRate}%
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {avgKDA} KDA
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
