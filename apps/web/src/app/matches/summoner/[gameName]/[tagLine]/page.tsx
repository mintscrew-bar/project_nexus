"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { riotApi, matchApi, statsApi } from "@/lib/api-client";
import { LoadingSpinner, Button, Badge } from "@/components/ui";
import { ArrowLeft, Trophy, TrendingUp, Target, Sword, ExternalLink, Loader2, Gamepad2, RefreshCw, Search, ChevronDown, ChevronUp, Shield, Crosshair } from "lucide-react";
import Link from "next/link";

interface SummonerData {
  puuid: string;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
}

interface MatchParticipant {
  id: string;
  matchId: string;
  userId: string;
  championId: number;
  championName: string;
  position: string;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  win: boolean;
  createdAt: string;
  match: {
    id: string;
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    winner: { id: string; name: string };
    completedAt: string;
  };
  team: {
    id: string;
    name: string;
    color: string;
  };
}

interface ChampionStats {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
}

// Summoner Spell ID to Name mapping
const getSummonerSpellName = (spellId: number): string => {
  const spellMap: Record<number, string> = {
    1: 'Boost', // Cleanse
    3: 'Exhaust',
    4: 'Flash',
    6: 'Haste', // Ghost
    7: 'Heal',
    11: 'Smite',
    12: 'Teleport',
    13: 'Mana', // Clarity
    14: 'Dot', // Ignite
    21: 'Barrier',
    30: 'PoroRecall',
    31: 'PoroThrow',
    32: 'Mark', // Snowball
    39: 'UltBook', // Placeholder
    54: 'Summoner_UltBookSmitePlaceholder',
    55: 'Summoner_UltBookFlashPlaceholder',
  };
  return spellMap[spellId] || 'Flash';
};

