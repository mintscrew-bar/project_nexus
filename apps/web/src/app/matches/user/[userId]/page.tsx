"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { userApi, matchApi, statsApi } from "@/lib/api-client";
import { LoadingSpinner, Button, Badge } from "@/components/ui";
import { ArrowLeft, User, Trophy, Target, TrendingUp, Calendar, Loader2, Gamepad2 } from "lucide-react";
import Link from "next/link";

interface UserData {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
  createdAt: string;
}

interface MatchHistory {
  matchId: string;
  match: {
    id: string;
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    winner: { id: string; name: string };
    completedAt: string;
  };
  participant: {
    championId: number;
    championName: string;
    position: string;
    kills: number;
    deaths: number;
    assists: number;
    win: boolean;
    kda: number;
  };
  team: {
    id: string;
    name: string;
    color: string;
  };
}

interface RiotAccount {
  id: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
  isPrimary: boolean;
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
}

export default function UserStatsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;

  const [user, setUser] = useState<UserData | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [riotAccounts, setRiotAccounts] = useState<RiotAccount[]>([]);
  const [riotMatches, setRiotMatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRiotMatches, setIsLoadingRiotMatches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRiotMatches, setShowRiotMatches] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, [userId]);

  const fetchUserData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch user info
      const userData = await userApi.getProfile(userId);
      setUser(userData);

      // Fetch match history
      const matches = await matchApi.getUserMatchHistory(userId, 20, 0);
      setMatchHistory(matches);

      // Fetch riot accounts
      try {
        const accounts = await statsApi.getUserRiotAccounts(userId);
        setRiotAccounts(accounts);
      } catch (err) {
        console.log("Failed to fetch Riot accounts:", err);
        setRiotAccounts([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch user data:", err);
      setError(err.response?.data?.message || "유저 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRiotMatches = async () => {
    setIsLoadingRiotMatches(true);
    try {
      const matches = await statsApi.getUserRiotMatches(userId, 10);
      setRiotMatches(matches);
      setShowRiotMatches(true);
    } catch (err: any) {
      console.error("Failed to fetch Riot matches:", err);
      alert("Riot 전적을 불러오는데 실패했습니다. Riot 계정이 연동되어 있는지 확인해주세요.");
    } finally {
      setIsLoadingRiotMatches(false);
    }
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

  const calculateStats = () => {
    const totalGames = matchHistory.length;
    const wins = matchHistory.filter((m) => m.participant.win).length;
    const losses = totalGames - wins;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    let totalKills = 0;
    let totalDeaths = 0;
    let totalAssists = 0;

    matchHistory.forEach((m) => {
      totalKills += m.participant.kills;
      totalDeaths += m.participant.deaths;
      totalAssists += m.participant.assists;
    });

    const avgKDA =
      totalGames > 0 && totalDeaths > 0
        ? ((totalKills + totalAssists) / totalDeaths / totalGames).toFixed(2)
        : totalGames > 0
        ? ((totalKills + totalAssists) / totalGames).toFixed(2)
        : "0.00";

    return { totalGames, wins, losses, winRate, avgKDA };
  };

  const calculateChampionStats = (): ChampionStats[] => {
    const statsMap = new Map<number, ChampionStats>();

    matchHistory.forEach((match) => {
      const existing = statsMap.get(match.participant.championId);
      if (existing) {
        existing.games++;
        if (match.participant.win) existing.wins++;
        else existing.losses++;
        existing.kills += match.participant.kills;
        existing.deaths += match.participant.deaths;
        existing.assists += match.participant.assists;
      } else {
        statsMap.set(match.participant.championId, {
          championId: match.participant.championId,
          championName: match.participant.championName,
          games: 1,
          wins: match.participant.win ? 1 : 0,
          losses: match.participant.win ? 0 : 1,
          kills: match.participant.kills,
          deaths: match.participant.deaths,
          assists: match.participant.assists,
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
          <p className="text-text-secondary mt-4">유저 정보 불러오는 중...</p>
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
  const championStats = calculateChampionStats();

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
                <img
                  src={user.avatar}
                  alt={user.username}
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
              <h1 className="text-3xl font-bold text-text-primary mb-2">
                {user.username}
              </h1>
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
                        {account.tier} {account.rank} - {account.leaguePoints} LP
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
          {/* Match History */}
          <div className="lg:col-span-2">
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-accent-primary" />
                최근 전적
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
                        {/* Champion Icon */}
                        <img
                          src={getChampionIcon(match.participant.championName)}
                          alt={match.participant.championName}
                          className="w-12 h-12 rounded-lg"
                          onError={(e) => {
                            e.currentTarget.src = "/placeholder-champion.png";
                          }}
                        />

                        {/* Match Info */}
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

                      {/* KDA */}
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
                </div>
              )}
            </div>

            {/* Riot Match History */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5 text-accent-primary" />
                  Riot 게임 전적
                </h2>
                {!showRiotMatches && riotAccounts.length > 0 && (
                  <Button
                    onClick={fetchRiotMatches}
                    variant="secondary"
                    size="sm"
                    disabled={isLoadingRiotMatches}
                  >
                    {isLoadingRiotMatches ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        불러오는 중...
                      </>
                    ) : (
                      "전적 불러오기"
                    )}
                  </Button>
                )}
              </div>

              {!showRiotMatches ? (
                <div className="text-center py-16">
                  <Gamepad2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    Riot 게임 전적
                  </h3>
                  <p className="text-text-secondary mb-4">
                    솔로 랭크, 자유 랭크, 일반 게임 등의 전적을 확인할 수 있습니다
                  </p>
                  {riotAccounts.length === 0 ? (
                    <p className="text-sm text-text-tertiary">
                      Riot 계정을 연동해야 전적을 볼 수 있습니다
                    </p>
                  ) : (
                    <Button onClick={fetchRiotMatches} disabled={isLoadingRiotMatches}>
                      {isLoadingRiotMatches ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          불러오는 중...
                        </>
                      ) : (
                        "전적 불러오기"
                      )}
                    </Button>
                  )}
                </div>
              ) : isLoadingRiotMatches ? (
                <div className="text-center py-16">
                  <Loader2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 animate-spin" />
                  <p className="text-text-secondary">Riot 전적을 불러오는 중...</p>
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
                <div className="space-y-3">
                  {riotMatches.map((match) => {
                    // Find the participant data for this user
                    const userAccount = riotAccounts.find(acc =>
                      match.info.participants.some((p: any) => p.puuid === acc.puuid)
                    );
                    const participant = match.info.participants.find(
                      (p: any) => p.puuid === userAccount?.puuid
                    );

                    if (!participant) return null;

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
                    const team100 = match.info.participants.filter((p: any) => p.teamId === 100);
                    const team200 = match.info.participants.filter((p: any) => p.teamId === 200);

                    return (
                      <div
                        key={match.metadata.matchId}
                        className={`border rounded-lg overflow-hidden ${
                          participant.win
                            ? "border-accent-success/30 bg-accent-success/5"
                            : "border-accent-danger/30 bg-accent-danger/5"
                        }`}
                      >
                        {/* Match Header */}
                        <div className={`px-4 py-2 flex items-center justify-between border-b ${
                          participant.win ? "border-accent-success/20" : "border-accent-danger/20"
                        }`}>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold ${
                              participant.win ? "text-accent-success" : "text-accent-danger"
                            }`}>
                              {participant.win ? "승리" : "패배"}
                            </span>
                            <span className="text-sm text-text-secondary">{getQueueTypeName(match.info.queueId)}</span>
                            <span className="text-xs text-text-tertiary">{timeAgo}</span>
                          </div>
                          <div className="text-sm text-text-secondary">
                            {gameDurationMin}분 {gameDurationSec}초
                          </div>
                        </div>

                        {/* Match Body */}
                        <div className="p-4">
                          <div className="flex items-center gap-6">
                            {/* Champion & Spells */}
                            <div className="flex items-center gap-2">
                              <img
                                src={getChampionIcon(participant.championName)}
                                alt={participant.championName}
                                className="w-14 h-14 rounded-lg"
                                onError={(e) => {
                                  e.currentTarget.src = "/placeholder-champion.png";
                                }}
                              />
                            </div>

                            {/* KDA & Stats */}
                            <div className="flex-1">
                              <div className="flex items-center gap-4 mb-2">
                                <div>
                                  <div className="text-lg font-bold text-text-primary">
                                    {participant.kills} / <span className="text-accent-danger">{participant.deaths}</span> / {participant.assists}
                                  </div>
                                  <div className="text-sm text-text-secondary">
                                    {kda} KDA • {killParticipation}% 킬관여
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 text-xs text-text-tertiary">
                                <span>CS {participant.totalMinionsKilled + participant.neutralMinionsKilled} ({csPerMin}/분)</span>
                                <span>시야 {participant.visionScore}</span>
                                <span>{participant.teamPosition || "UNKNOWN"}</span>
                              </div>
                            </div>

                            {/* Items */}
                            <div className="flex gap-1">
                              {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5, participant.item6].map((item, idx) => (
                                <div
                                  key={idx}
                                  className="w-7 h-7 rounded bg-bg-tertiary border border-bg-elevated flex items-center justify-center"
                                >
                                  {item !== 0 && (
                                    <img
                                      src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/item/${item}.png`}
                                      alt="item"
                                      className="w-full h-full"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Teams */}
                          <div className="mt-4 pt-4 border-t border-bg-tertiary">
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              {/* Team 1 */}
                              <div className="space-y-1">
                                {team100.map((p: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className={`flex items-center gap-2 px-2 py-1 rounded ${
                                      p.puuid === userAccount?.puuid ? "bg-accent-primary/10" : ""
                                    }`}
                                  >
                                    <img
                                      src={getChampionIcon(p.championName)}
                                      alt={p.championName}
                                      className="w-4 h-4 rounded"
                                      onError={(e) => {
                                        e.currentTarget.src = "/placeholder-champion.png";
                                      }}
                                    />
                                    <span className={`flex-1 truncate ${
                                      p.puuid === userAccount?.puuid ? "font-bold text-text-primary" : "text-text-secondary"
                                    }`}>
                                      {p.summonerName || p.riotIdGameName || "Unknown"}
                                    </span>
                                    <span className="text-text-tertiary">
                                      {p.kills}/{p.deaths}/{p.assists}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {/* Team 2 */}
                              <div className="space-y-1">
                                {team200.map((p: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className={`flex items-center gap-2 px-2 py-1 rounded ${
                                      p.puuid === userAccount?.puuid ? "bg-accent-primary/10" : ""
                                    }`}
                                  >
                                    <img
                                      src={getChampionIcon(p.championName)}
                                      alt={p.championName}
                                      className="w-4 h-4 rounded"
                                      onError={(e) => {
                                        e.currentTarget.src = "/placeholder-champion.png";
                                      }}
                                    />
                                    <span className={`flex-1 truncate ${
                                      p.puuid === userAccount?.puuid ? "font-bold text-text-primary" : "text-text-secondary"
                                    }`}>
                                      {p.summonerName || p.riotIdGameName || "Unknown"}
                                    </span>
                                    <span className="text-text-tertiary">
                                      {p.kills}/{p.deaths}/{p.assists}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
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
                          <img
                            src={getChampionIcon(stat.championName)}
                            alt={stat.championName}
                            className="w-10 h-10 rounded-lg"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder-champion.png";
                            }}
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
