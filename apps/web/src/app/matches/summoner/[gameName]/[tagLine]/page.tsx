"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { riotApi, matchApi, statsApi } from "@/lib/api-client";
import { LoadingSpinner, Button, Badge } from "@/components/ui";
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
  const gameName = decodeURIComponent(params.gameName as string);
  const tagLine = decodeURIComponent(params.tagLine as string);

  const [summoner, setSummoner] = useState<SummonerData | null>(null);
  const [nexusMatches, setNexusMatches] = useState<NexusMatchHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nexusUserId, setNexusUserId] = useState<string | null>(null);
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

  useEffect(() => {
    const fetchSummonerData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const summonerData = await riotApi.getSummoner(gameName, tagLine);
        setSummoner(summonerData);

        try {
          const userResult = await statsApi.findUserByRiotAccount(gameName, tagLine);
          if (userResult.found && userResult.userId) {
            setNexusUserId(userResult.userId);

            const matchHistory = await matchApi.getUserMatchHistory(userResult.userId, 20, 0);
            setNexusMatches(matchHistory);
          }
        } catch (err) {
          console.log("No Nexus user found for this summoner");
          setNexusMatches([]);
        }
      } catch (err: any) {
        console.error("Failed to fetch summoner data:", err);
        setError(err.response?.data?.message || "소환사 정보를 불러오는데 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSummonerData();
  }, [gameName, tagLine]);

  // 랭크 챔피언 통계
  const { data: rankedChampionStatsRaw = [], isLoading: isLoadingRankedStats } = useQuery<any[]>({
    queryKey: ["rankedChampionStats", gameName, tagLine],
    queryFn: () => statsApi.getRankedChampionStats(gameName, tagLine),
    staleTime: 10 * 60 * 1000,
    enabled: !!gameName && !!tagLine,
  });

  const { data: seasonTiers = [] } = useQuery<any[]>({
    queryKey: ["seasonTiers", gameName, tagLine],
    queryFn: () => statsApi.getSeasonTiers(gameName, tagLine),
    staleTime: 60 * 60 * 1000,
    enabled: !!gameName && !!tagLine,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const summonerData = await riotApi.getSummoner(gameName, tagLine);
      setSummoner(summonerData);
      await queryClient.invalidateQueries({ queryKey: ["riotMatches", gameName, tagLine] });
    } catch (err: any) {
      console.error("Failed to refresh data:", err);
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

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">소환사 정보 불러오는 중...</p>
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
          <div className="relative flex items-center justify-center">
            <Link
              href="/matches"
              className="absolute left-0 inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              전적 검색
            </Link>

            <form onSubmit={handleSearch} className="w-full max-w-xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-tertiary" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="소환사명#태그 (예: Hide on bush#KR1)"
                  className="w-full pl-12 pr-4 py-3 bg-bg-tertiary border border-bg-elevated rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors text-base"
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 py-8">
        {/* Summoner Header */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
          <div className="flex items-start gap-6">
            {/* Profile Icon */}
            <div className="relative">
              <Image
                src={getProfileIconUrl(summoner.profileIconId)}
                alt="Profile Icon"
                width={96}
                height={96}
                className="w-24 h-24 rounded-xl border-2 border-accent-primary"
              />
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-bg-elevated border border-bg-tertiary rounded-full px-3 py-1">
                <span className="text-xs font-bold text-text-primary">
                  {summoner.summonerLevel}
                </span>
              </div>
            </div>

            {/* Summoner Info */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Name + Nexus link + Refresh */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <h1 className="text-3xl font-bold text-text-primary">
                  {summoner.gameName}
                  <span className="text-text-tertiary">#{summoner.tagLine}</span>
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
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "새로고침 중..." : "새로고침"}
                </Button>
              </div>

              {/* Row 2: Tier / Win Rate / Ladder / Nexus Rank */}
              <div className="flex flex-wrap items-stretch gap-3 mb-4">
                {summoner.tier && summoner.rank ? (
                  <>
                    <div className="flex items-center gap-3 bg-bg-tertiary rounded-lg p-3">
                      {getTierImage(summoner.tier) && (
                        <Image
                          src={getTierImage(summoner.tier)!}
                          alt={summoner.tier}
                          width={48}
                          height={48}
                          className="w-12 h-12"
                        />
                      )}
                      <div>
                        <p className="font-bold text-text-primary">
                          {summoner.tier} {summoner.rank}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {summoner.leaguePoints} LP
                        </p>
                      </div>
                    </div>

                    <div className="bg-bg-tertiary rounded-lg p-3">
                      <p className="text-xs text-text-tertiary mb-1">승률</p>
                      <p className="text-2xl font-bold text-accent-primary">
                        {winRate}%
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {summoner.wins}승 {summoner.losses}패
                      </p>
                    </div>
                  </>
                ) : (
                  <Badge variant="secondary">언랭</Badge>
                )}

                <div className="bg-bg-tertiary rounded-lg p-3">
                  <p className="text-xs text-text-tertiary mb-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    래더 랭킹
                  </p>
                  <p className="text-xl font-bold text-text-secondary">–</p>
                  <p className="text-xs text-text-tertiary">준비 중</p>
                </div>

                <div className="bg-bg-tertiary rounded-lg p-3">
                  <p className="text-xs text-text-tertiary mb-1 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Nexus 랭킹
                  </p>
                  <p className="text-xl font-bold text-text-secondary">–</p>
                  <p className="text-xs text-text-tertiary">
                    {nexusUserId ? "등록됨" : "미등록"}
                  </p>
                </div>
              </div>

              {/* Row 3: Season Tier History */}
              <div className="pt-3 border-t border-bg-tertiary/50">
                <p className="text-xs text-text-tertiary mb-2 font-medium tracking-wide">시즌별 티어</p>
                <div className="flex flex-wrap gap-2">
                  {/* S2026 — current season */}
                  <div className="flex items-center gap-1.5 bg-bg-tertiary/70 rounded-lg px-2.5 py-2">
                    {summoner.tier && getTierImage(summoner.tier) ? (
                      <Image src={getTierImage(summoner.tier)!} alt={summoner.tier} width={24} height={24} className="w-6 h-6" />
                    ) : (
                      <div className="w-6 h-6 rounded bg-bg-elevated" />
                    )}
                    <div>
                      <p className="text-[10px] text-text-tertiary leading-none mb-0.5">S2026</p>
                      <p className="text-xs font-bold text-text-primary leading-none">
                        {summoner.tier ? `${summoner.tier.charAt(0)}${summoner.rank}` : '언랭'}
                      </p>
                    </div>
                  </div>
                  {/* Past seasons */}
                  {['S2025', 'S2024', 'S2023', 'S2022'].map((season) => {
                    const saved = seasonTiers.find((t: any) => t.season === season);
                    return saved ? (
                      <div key={season} className="flex items-center gap-1.5 bg-bg-tertiary/70 rounded-lg px-2.5 py-2">
                        {getTierImage(saved.tier) ? (
                          <Image src={getTierImage(saved.tier)!} alt={saved.tier} width={24} height={24} className="w-6 h-6" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-bg-elevated" />
                        )}
                        <div>
                          <p className="text-[10px] text-text-tertiary leading-none mb-0.5">{season}</p>
                          <p className="text-xs font-bold text-text-primary leading-none">
                            {saved.tier.charAt(0)}{saved.rank}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div key={season} className="flex items-center gap-1.5 bg-bg-tertiary/30 rounded-lg px-2.5 py-2 opacity-50">
                        <div className="w-6 h-6 rounded bg-bg-elevated flex items-center justify-center">
                          <span className="text-[9px] text-text-tertiary">?</span>
                        </div>
                        <div>
                          <p className="text-[10px] text-text-tertiary leading-none mb-0.5">{season}</p>
                          <p className="text-xs font-medium text-text-tertiary leading-none">–</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  <Sword className="h-5 w-5 text-accent-primary" />
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
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent-primary" />
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
