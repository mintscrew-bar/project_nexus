"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { riotApi, matchApi, statsApi, rankingApi } from "@/lib/api-client";
import { LoadingSpinner, Button, Badge, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, TrendingUp, Sword, ExternalLink, Loader2, RefreshCw, Search, Shield } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import {
  getChampionIcon,
  getProfileIconUrl,
  getTierImage,
} from "@/components/matches/match-utils";
import type { SummonerData, ChampionStats, NexusMatchHistory } from "@/components/matches/match-utils";
import RecentStatsSummary from "@/components/matches/RecentStatsSummary";
import RiotMatchList from "@/components/matches/RiotMatchList";

export default function SummonerStatsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const gameName = decodeURIComponent(params.gameName as string).replace(/[\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g, "");
  const tagLine = decodeURIComponent(params.tagLine as string).replace(/[\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g, "");

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [champStatTab, setChampStatTab] = useState<'nexus' | 'ranked'>('ranked');

  const navigateToSummoner = (riotIdGameName: string, riotIdTagline: string) => {
    if (riotIdGameName && riotIdTagline) {
      router.push(`/matches/summoner/${encodeURIComponent(riotIdGameName)}/${encodeURIComponent(riotIdTagline)}`);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const input = searchInput.trim();
    if (!input) return;

    const hashIndex = input.lastIndexOf("#");
    if (hashIndex === -1) {
      addToast("소환사명#태그 형식으로 입력해주세요 (예: Hide on bush#KR1)", "error");
      return;
    }

    const searchGameName = input.substring(0, hashIndex).trim();
    const searchTagLine = input.substring(hashIndex + 1).trim();

    if (!searchGameName || !searchTagLine) {
      addToast("소환사명#태그 형식으로 입력해주세요 (예: Hide on bush#KR1)", "error");
      return;
    }

    router.push(`/matches/summoner/${encodeURIComponent(searchGameName)}/${encodeURIComponent(searchTagLine)}`);
  };

  // 소환사 기본 정보 (Riot API)
  const { data: summoner, isLoading: isSummonerLoading, error: summonerError } = useQuery<SummonerData>({
    queryKey: ["summoner", gameName, tagLine],
    queryFn: () => riotApi.getSummoner(gameName, tagLine),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  // Nexus 유저 ID 조회
  const { data: nexusUser } = useQuery({
    queryKey: ["nexusUser", gameName, tagLine],
    queryFn: () => statsApi.findUserByRiotAccount(gameName, tagLine),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !!summoner,
  });

  const nexusUserId = nexusUser?.found ? nexusUser.userId : null;

  // Nexus 매치 히스토리
  const { data: nexusMatches = [] } = useQuery<NexusMatchHistory[]>({
    queryKey: ["nexusMatches", nexusUserId],
    queryFn: () => matchApi.getUserMatchHistory(nexusUserId!, 20, 0),
    staleTime: 2 * 60 * 1000,
    enabled: !!nexusUserId,
  });

  // 랭크 챔피언 통계
  const { data: rankedChampionStatsRaw = [], isLoading: isLoadingRankedStats } = useQuery<any[]>({
    queryKey: ["rankedChampionStats", gameName, tagLine],
    queryFn: () => statsApi.getRankedChampionStats(gameName, tagLine),
    staleTime: 10 * 60 * 1000,
    enabled: !!gameName && !!tagLine,
  });

  const { data: nexusRanking } = useQuery({
    queryKey: ["nexusRanking", nexusUserId],
    queryFn: () => rankingApi.getUserRanking(nexusUserId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!nexusUserId,
  });


  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["summoner", gameName, tagLine] });
      await queryClient.invalidateQueries({ queryKey: ["riotMatches", gameName, tagLine] });
      await queryClient.invalidateQueries({ queryKey: ["rankedChampionStats", gameName, tagLine] });
    } catch (err: any) {
      addToast("데이터 새로고침에 실패했습니다.", "error");
    } finally {
      setIsRefreshing(false);
    }
  };

  const calculateWinRate = () => {
    if (!summoner || (!summoner.wins && !summoner.losses)) return 0;
    const total = (summoner.wins || 0) + (summoner.losses || 0);
    if (total === 0) return 0;
    return Math.round(((summoner.wins || 0) / total) * 100);
  };

  const calculateChampionStats = (): ChampionStats[] => {
    const statsMap = new Map<number, ChampionStats>();

    nexusMatches.forEach((match) => {
      const p = match.participant;
      if (!p) return;
      const championId = p.championId;
      const existing = statsMap.get(championId);
      if (existing) {
        existing.games++;
        if (p.win) existing.wins++;
        else existing.losses++;
        existing.kills += p.kills;
        existing.deaths += p.deaths;
        existing.assists += p.assists;
      } else {
        statsMap.set(championId, {
          championId,
          championName: p.championName,
          games: 1,
          wins: p.win ? 1 : 0,
          losses: p.win ? 0 : 1,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
        });
      }
    });

    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  };

  const isLoading = isSummonerLoading;
  const error = summonerError ? ((summonerError as any)?.response?.data?.message || "소환사 정보를 불러오는데 실패했습니다.") : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        {/* 검색 헤더 스켈레톤 */}
        <div className="border-b border-bg-tertiary bg-bg-secondary">
          <div className="container mx-auto px-4 py-3">
            <Skeleton className="h-10 w-80 mx-auto rounded-lg" />
          </div>
        </div>
        <div className="container mx-auto px-4 py-8">
          {/* 소환사 프로필 스켈레톤 */}
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
            <div className="flex items-start gap-6">
              <Skeleton className="w-24 h-24 rounded-xl flex-shrink-0" />
              <div className="flex-grow space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-48" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-32" />
                <div className="flex items-center gap-4 mt-4">
                  <Skeleton className="h-20 w-28 rounded-lg" />
                  <Skeleton className="h-20 w-28 rounded-lg" />
                  <Skeleton className="h-20 w-28 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-48 w-full rounded-xl" />
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
                <Skeleton className="h-7 w-32 mb-4" />
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
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

  if (error || !summoner) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-accent-danger mb-4">{error || "소환사를 찾을 수 없습니다."}</p>
          <Button onClick={() => router.push("/matches")}>
            전적 검색으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const winRate = calculateWinRate();
  const championStats = calculateChampionStats();
  const rankedChampionStats = rankedChampionStatsRaw;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Search Header */}
      <div className="border-b border-bg-tertiary bg-bg-secondary">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/matches"
              className="inline-flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors text-xs sm:text-sm flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">전적 검색</span>
            </Link>

            <form onSubmit={handleSearch} className="flex-1 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-text-tertiary" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="소환사명#태그"
                  className="w-full pl-9 sm:pl-12 pr-3 sm:pr-4 py-2 sm:py-3 bg-bg-tertiary border border-bg-elevated rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors text-sm sm:text-base"
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* Summoner Header */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-start gap-3 sm:gap-6">
            {/* Profile Icon */}
            <div className="relative flex-shrink-0">
              <Image
                src={getProfileIconUrl(summoner.profileIconId)}
                alt="Profile Icon"
                width={96}
                height={96}
                className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl border-2 border-accent-primary"
              />
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-bg-elevated border border-bg-tertiary rounded-full px-2 sm:px-3 py-0.5 sm:py-1">
                <span className="text-[10px] sm:text-xs font-bold text-text-primary">
                  {summoner.summonerLevel}
                </span>
              </div>
            </div>

            {/* Summoner Info */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Name + Nexus link + Refresh */}
              <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4 flex-wrap">
                <h1 className="text-xl sm:text-3xl font-bold text-text-primary">
                  {summoner.gameName}
                  <span className="text-text-tertiary text-base sm:text-3xl">#{summoner.tagLine}</span>
                </h1>
                {nexusUserId && (
                  <Link
                    href={`/matches/user/${nexusUserId}`}
                    className="text-sm text-accent-primary hover:text-accent-hover flex items-center gap-1"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Nexus 프로필
                  </Link>
                )}
                <Button
                  onClick={handleRefresh}
                  variant="secondary"
                  size="sm"
                  disabled={isRefreshing}
                  className="ml-auto"
                >
                  <RefreshCw className={`h-4 w-4 sm:mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">{isRefreshing ? "새로고침 중..." : "새로고침"}</span>
                </Button>
              </div>

              {/* Row 2: Tier / Win Rate / Ladder / Nexus Rank */}
              <div className="flex flex-wrap items-stretch gap-2 sm:gap-3 mb-3 sm:mb-4">
                {summoner.tier && summoner.rank ? (
                  <>
                    <div className="flex items-center gap-2 sm:gap-3 bg-bg-tertiary rounded-lg p-2 sm:p-3">
                      {getTierImage(summoner.tier) && (
                        <Image
                          src={getTierImage(summoner.tier)!}
                          alt={summoner.tier}
                          width={48}
                          height={48}
                          className="w-8 h-8 sm:w-12 sm:h-12"
                        />
                      )}
                      <div>
                        <p className="font-bold text-sm sm:text-base text-text-primary">
                          {summoner.tier} {summoner.rank}
                        </p>
                        <p className="text-xs sm:text-sm text-text-secondary">
                          {summoner.leaguePoints} LP
                        </p>
                      </div>
                    </div>

                    <div className="bg-bg-tertiary rounded-lg p-2 sm:p-3">
                      <p className="text-[10px] sm:text-xs text-text-tertiary mb-0.5 sm:mb-1">승률</p>
                      <p className="text-lg sm:text-2xl font-bold text-accent-primary">
                        {winRate}%
                      </p>
                      <p className="text-[10px] sm:text-xs text-text-tertiary">
                        {summoner.wins}승 {summoner.losses}패
                      </p>
                    </div>
                  </>
                ) : (
                  <Badge variant="secondary">언랭</Badge>
                )}

                {nexusUserId && nexusRanking ? (
                  <div className="bg-bg-tertiary rounded-lg p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-text-tertiary mb-0.5 sm:mb-1 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Nexus 랭킹
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-accent-primary">
                      {nexusRanking.globalRank ? `#${nexusRanking.globalRank}` : '–'}
                    </p>
                    <p className="text-[10px] sm:text-xs text-text-tertiary">
                      {nexusRanking.totalGames}전 {nexusRanking.wins}승 {nexusRanking.losses}패
                    </p>
                  </div>
                ) : (
                  <div className="bg-bg-tertiary rounded-lg p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs text-text-tertiary mb-0.5 sm:mb-1 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Nexus 랭킹
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-text-secondary">–</p>
                    <p className="text-[10px] sm:text-xs text-text-tertiary">
                      {nexusUserId ? "기록 부족" : "미등록"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent Stats Summary (Ranked / Nexus tabs) */}
            <RecentStatsSummary
              gameName={gameName}
              tagLine={tagLine}
              puuid={summoner.puuid}
              nexusMatches={nexusMatches}
            />

            {/* Riot Match List with Queue Type Tabs */}
            <RiotMatchList
              gameName={gameName}
              tagLine={tagLine}
              puuid={summoner.puuid}
              navigateToSummoner={navigateToSummoner}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Champion Stats (tabbed) */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 className="text-sm sm:text-xl font-bold text-text-primary flex items-center gap-2">
                  <Sword className="h-4 w-4 sm:h-5 sm:w-5 text-accent-primary" />
                  챔피언 통계
                </h2>
                <div className="flex gap-1 bg-bg-tertiary/50 rounded-lg p-0.5">
                  <button
                    onClick={() => setChampStatTab('ranked')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                      champStatTab === 'ranked'
                        ? 'bg-accent-primary text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    랭크
                    {isLoadingRankedStats ? (
                      <Loader2 className="h-3 w-3 animate-spin opacity-70" />
                    ) : (
                      <span className={`text-[10px] ${champStatTab === 'ranked' ? 'text-white/70' : 'text-text-tertiary'}`}>
                        {rankedChampionStats.reduce((sum: number, s: any) => sum + s.games, 0)}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setChampStatTab('nexus')}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      champStatTab === 'nexus'
                        ? 'bg-accent-primary text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Nexus
                  </button>
                </div>
              </div>

              {(() => {
                const stats = champStatTab === 'ranked' ? rankedChampionStats : championStats;
                const emptyMsg = champStatTab === 'ranked'
                  ? '랭크 게임 챔피언 통계가 없습니다'
                  : 'Nexus 챔피언 통계가 없습니다';

                if (champStatTab === 'ranked' && isLoadingRankedStats) {
                  return (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg animate-pulse">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-bg-elevated" />
                            <div className="space-y-1.5">
                              <div className="h-3 w-20 bg-bg-elevated rounded" />
                              <div className="h-2.5 w-14 bg-bg-elevated rounded" />
                            </div>
                          </div>
                          <div className="space-y-1.5 items-end flex flex-col">
                            <div className="h-3 w-10 bg-bg-elevated rounded" />
                            <div className="h-2.5 w-12 bg-bg-elevated rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                if (stats.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <p className="text-text-secondary text-sm">{emptyMsg}</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {stats.slice(0, 5).map((stat: any) => {
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
                              className="w-10 h-10 rounded-full flex-shrink-0"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <div>
                              <p className="font-semibold text-text-primary text-sm">
                                {stat.championName}
                              </p>
                              <p className="text-xs text-text-tertiary">
                                {stat.games}게임 · {stat.wins}승 {stat.losses}패
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
                );
              })()}
            </div>

            {/* Overall Stats */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 sm:p-6">
              <h2 className="text-sm sm:text-xl font-bold text-text-primary mb-3 sm:mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-accent-primary" />
                종합 통계
              </h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">총 게임</span>
                  <span className="font-bold text-text-primary">
                    {nexusMatches.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">플레이한 챔피언</span>
                  <span className="font-bold text-text-primary">
                    {championStats.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