export default function SummonerStatsPage() {
  const params = useParams();
  const router = useRouter();
  // useParams()에서 받은 값을 명시적으로 디코딩
  const gameName = decodeURIComponent(params.gameName as string);
  const tagLine = decodeURIComponent(params.tagLine as string);

  const [summoner, setSummoner] = useState<SummonerData | null>(null);
  const [matches, setMatches] = useState<MatchParticipant[]>([]);
  const [riotMatches, setRiotMatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRiotMatches, setIsLoadingRiotMatches] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nexusUserId, setNexusUserId] = useState<string | null>(null);
  const [showRiotMatches, setShowRiotMatches] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const [matchDetailTabs, setMatchDetailTabs] = useState<Map<string, 'teams' | 'build' | 'stats'>>(new Map());

  const toggleMatchExpand = (matchId: string) => {
    setExpandedMatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(matchId)) {
        newSet.delete(matchId);
      } else {
        newSet.add(matchId);
      }
      return newSet;
    });
  };

  const navigateToSummoner = (riotIdGameName: string, riotIdTagline: string) => {
    if (riotIdGameName && riotIdTagline) {
      router.push(`/matches/summoner/${encodeURIComponent(riotIdGameName)}/${encodeURIComponent(riotIdTagline)}`);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const input = searchInput.trim();
    if (!input) return;

    // Parse gameName#tagLine format
    const hashIndex = input.lastIndexOf("#");
    if (hashIndex === -1) {
      alert("소환사명#태그 형식으로 입력해주세요 (예: Hide on bush#KR1)");
      return;
    }

    const searchGameName = input.substring(0, hashIndex).trim();
    const searchTagLine = input.substring(hashIndex + 1).trim();

    if (!searchGameName || !searchTagLine) {
      alert("소환사명#태그 형식으로 입력해주세요 (예: Hide on bush#KR1)");
      return;
    }

    router.push(`/matches/summoner/${encodeURIComponent(searchGameName)}/${encodeURIComponent(searchTagLine)}`);
  };

  useEffect(() => {
    fetchSummonerData();
  }, [gameName, tagLine]);

  const fetchSummonerData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch summoner info from Riot API
      const summonerData = await riotApi.getSummoner(gameName, tagLine);
      setSummoner(summonerData);

      // Try to find Nexus user with this Riot account
      try {
        const userResult = await statsApi.findUserByRiotAccount(gameName, tagLine);
        if (userResult.found && userResult.userId) {
          setNexusUserId(userResult.userId);

          // Fetch match history for this user
          const matchHistory = await matchApi.getUserMatchHistory(userResult.userId, 20, 0);
          setMatches(matchHistory);
        }
      } catch (err) {
        console.log("No Nexus user found for this summoner");
        setMatches([]);
      }

      // Auto-fetch Riot match history
      await fetchRiotMatches();
    } catch (err: any) {
      console.error("Failed to fetch summoner data:", err);
      setError(err.response?.data?.message || "소환사 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRiotMatches = async () => {
    setIsLoadingRiotMatches(true);
    try {
      const matches = await statsApi.getSummonerRiotMatches(gameName, tagLine, 10);
      setRiotMatches(matches);
      setShowRiotMatches(true);
    } catch (err: any) {
      console.error("Failed to fetch Riot matches:", err);
      alert("Riot 전적을 불러오는데 실패했습니다.");
    } finally {
      setIsLoadingRiotMatches(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Re-fetch summoner data
      const summonerData = await riotApi.getSummoner(gameName, tagLine);
      setSummoner(summonerData);

      // Re-fetch Riot matches
      if (showRiotMatches) {
        await fetchRiotMatches();
      }
    } catch (err: any) {
      console.error("Failed to refresh data:", err);
      alert("데이터 새로고침에 실패했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const getProfileIconUrl = (iconId: number) => {
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
  };

  const getTierImage = (tier?: string) => {
    if (!tier) return null;
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    return `https://raw.communitydragon.org/${version}/plugins/rcp-fe-lol-shared-components/global/default/${tier.toLowerCase()}.png`;
  };

  const getChampionIcon = (championName: string) => {
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
  };

  const getQueueTypeName = (queueId: number) => {
    const queueTypes: { [key: number]: string } = {
      420: "솔로 랭크",
      440: "자유 랭크",
      450: "칼바람 나락",
      400: "일반 게임",
      430: "일반 게임",
      900: "URF",
      1020: "단일 챔피언",
      1700: "아레나",
    };
    return queueTypes[queueId] || "기타 게임";
  };

  const calculateWinRate = () => {
    if (!summoner || (!summoner.wins && !summoner.losses)) return 0;
    const total = (summoner.wins || 0) + (summoner.losses || 0);
    if (total === 0) return 0;
    return Math.round(((summoner.wins || 0) / total) * 100);
  };

  const calculateChampionStats = (): ChampionStats[] => {
    const statsMap = new Map<number, ChampionStats>();

    matches.forEach((match) => {
      const existing = statsMap.get(match.championId);
      if (existing) {
        existing.games++;
        if (match.win) existing.wins++;
        else existing.losses++;
        existing.kills += match.kills;
        existing.deaths += match.deaths;
        existing.assists += match.assists;
        existing.cs += match.totalMinionsKilled + match.neutralMinionsKilled;
      } else {
        statsMap.set(match.championId, {
          championId: match.championId,
          championName: match.championName,
          games: 1,
          wins: match.win ? 1 : 0,
          losses: match.win ? 0 : 1,
          kills: match.kills,
          deaths: match.deaths,
          assists: match.assists,
          cs: match.totalMinionsKilled + match.neutralMinionsKilled,
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

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Search Header */}
      <div className="border-b border-bg-tertiary bg-bg-secondary">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Link
              href="/matches"
              className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              전적 검색
            </Link>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="소환사명#태그 (예: Hide on bush#KR1)"
                  className="w-full pl-10 pr-4 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors text-sm"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 bg-accent-primary hover:bg-accent-hover text-white rounded text-xs font-medium transition-colors"
                >
                  검색
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Summoner Header */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
          <div className="flex items-start gap-6">
            {/* Profile Icon */}
            <div className="relative">
              <img
                src={getProfileIconUrl(summoner.profileIconId)}
                alt="Profile Icon"
                className="w-24 h-24 rounded-xl border-2 border-accent-primary"
              />
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-bg-elevated border border-bg-tertiary rounded-full px-3 py-1">
                <span className="text-xs font-bold text-text-primary">
                  {summoner.summonerLevel}
                </span>
              </div>
            </div>

            {/* Summoner Info */}
            <div className="flex-grow">
              <div className="flex items-center gap-3 mb-2">
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
              </div>

              <div className="flex items-center gap-4 mt-4">
                {summoner.tier && summoner.rank ? (
                  <>
                    {/* Tier Badge */}
                    <div className="flex items-center gap-3 bg-bg-tertiary rounded-lg p-3">
                      {getTierImage(summoner.tier) && (
                        <img
                          src={getTierImage(summoner.tier)!}
                          alt={summoner.tier}
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

                    {/* Win Rate */}
                    <div className="bg-bg-tertiary rounded-lg p-3">
                      <p className="text-sm text-text-secondary mb-1">승률</p>
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

                {/* Refresh Button */}
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
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Match History */}
          <div className="lg:col-span-2">
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-accent-primary" />
                최근 전적
              </h2>

              {matches.length === 0 ? (
                <div className="text-center py-16">
                  <Target className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    Nexus 플랫폼 매치 기록이 없습니다
                  </h3>
                  <p className="text-text-secondary mb-4">
                    이 소환사는 아직 Nexus 토너먼트에 참가하지 않았습니다.
                  </p>
                  <p className="text-sm text-text-tertiary">
                    💡 Nexus에서 토너먼트에 참가하면 여기에 전적이 표시됩니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {matches.map((match) => {
                    const kda = match.deaths === 0
                      ? match.kills + match.assists
                      : ((match.kills + match.assists) / match.deaths).toFixed(2);

                    return (
                      <Link
                        key={match.matchId}
                        href={`/matches/match/${match.matchId}`}
                        className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                          match.win
                            ? "bg-accent-success/10 border border-accent-success/30 hover:bg-accent-success/20"
                            : "bg-accent-danger/10 border border-accent-danger/30 hover:bg-accent-danger/20"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {/* Champion Icon */}
                          <img
                            src={getChampionIcon(match.championName)}
                            alt={match.championName}
                            className="w-12 h-12 rounded-lg"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder-champion.png";
                            }}
                          />

                          {/* Match Info */}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={match.win ? "success" : "danger"}>
                                {match.win ? "승리" : "패배"}
                              </Badge>
                              <span className="text-sm text-text-secondary">
                                {match.position}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-text-primary">
                              {match.championName}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {match.team.name}
                            </p>
                          </div>
                        </div>

                        {/* KDA */}
                        <div className="text-right">
                          <p className="font-semibold text-text-primary">
                            {match.kills} / {match.deaths} / {match.assists}
                          </p>
                          <p className="text-sm text-text-secondary">
                            {kda} KDA
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Riot Match History */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mt-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-accent-primary" />
                Riot 게임 전적
              </h2>

              {isLoadingRiotMatches ? (
                <div className="text-center py-16">
                  <Loader2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 animate-spin" />
                  <p className="text-text-secondary">Riot 전적을 불러오는 중...</p>
                </div>
              ) : !showRiotMatches ? (
                <div className="text-center py-16">
                  <Gamepad2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    전적 불러오기 실패
                  </h3>
                  <p className="text-text-secondary mb-4">
                    Riot 전적을 불러올 수 없습니다
                  </p>
                  <Button onClick={fetchRiotMatches}>다시 시도</Button>
                </div>
              ) : riotMatches.length === 0 ? (
                <div className="text-center py-16">
                  <Target className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    최근 전적이 없습니다
                  </h3>
                  <p className="text-text-secondary">
                    최근 플레이한 게임이 없습니다
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {riotMatches.map((match) => {
                    // Find the participant data for this summoner
                    const participant = match.info.participants.find(
                      (p: any) => p.puuid === summoner?.puuid
                    );

                    if (!participant) return null;

                    const matchId = match.metadata.matchId;
                    const isExpanded = expandedMatches.has(matchId);

                    const kda = participant.deaths === 0
                      ? participant.kills + participant.assists
                      : ((participant.kills + participant.assists) / participant.deaths).toFixed(2);

                    const gameDurationMin = Math.floor(match.info.gameDuration / 60);
                    const gameDurationSec = match.info.gameDuration % 60;
                    const csPerMin = ((participant.totalMinionsKilled + participant.neutralMinionsKilled) / (match.info.gameDuration / 60)).toFixed(1);

                    // Calculate time ago
                    const gameEndTime = new Date(match.info.gameEndTimestamp);
                    const now = new Date();
                    const hoursAgo = Math.floor((now.getTime() - gameEndTime.getTime()) / (1000 * 60 * 60));
                    const daysAgo = Math.floor(hoursAgo / 24);
                    const timeAgo = daysAgo > 0 ? `${daysAgo}일 전` : `${hoursAgo}시간 전`;

                    // Calculate kill participation
                    const team = match.info.teams.find((t: any) => t.teamId === participant.teamId);
                    const teamKills = team?.objectives?.champion?.kills || 1;
                    const killParticipation = ((participant.kills + participant.assists) / teamKills * 100).toFixed(0);

                    // Split teams
                    const myTeam = match.info.participants.filter((p: any) => p.teamId === participant.teamId);
                    const enemyTeam = match.info.participants.filter((p: any) => p.teamId !== participant.teamId);
                    const myTeamWon = participant.win;

                    return (
                      <div
                        key={matchId}
                        className={`rounded-lg overflow-hidden transition-all ${
                          participant.win
                            ? "bg-accent-success/[0.03]"
                            : "bg-accent-danger/[0.03]"
                        }`}
                      >
                        {/* Match Header - Clickable to expand */}
                        <div
                          className={`px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-black/5 transition-colors ${
                            participant.win ? "bg-accent-success/[0.08]" : "bg-accent-danger/[0.08]"
                          }`}
                          onClick={() => toggleMatchExpand(matchId)}
                        >
                          {/* Champion Icon */}
                          <img
                            src={getChampionIcon(participant.championName)}
                            alt={participant.championName}
                            className="w-10 h-10 rounded-lg"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder-champion.png";
                            }}
                          />

                          {/* Game Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-bold text-sm ${
                                participant.win ? "text-accent-success" : "text-accent-danger"
                              }`}>
                                {participant.win ? "승리" : "패배"}
                              </span>
                              <span className="text-xs text-text-secondary">{getQueueTypeName(match.info.queueId)}</span>
                              <span className="text-xs text-text-tertiary">{gameDurationMin}:{gameDurationSec.toString().padStart(2, '0')}</span>
                              <span className="text-xs text-text-tertiary">• {timeAgo}</span>
                            </div>
                            <div className="text-xs text-text-tertiary">
                              {participant.championName} • {participant.teamPosition || "FILL"}
                            </div>
                          </div>

                          {/* KDA */}
                          <div className="text-center">
                            <div className="text-xs font-bold text-text-primary">
                              {participant.kills} / <span className="text-accent-danger">{participant.deaths}</span> / {participant.assists}
                            </div>
                            <div className="text-[10px] text-text-secondary">
                              {kda} KDA
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="hidden sm:flex items-center gap-3 text-xs text-text-tertiary">
                            <span>CS {participant.totalMinionsKilled + participant.neutralMinionsKilled}</span>
                            <span>킬관여 {killParticipation}%</span>
                          </div>

                          {/* Items (compact) */}
                          <div className="hidden md:flex gap-0.5">
                            {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].map((item, idx) => (
                              <div
                                key={idx}
                                className="w-5 h-5 rounded bg-bg-tertiary border border-bg-elevated"
                              >
                                {item !== 0 && (
                                  <img
                                    src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/item/${item}.png`}
                                    alt="item"
                                    className="w-full h-full rounded"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Expand Icon */}
                          <div className="text-text-tertiary">
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                          </div>
                        </div>

                        {/* Expanded Content - Tabs for Teams, Build, Stats */}
                        {isExpanded && (
                          <div className={`border-t ${
                            participant.win ? "border-accent-success/20" : "border-accent-danger/20"
                          }`}>
                            {/* Tab Navigation */}
                            <div className="flex border-b border-bg-tertiary bg-bg-tertiary/30">
                              {(['teams', 'build', 'stats'] as const).map((tab) => (
                                <button
                                  key={tab}
                                  onClick={() => {
                                    const newTabs = new Map(matchDetailTabs);
                                    newTabs.set(matchId, tab);
                                    setMatchDetailTabs(newTabs);
                                  }}
                                  className={`px-4 py-2 text-xs font-medium transition-colors relative ${
                                    (matchDetailTabs.get(matchId) || 'teams') === tab
                                      ? 'text-accent-primary'
                                      : 'text-text-secondary hover:text-text-primary'
                                  }`}
                                >
                                  {tab === 'teams' ? '팀 상세' : tab === 'build' ? '빌드' : '통계'}
                                  {(matchDetailTabs.get(matchId) || 'teams') === tab && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
                                  )}
                                </button>
                              ))}
                            </div>

                            {/* Teams Tab */}
                            {(matchDetailTabs.get(matchId) || 'teams') === 'teams' && (() => {
                              // Calculate carry scores for ranking
                              const allParticipants = match.info.participants;
                              const sortedByCarry = [...allParticipants].sort((a: any, b: any) => {
                                const scoreA = (a.kills * 3 + a.assists * 1.5) / Math.max(a.deaths, 1) + a.totalDamageDealtToChampions / 10000;
                                const scoreB = (b.kills * 3 + b.assists * 1.5) / Math.max(b.deaths, 1) + b.totalDamageDealtToChampions / 10000;
                                return scoreB - scoreA;
                              });
                              const carryRanks = new Map(sortedByCarry.map((p: any, idx: number) => [p.puuid, idx + 1]));

                              // Max damage for bar width calculation
                              const maxDamage = Math.max(...allParticipants.map((p: any) => p.totalDamageDealtToChampions));

                              const renderPlayerRow = (p: any, isMe: boolean, teamWon: boolean, index: number) => {
                                const pKda = p.deaths === 0 ? p.kills + p.assists : ((p.kills + p.assists) / p.deaths).toFixed(2);
                                const pCs = p.totalMinionsKilled + p.neutralMinionsKilled;
                                const pCsPerMin = (pCs / (match.info.gameDuration / 60)).toFixed(1);
                                const carryRank = carryRanks.get(p.puuid) || 10;
                                const damagePercent = (p.totalDamageDealtToChampions / maxDamage) * 100;
                                const killParticipation = ((p.kills + p.assists) / Math.max(teamKills, 1) * 100).toFixed(0);

                                // ACE/MVP 표시
                                const isAce = carryRank === 1;
                                const isMvp = carryRank <= 2 && teamWon;

                                return (
                                  <div
                                    key={p.puuid}
                                    className={`flex items-center gap-2 py-1 px-2 transition-all text-xs ${
                                      isMe
                                        ? "bg-accent-primary/[0.12] border-l-2 border-accent-primary"
                                        : index % 2 === 0
                                        ? (teamWon ? "bg-accent-success/[0.01]" : "bg-accent-danger/[0.01]")
                                        : (teamWon ? "bg-accent-success/[0.05]" : "bg-accent-danger/[0.05]")
                                    } ${!isMe && "hover:bg-bg-tertiary/40 cursor-pointer"}`}
                                    onClick={() => {
                                      if (!isMe && p.riotIdGameName && p.riotIdTagline) {
                                        navigateToSummoner(p.riotIdGameName, p.riotIdTagline);
                                      }
                                    }}
                                  >
                                    {/* Champion + Spells + Runes - Compact */}
                                    <div className="flex items-center gap-0.5">
                                      <div className="relative">
                                        <img
                                          src={getChampionIcon(p.championName)}
                                          alt={p.championName}
                                          className="w-9 h-9 rounded"
                                          onError={(e) => { e.currentTarget.src = "/placeholder-champion.png"; }}
                                        />
                                        <span className="absolute -bottom-0.5 -right-0.5 bg-bg-primary/90 text-[8px] px-0.5 rounded text-text-primary font-bold border border-bg-elevated">
                                          {p.champLevel}
                                        </span>
                                      </div>

                                      {/* Spells + Runes */}
                                      <div className="flex gap-0.5">
                                        <div className="flex flex-col gap-0.5">
                                          <img
                                            src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/spell/Summoner${getSummonerSpellName(p.summoner1Id)}.png`}
                                            alt="spell1"
                                            className="w-3.5 h-3.5 rounded"
                                            onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                          />
                                          <img
                                            src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/spell/Summoner${getSummonerSpellName(p.summoner2Id)}.png`}
                                            alt="spell2"
                                            className="w-3.5 h-3.5 rounded"
                                            onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                          />
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                          {p.perks?.styles?.[0]?.selections?.[0]?.perk && (
                                            <img
                                              src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${p.perks.styles[0].selections[0].perk}.png`}
                                              alt="primary rune"
                                              className="w-3.5 h-3.5 rounded-full bg-bg-primary"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          )}
                                          {p.perks?.styles?.[1]?.style && (
                                            <img
                                              src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${p.perks.styles[1].style}.png`}
                                              alt="secondary rune"
                                              className="w-3.5 h-3.5 rounded-full bg-bg-primary opacity-60"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Summoner Name */}
                                    <div className={`flex-1 min-w-0 ${isMe ? "text-accent-primary font-medium" : "text-text-primary"}`}>
                                      <span className="truncate block text-xs">
                                        {p.riotIdGameName || p.summonerName || "Unknown"}
                                        {p.riotIdTagline && <span className="text-text-tertiary text-[10px]">#{p.riotIdTagline}</span>}
                                      </span>
                                    </div>

                                    {/* ACE/MVP Badge - More Prominent */}
                                    <div className="flex items-center gap-1">
                                      {isAce && (
                                        <span className="flex-shrink-0 px-2 py-0.5 bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border border-amber-400/50 text-amber-300 text-[10px] font-bold rounded">
                                          ACE
                                        </span>
                                      )}
                                      {isMvp && !isAce && (
                                        <span className="flex-shrink-0 px-2 py-0.5 bg-gradient-to-r from-blue-500/30 to-cyan-500/30 border border-blue-400/50 text-blue-300 text-[10px] font-bold rounded">
                                          MVP
                                        </span>
                                      )}
                                    </div>

                                    {/* Carry Rank + Kill Participation */}
                                    <div className="flex items-center gap-2 w-16">
                                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                        carryRank === 1 ? "bg-amber-500/40 text-amber-200 border border-amber-400/50" :
                                        carryRank === 2 ? "bg-gray-400/40 text-gray-200 border border-gray-400/50" :
                                        carryRank === 3 ? "bg-orange-400/40 text-orange-200 border border-orange-400/50" :
                                        "bg-bg-elevated text-text-tertiary"
                                      }`}>
                                        {carryRank}
                                      </div>
                                      <div className="text-[11px] font-medium text-text-secondary">
                                        {killParticipation}%
                                      </div>
                                    </div>

                                    {/* KDA */}
                                    <div className="w-20 text-center">
                                      <div className="font-bold text-xs">
                                        {p.kills}/<span className="text-accent-danger">{p.deaths}</span>/{p.assists}
                                      </div>
                                      <div className="text-[9px] text-text-tertiary">{pKda} KDA</div>
                                    </div>

                                    {/* Damage */}
                                    <div className="w-24">
                                      <div className="flex justify-between text-[9px] mb-0.5">
                                        <span className="text-text-tertiary">딜량</span>
                                        <span className="text-accent-danger font-semibold">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}k</span>
                                      </div>
                                      <div className="h-1 bg-bg-elevated rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-gradient-to-r from-red-600 to-orange-500"
                                          style={{ width: `${damagePercent}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* CS */}
                                    <div className="w-14 text-center">
                                      <div className="font-medium text-xs">{pCs}</div>
                                      <div className="text-[9px] text-text-tertiary">{pCsPerMin}/m</div>
                                    </div>

                                    {/* Items - Compact */}
                                    <div className="flex gap-0.5">
                                      {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((item: number, idx: number) => (
                                        <div key={idx} className={`w-4 h-4 ${idx === 6 ? 'rounded-full' : 'rounded'} bg-bg-primary border border-bg-tertiary`}>
                                          {item !== 0 && (
                                            <img
                                              src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/item/${item}.png`}
                                              alt="item"
                                              className={`w-full h-full ${idx === 6 ? 'rounded-full' : 'rounded'}`}
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              };

                              return (
                                <div className="p-3">
                                  {/* My Team Section */}
                                  <div className={`mb-1.5 rounded ${
                                    myTeamWon ? "bg-accent-success/[0.06]" : "bg-accent-danger/[0.06]"
                                  }`}>
                                    <div className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1 ${
                                      myTeamWon ? "text-accent-success" : "text-accent-danger"
                                    }`}>
                                      <Shield className="h-3 w-3" />
                                      <span className={myTeamWon ? "text-accent-success" : "text-accent-danger"}>
                                        {myTeamWon ? "승리" : "패배"}
                                      </span>
                                      <span className="text-text-tertiary font-normal text-[10px]">(아군)</span>
                                      <span className="text-text-secondary font-normal text-[10px] ml-auto">
                                        {myTeam.reduce((sum: number, p: any) => sum + p.kills, 0)} / {myTeam.reduce((sum: number, p: any) => sum + p.deaths, 0)} / {myTeam.reduce((sum: number, p: any) => sum + p.assists, 0)}
                                      </span>
                                    </div>
                                    <div>
                                      {myTeam.map((p: any, idx: number) => renderPlayerRow(p, p.puuid === summoner?.puuid, myTeamWon, idx))}
                                    </div>
                                  </div>

                                  {/* Enemy Team Section */}
                                  <div className={`rounded ${
                                    !myTeamWon ? "bg-accent-success/[0.06]" : "bg-accent-danger/[0.06]"
                                  }`}>
                                    <div className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1 ${
                                      !myTeamWon ? "text-accent-success" : "text-accent-danger"
                                    }`}>
                                      <Crosshair className="h-3 w-3" />
                                      <span className={!myTeamWon ? "text-accent-success" : "text-accent-danger"}>
                                        {!myTeamWon ? "승리" : "패배"}
                                      </span>
                                      <span className="text-text-tertiary font-normal text-[10px]">(적군)</span>
                                      <span className="text-text-secondary font-normal text-[10px] ml-auto">
                                        {enemyTeam.reduce((sum: number, p: any) => sum + p.kills, 0)} / {enemyTeam.reduce((sum: number, p: any) => sum + p.deaths, 0)} / {enemyTeam.reduce((sum: number, p: any) => sum + p.assists, 0)}
                                      </span>
                                    </div>
                                    <div>
                                      {enemyTeam.map((p: any, idx: number) => renderPlayerRow(p, false, !myTeamWon, idx))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Build Tab */}
                            {matchDetailTabs.get(matchId) === 'build' && (
                              <div className="p-4">
                                <h3 className="text-sm font-bold text-text-primary mb-3">아이템 빌드 순서</h3>
                                <div className="space-y-3">
                                  {/* Item Timeline - This would need timeline data from API */}
                                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                                    <span className="w-12 text-text-tertiary">0:00</span>
                                    <div className="flex gap-1">
                                      {[participant.item0, participant.item1].filter(i => i !== 0).map((item, idx) => (
                                        <img
                                          key={idx}
                                          src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/item/${item}.png`}
                                          alt="item"
                                          className="w-8 h-8 rounded border border-bg-tertiary"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                  <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded">
                                    💡 상세한 아이템 구매 타임라인은 추가 API 데이터가 필요합니다.
                                  </div>
                                </div>

                                <h3 className="text-sm font-bold text-text-primary mb-3 mt-6">최종 빌드</h3>
                                <div className="flex gap-2">
                                  {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5, participant.item6].map((item, idx) => (
                                    <div key={idx} className={`${idx === 6 ? 'rounded-full' : 'rounded'} bg-bg-tertiary`}>
                                      {item !== 0 ? (
                                        <img
                                          src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/item/${item}.png`}
                                          alt="item"
                                          className={`w-12 h-12 ${idx === 6 ? 'rounded-full' : 'rounded'} border-2 border-bg-elevated`}
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                      ) : (
                                        <div className={`w-12 h-12 ${idx === 6 ? 'rounded-full' : 'rounded'} border-2 border-bg-elevated bg-bg-secondary`} />
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Stats Tab */}
                            {matchDetailTabs.get(matchId) === 'stats' && (
                              <div className="p-4">
                                <div className="grid grid-cols-2 gap-4">
                                  {/* Left Column - Combat Stats */}
                                  <div>
                                    <h3 className="text-sm font-bold text-text-primary mb-3">전투 통계</h3>
                                    <div className="space-y-2 text-xs">
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">총 피해량</span>
                                        <span className="font-semibold text-text-primary">{(participant.totalDamageDealtToChampions).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">받은 피해량</span>
                                        <span className="font-semibold text-text-primary">{(participant.totalDamageTaken || 0).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">치유량</span>
                                        <span className="font-semibold text-text-primary">{(participant.totalHeal || 0).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">CC 시간</span>
                                        <span className="font-semibold text-text-primary">{(participant.timeCCingOthers || 0).toFixed(0)}초</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Column - Economy Stats */}
                                  <div>
                                    <h3 className="text-sm font-bold text-text-primary mb-3">경제 통계</h3>
                                    <div className="space-y-2 text-xs">
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">획득 골드</span>
                                        <span className="font-semibold text-accent-gold">{(participant.goldEarned).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">분당 골드</span>
                                        <span className="font-semibold text-accent-gold">{(participant.goldEarned / (match.info.gameDuration / 60)).toFixed(0)}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">CS</span>
                                        <span className="font-semibold text-text-primary">{participant.totalMinionsKilled + participant.neutralMinionsKilled}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">분당 CS</span>
                                        <span className="font-semibold text-text-primary">{csPerMin}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Graph Placeholder */}
                                <div className="mt-6">
                                  <h3 className="text-sm font-bold text-text-primary mb-3">타임라인 그래프</h3>
                                  <div className="bg-bg-tertiary/50 p-8 rounded-lg text-center">
                                    <p className="text-xs text-text-tertiary">
                                      📊 분당 골드, CS, 경험치 그래프는 timeline API 데이터가 필요합니다.
                                    </p>
                                    <p className="text-[10px] text-text-tertiary mt-2">
                                      timeline 엔드포인트: /lol/match/v5/matches/{'{matchId}'}/timeline
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Champion Statistics */}
          <div className="space-y-6">
            {/* Champion Stats */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <Sword className="h-5 w-5 text-accent-primary" />
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
                          <div className="w-10 h-10 bg-bg-elevated rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-text-primary">
                              {stat.championName.substring(0, 2)}
                            </span>
                          </div>
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
                    {matches.length}
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
