"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { matchApi } from "@/lib/api-client";
import { LoadingSpinner, Button, Badge } from "@/components/ui";
import { ArrowLeft, Trophy, Swords, Clock, Target, Skull } from "lucide-react";
import Link from "next/link";

interface MatchDetails {
  id: string;
  teamAId: string;
  teamBId: string;
  winnerId: string;
  status: string;
  startedAt: string;
  completedAt: string;
  gameDuration: number;
  teamA: {
    id: string;
    name: string;
    color: string;
  };
  teamB: {
    id: string;
    name: string;
    color: string;
  };
  participants: MatchParticipant[];
  teamStats: TeamStats[];
}

interface MatchParticipant {
  id: string;
  userId: string;
  teamId: string;
  championId: number;
  championName: string;
  position: string;
  summoner1Id: number;
  summoner2Id: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  win: boolean;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
}

interface TeamStats {
  id: string;
  teamId: string;
  baronKills: number;
  dragonKills: number;
  towerKills: number;
  inhibitorKills: number;
  riftHeraldKills: number;
  firstBlood: boolean;
  firstTower: boolean;
  firstBaron: boolean;
  firstDragon: boolean;
  team: {
    id: string;
    name: string;
    color: string;
  };
}

export default function MatchDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMatchDetails = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await matchApi.getMatch(matchId);
        setMatch(data);
      } catch (err: any) {
        console.error("Failed to fetch match details:", err);
        setError(err.response?.data?.message || "매치 정보를 불러오는데 실패했습니다.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatchDetails();
  }, [matchId]);

  const getChampionIcon = (championName: string) => {
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
  };

  const getItemIcon = (itemId: number) => {
    if (itemId === 0) return null;
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
  };

  const getSummonerSpellIcon = (spellId: number) => {
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    // Map of common summoner spell IDs
    const spellMap: Record<number, string> = {
      1: "SummonerBoost", // Cleanse
      3: "SummonerExhaust",
      4: "SummonerFlash",
      6: "SummonerHaste", // Ghost
      7: "SummonerHeal",
      11: "SummonerSmite",
      12: "SummonerTeleport",
      14: "SummonerDot", // Ignite
      21: "SummonerBarrier",
    };
    const spellName = spellMap[spellId] || "SummonerFlash";
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spellName}.png`;
  };

  const formatGameDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const calculateKDA = (kills: number, deaths: number, assists: number) => {
    if (deaths === 0) return (kills + assists).toFixed(2);
    return ((kills + assists) / deaths).toFixed(2);
  };

  const getKDAColor = (kda: number) => {
    if (kda >= 5) return "text-accent-gold";
    if (kda >= 3) return "text-accent-success";
    if (kda >= 2) return "text-accent-primary";
    return "text-text-secondary";
  };

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">매치 정보 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-accent-danger mb-4">{error || "매치를 찾을 수 없습니다."}</p>
          <Button onClick={() => router.back()}>돌아가기</Button>
        </div>
      </div>
    );
  }

  const teamAParticipants = match.participants.filter((p) => p.teamId === match.teamAId);
  const teamBParticipants = match.participants.filter((p) => p.teamId === match.teamBId);
  const teamAStats = match.teamStats.find((ts) => ts.teamId === match.teamAId);
  const teamBStats = match.teamStats.find((ts) => ts.teamId === match.teamBId);

  const isTeamAWinner = match.winnerId === match.teamAId;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Back Button */}
      <div className="border-b border-bg-tertiary">
        <div className="container mx-auto px-4 py-4">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            돌아가기
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Match Header */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Clock className="h-6 w-6 text-accent-primary" />
              <div>
                <h1 className="text-2xl font-bold text-text-primary">
                  {match.teamA.name} vs {match.teamB.name}
                </h1>
                <p className="text-text-secondary">
                  {new Date(match.completedAt).toLocaleString("ko-KR")}
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={match.status === "COMPLETED" ? "success" : "primary"}>
                {match.status === "COMPLETED" ? "완료" : "진행 중"}
              </Badge>
              <p className="text-text-secondary mt-2">
                게임 시간: {formatGameDuration(match.gameDuration || 0)}
              </p>
            </div>
          </div>

          {/* Team Stats Summary */}
          {(teamAStats || teamBStats) && (
            <div className="grid grid-cols-2 gap-4 mt-4">
              {/* Team A Stats */}
              <div className={`p-4 rounded-lg ${isTeamAWinner ? "bg-accent-success/10 border-2 border-accent-success" : "bg-bg-tertiary"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-text-primary flex items-center gap-2">
                    {isTeamAWinner && <Trophy className="h-5 w-5 text-accent-gold" />}
                    {match.teamA.name}
                  </h3>
                  <span className={`font-bold ${isTeamAWinner ? "text-accent-success" : "text-accent-danger"}`}>
                    {isTeamAWinner ? "승리" : "패배"}
                  </span>
                </div>
                {teamAStats && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-text-tertiary">바론</p>
                      <p className="font-semibold text-text-primary">{teamAStats.baronKills}</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">드래곤</p>
                      <p className="font-semibold text-text-primary">{teamAStats.dragonKills}</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">타워</p>
                      <p className="font-semibold text-text-primary">{teamAStats.towerKills}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Team B Stats */}
              <div className={`p-4 rounded-lg ${!isTeamAWinner ? "bg-accent-success/10 border-2 border-accent-success" : "bg-bg-tertiary"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-text-primary flex items-center gap-2">
                    {!isTeamAWinner && <Trophy className="h-5 w-5 text-accent-gold" />}
                    {match.teamB.name}
                  </h3>
                  <span className={`font-bold ${!isTeamAWinner ? "text-accent-success" : "text-accent-danger"}`}>
                    {!isTeamAWinner ? "승리" : "패배"}
                  </span>
                </div>
                {teamBStats && (
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-text-tertiary">바론</p>
                      <p className="font-semibold text-text-primary">{teamBStats.baronKills}</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">드래곤</p>
                      <p className="font-semibold text-text-primary">{teamBStats.dragonKills}</p>
                    </div>
                    <div>
                      <p className="text-text-tertiary">타워</p>
                      <p className="font-semibold text-text-primary">{teamBStats.towerKills}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Team A Participants */}
        <ParticipantTable
          team={match.teamA}
          participants={teamAParticipants}
          isWinner={isTeamAWinner}
          getChampionIcon={getChampionIcon}
          getSummonerSpellIcon={getSummonerSpellIcon}
          getItemIcon={getItemIcon}
          calculateKDA={calculateKDA}
          getKDAColor={getKDAColor}
        />

        {/* Team B Participants */}
        <ParticipantTable
          team={match.teamB}
          participants={teamBParticipants}
          isWinner={!isTeamAWinner}
          getChampionIcon={getChampionIcon}
          getSummonerSpellIcon={getSummonerSpellIcon}
          getItemIcon={getItemIcon}
          calculateKDA={calculateKDA}
          getKDAColor={getKDAColor}
        />
      </div>
    </div>
  );
}

interface ParticipantTableProps {
  team: { id: string; name: string; color: string };
  participants: MatchParticipant[];
  isWinner: boolean;
  getChampionIcon: (name: string) => string;
  getSummonerSpellIcon: (id: number) => string;
  getItemIcon: (id: number) => string | null;
  calculateKDA: (k: number, d: number, a: number) => string;
  getKDAColor: (kda: number) => string;
}

function ParticipantTable({
  team,
  participants,
  isWinner,
  getChampionIcon,
  getSummonerSpellIcon,
  getItemIcon,
  calculateKDA,
  getKDAColor,
}: ParticipantTableProps) {
  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
      <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }} />
        {team.name}
        {isWinner && <Trophy className="h-5 w-5 text-accent-gold ml-2" />}
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-bg-tertiary text-sm text-text-tertiary">
              <th className="text-left p-2">플레이어</th>
              <th className="text-center p-2">KDA</th>
              <th className="text-center p-2">CS</th>
              <th className="text-center p-2">골드</th>
              <th className="text-center p-2">딜량</th>
              <th className="text-center p-2">받은 피해</th>
              <th className="text-center p-2">와드</th>
              <th className="text-left p-2">아이템</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((participant) => {
              const kda = parseFloat(calculateKDA(participant.kills, participant.deaths, participant.assists));
              const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;

              return (
                <tr key={participant.id} className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30">
                  <td className="p-2">
                    <div className="flex items-center gap-3">
                      {/* Champion Icon */}
                      <div className="relative">
                        <Image
                          src={getChampionIcon(participant.championName)}
                          alt={participant.championName}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-lg"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        {/* Summoner Spells */}
                        <div className="absolute -right-1 -bottom-1 flex gap-0.5">
                          <Image
                            src={getSummonerSpellIcon(participant.summoner1Id)}
                            alt="Spell 1"
                            width={16}
                            height={16}
                            className="w-4 h-4 rounded"
                          />
                          <Image
                            src={getSummonerSpellIcon(participant.summoner2Id)}
                            alt="Spell 2"
                            width={16}
                            height={16}
                            className="w-4 h-4 rounded"
                          />
                        </div>
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary">{participant.user.username}</p>
                        <p className="text-xs text-text-tertiary">{participant.position}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    <div>
                      <p className="text-text-primary">
                        {participant.kills} / <span className="text-accent-danger">{participant.deaths}</span> / {participant.assists}
                      </p>
                      <p className={`text-sm font-bold ${getKDAColor(kda)}`}>
                        {kda} KDA
                      </p>
                    </div>
                  </td>
                  <td className="p-2 text-center text-text-primary font-medium">{cs}</td>
                  <td className="p-2 text-center text-text-primary font-medium">
                    {(participant.goldEarned / 1000).toFixed(1)}k
                  </td>
                  <td className="p-2 text-center text-text-primary font-medium">
                    {(participant.totalDamageDealtToChampions / 1000).toFixed(1)}k
                  </td>
                  <td className="p-2 text-center text-text-primary font-medium">
                    {(participant.totalDamageTaken / 1000).toFixed(1)}k
                  </td>
                  <td className="p-2 text-center">
                    <div className="text-text-primary">
                      <p className="text-sm">{participant.visionScore}</p>
                      <p className="text-xs text-text-tertiary">
                        {participant.wardsPlaced} / {participant.wardsKilled}
                      </p>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5, participant.item6].map(
                        (itemId, index) => {
                          const itemIcon = getItemIcon(itemId);
                          return (
                            <div
                              key={index}
                              className="w-8 h-8 bg-bg-elevated rounded border border-bg-tertiary flex items-center justify-center"
                            >
                              {itemIcon && (
                                <Image src={itemIcon} alt={`Item ${itemId}`} width={32} height={32} className="w-full h-full rounded" />
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
