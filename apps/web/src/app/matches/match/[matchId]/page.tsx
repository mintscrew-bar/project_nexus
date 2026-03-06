"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { matchApi } from "@/lib/api-client";
import { Button, Badge, Skeleton } from "@/components/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import {
  ArrowLeft,
  Trophy,
  Clock,
  Loader2,
  Eye,
  Sword,
  Coins,
  Crosshair,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  getChampionIcon,
  getChampionIconById,
  getItemIcon,
  getSummonerSpellIcon,
} from "@/components/matches/match-utils";

// ─── Constants ───────────────────────────────────────

const TEAM_A_COLOR = "#4a90d9";
const TEAM_B_COLOR = "#e84057";

// ─── Types ───────────────────────────────────────────

interface MatchParticipant {
  id: string;
  userId: string;
  teamId: string;
  championId: number;
  championName: string;
  champLevel: number;
  position: string;
  summoner1Id: number;
  summoner2Id: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  goldSpent: number;
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  totalHeal: number;
  damageSelfMitigated: number;
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  detectorWardsPlaced: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  item7?: number;
  perks: any;
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  firstBloodKill: boolean;
  firstTowerKill: boolean;
  turretKills: number;
  inhibitorKills: number;
  dragonKills: number;
  baronKills: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  totalTimeSpentDead: number;
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
  win: boolean;
  baronKills: number;
  dragonKills: number;
  towerKills: number;
  inhibitorKills: number;
  riftHeraldKills: number;
  firstBlood: boolean;
  firstTower: boolean;
  firstBaron: boolean;
  firstDragon: boolean;
  bans: any;
  team: {
    id: string;
    name: string;
    color: string;
  };
}

interface MatchDetails {
  id: string;
  teamAId: string;
  teamBId: string;
  winnerId: string;
  status: string;
  startedAt: string;
  completedAt: string;
  gameDuration: number | null;
  dataCollected: boolean;
  bracketRound: string | null;
  matchNumber: number | null;
  riotMatchId: string | null;
  teamA: {
    id: string;
    name: string;
    color: string;
    members?: any[];
  };
  teamB: {
    id: string;
    name: string;
    color: string;
    members?: any[];
  };
  participants: MatchParticipant[];
  teamStats: TeamStats[];
}

// ─── Helpers ─────────────────────────────────────────

function getTeamAggregates(participants: MatchParticipant[]) {
  return participants.reduce(
    (acc, p) => ({
      kills: acc.kills + p.kills,
      deaths: acc.deaths + p.deaths,
      assists: acc.assists + p.assists,
      gold: acc.gold + p.goldEarned,
      damage: acc.damage + p.totalDamageDealtToChampions,
      vision: acc.vision + p.visionScore,
    }),
    { kills: 0, deaths: 0, assists: 0, gold: 0, damage: 0, vision: 0 }
  );
}

function getCarryScore(p: MatchParticipant) {
  return p.kills * 3 + p.assists + p.totalDamageDealtToChampions / 1000;
}

function getMvpAndAce(
  winTeam: MatchParticipant[],
  loseTeam: MatchParticipant[]
): { mvpId: string | null; aceId: string | null } {
  const mvp = [...winTeam].sort((a, b) => getCarryScore(b) - getCarryScore(a))[0];
  const ace = [...loseTeam].sort((a, b) => getCarryScore(b) - getCarryScore(a))[0];
  return {
    mvpId: mvp?.userId ?? null,
    aceId: ace?.userId ?? null,
  };
}

function getPositionLabel(pos: string): string {
  const map: Record<string, string> = {
    TOP: "탑",
    JUNGLE: "정글",
    MID: "미드",
    MIDDLE: "미드",
    ADC: "원딜",
    BOTTOM: "원딜",
    SUPPORT: "서포터",
    UTILITY: "서포터",
  };
  return map[pos?.toUpperCase()] || pos || "";
}

function getMultiKillBadge(p: MatchParticipant): { label: string; color: string } | null {
  if (p.pentaKills > 0) return { label: "펜타킬", color: "bg-gradient-to-r from-red-500 to-orange-500 text-white" };
  if (p.quadraKills > 0) return { label: "쿼드라킬", color: "bg-gradient-to-r from-purple-500 to-pink-500 text-white" };
  if (p.tripleKills > 0) return { label: "트리플킬", color: "bg-gradient-to-r from-blue-500 to-cyan-500 text-white" };
  return null;
}

// getChampionIconById is imported from match-utils

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function calculateKDA(k: number, d: number, a: number): number {
  if (d === 0) return Infinity;
  return (k + a) / d;
}

function getKDAColor(kda: number): string {
  if (!isFinite(kda) || kda >= 5) return "text-amber-400";
  if (kda >= 3) return "text-emerald-400";
  if (kda >= 2) return "text-cyan-400";
  return "text-text-secondary";
}

function getItemIconUrl(itemId: number): string | null {
  if (itemId === 0) return null;
  return getItemIcon(itemId);
}

// ─── Sub-Components ──────────────────────────────────

function ComparisonBar({
  label,
  icon,
  valueA,
  valueB,
  format,
}: {
  label: string;
  icon: React.ReactNode;
  valueA: number;
  valueB: number;
  format: (v: number) => string;
}) {
  const total = valueA + valueB || 1;
  const pctA = (valueA / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-text-primary">{format(valueA)}</span>
        <span className="text-text-tertiary flex items-center gap-1">
          {icon}
          {label}
        </span>
        <span className="font-bold text-text-primary">{format(valueB)}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-bg-tertiary">
        <div
          className="h-full transition-all duration-500 rounded-l-full"
          style={{ width: `${pctA}%`, backgroundColor: TEAM_A_COLOR }}
        />
        <div
          className="h-full transition-all duration-500 rounded-r-full"
          style={{ width: `${100 - pctA}%`, backgroundColor: TEAM_B_COLOR }}
        />
      </div>
    </div>
  );
}

function ObjectiveIcon({ type, count }: { type: string; count: number }) {
  const icons: Record<string, string> = {
    baron: "🟣",
    dragon: "🐉",
    tower: "🏰",
    herald: "🦀",
    inhibitor: "💎",
  };
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-lg">{icons[type] || "❓"}</span>
      <span className="text-sm font-bold text-text-primary">{count}</span>
      <span className="text-[10px] text-text-tertiary capitalize">{type === "herald" ? "전령" : type === "baron" ? "바론" : type === "dragon" ? "드래곤" : type === "tower" ? "타워" : type === "inhibitor" ? "억제기" : type}</span>
    </div>
  );
}

function FirstBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
        active
          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
          : "bg-bg-tertiary text-text-tertiary/40"
      }`}
    >
      {label}
    </span>
  );
}

function DamageBar({
  value,
  maxValue,
  gradient,
}: {
  value: number;
  maxValue: number;
  gradient: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${gradient}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-text-primary w-12 text-right">
        {(value / 1000).toFixed(1)}k
      </span>
    </div>
  );
}

// ─── Player Card Row ─────────────────────────────────

function PlayerRow({
  participant,
  isWinner,
  isMvp,
  isAce,
  maxDamage,
  gameDuration,
  teamColor,
}: {
  participant: MatchParticipant;
  isWinner: boolean;
  isMvp: boolean;
  isAce: boolean;
  maxDamage: number;
  gameDuration: number;
  teamColor: string;
}) {
  const kda = calculateKDA(participant.kills, participant.deaths, participant.assists);
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const csPerMin = gameDuration > 0 ? (cs / (gameDuration / 60)).toFixed(1) : "0.0";
  const dmgPct = maxDamage > 0 ? (participant.totalDamageDealtToChampions / maxDamage) * 100 : 0;
  const multiKill = getMultiKillBadge(participant);
  const items = [participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5];
  const trinket = participant.item6;
  const questItem = participant.item7;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-l-[3px] transition-colors hover:bg-bg-elevated/50 ${
        isWinner
          ? "bg-emerald-500/[0.04] border-l-emerald-500/60"
          : "bg-red-500/[0.04] border-l-red-500/60"
      }`}
      style={{ borderLeftColor: teamColor + "80" }}
    >
      {/* Champion + Level */}
      <div className="relative flex-shrink-0">
        <Image
          src={getChampionIcon(participant.championName)}
          alt={participant.championName}
          width={48}
          height={48}
          className="w-12 h-12 rounded-lg"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <span className="absolute -bottom-1 -right-1 bg-bg-primary text-text-primary text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center border border-bg-tertiary">
          {participant.champLevel || ""}
        </span>
      </div>

      {/* Summoner Spells (vertical) */}
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <Image
          src={getSummonerSpellIcon(participant.summoner1Id)}
          alt="spell1"
          width={20}
          height={20}
          className="w-5 h-5 rounded"
        />
        <Image
          src={getSummonerSpellIcon(participant.summoner2Id)}
          alt="spell2"
          width={20}
          height={20}
          className="w-5 h-5 rounded"
        />
      </div>

      {/* Username + Position + Badges */}
      <div className="min-w-[100px] w-[110px] flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-sm text-text-primary truncate">
            {participant.user.username}
          </span>
          {isMvp && (
            <span className="px-1 py-0.5 bg-amber-500/90 text-amber-950 text-[9px] font-bold rounded flex-shrink-0">
              MVP
            </span>
          )}
          {isAce && (
            <span className="px-1 py-0.5 bg-purple-500/80 text-white text-[9px] font-bold rounded flex-shrink-0">
              ACE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-text-tertiary">
            {getPositionLabel(participant.position)}
          </span>
          {multiKill && (
            <span className={`px-1 py-0 text-[9px] font-bold rounded ${multiKill.color}`}>
              {multiKill.label}
            </span>
          )}
        </div>
      </div>

      {/* KDA */}
      <div className="w-[90px] text-center flex-shrink-0">
        <p className="text-sm text-text-primary font-medium">
          {participant.kills} / <span className="text-red-400">{participant.deaths}</span> / {participant.assists}
        </p>
        <p className={`text-xs font-bold ${getKDAColor(kda)}`}>
          {kda === Infinity ? "Perfect" : kda.toFixed(2)} KDA
        </p>
      </div>

      {/* CS */}
      <div className="w-[60px] text-center flex-shrink-0 hidden md:block">
        <p className="text-sm font-medium text-text-primary">{cs}</p>
        <p className="text-[10px] text-text-tertiary">{csPerMin}/분</p>
      </div>

      {/* Gold */}
      <div className="w-[55px] text-center flex-shrink-0 hidden md:block">
        <p className="text-sm font-medium text-text-primary">
          {(participant.goldEarned / 1000).toFixed(1)}k
        </p>
      </div>

      {/* Damage Bar */}
      <div className="w-[130px] flex-shrink-0 hidden lg:block">
        <div className="h-3 bg-bg-tertiary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-600 to-orange-500"
            style={{ width: `${dmgPct}%` }}
          />
        </div>
        <p className="text-[10px] text-text-tertiary text-right mt-0.5">
          {(participant.totalDamageDealtToChampions / 1000).toFixed(1)}k
        </p>
      </div>

      {/* Vision */}
      <div className="w-[40px] text-center flex-shrink-0 hidden lg:block">
        <p className="text-sm font-medium text-text-primary">{participant.visionScore}</p>
        <p className="text-[10px] text-text-tertiary">시야</p>
      </div>

      {/* Items */}
      <div className="flex gap-0.5 flex-shrink-0 ml-auto">
        {items.map((itemId, idx) => {
          const icon = getItemIconUrl(itemId);
          return (
            <div
              key={idx}
              className="w-7 h-7 bg-bg-elevated rounded border border-bg-tertiary/50"
            >
              {icon && (
                <Image
                  src={icon}
                  alt={`item${idx}`}
                  width={28}
                  height={28}
                  className="w-full h-full rounded"
                />
              )}
            </div>
          );
        })}
        {/* Trinket separated */}
        <div className="w-7 h-7 bg-bg-elevated rounded-full border border-bg-tertiary/50 ml-0.5">
          {trinket !== 0 && (
            <Image
              src={getItemIcon(trinket)}
              alt="trinket"
              width={28}
              height={28}
              className="w-full h-full rounded-full"
            />
          )}
        </div>
        {/* Quest item */}
        {questItem != null && questItem !== 0 && (
          <div className="w-7 h-7 bg-bg-elevated rounded border border-amber-500/40 ml-0.5">
            <Image
              src={getItemIcon(questItem)}
              alt="quest"
              width={28}
              height={28}
              className="w-full h-full rounded"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Compact Player Row (for large matches) ─────────

function CompactPlayerRow({
  participant,
  isWinner,
  isMvp,
  isAce,
  teamColor,
}: {
  participant: MatchParticipant;
  isWinner: boolean;
  isMvp: boolean;
  isAce: boolean;
  teamColor: string;
}) {
  const kda = calculateKDA(participant.kills, participant.deaths, participant.assists);
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const multiKill = getMultiKillBadge(participant);

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded border-l-2 transition-colors hover:bg-bg-elevated/50 ${
        isWinner
          ? "bg-emerald-500/[0.04] border-l-emerald-500/60"
          : "bg-red-500/[0.04] border-l-red-500/60"
      }`}
      style={{ borderLeftColor: teamColor + "80" }}
    >
      {/* Champion */}
      <Image
        src={getChampionIcon(participant.championName)}
        alt={participant.championName}
        width={32}
        height={32}
        className="w-8 h-8 rounded flex-shrink-0"
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />

      {/* Username + badges */}
      <div className="min-w-[80px] w-[80px] flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className="font-medium text-xs text-text-primary truncate">
            {participant.user.username}
          </span>
          {isMvp && <span className="px-0.5 bg-amber-500/90 text-amber-950 text-[8px] font-bold rounded">MVP</span>}
          {isAce && <span className="px-0.5 bg-purple-500/80 text-white text-[8px] font-bold rounded">ACE</span>}
        </div>
        <span className="text-[10px] text-text-tertiary">{getPositionLabel(participant.position)}</span>
      </div>

      {/* KDA */}
      <div className="w-[70px] text-center flex-shrink-0">
        <p className="text-xs text-text-primary">
          {participant.kills}/{participant.deaths}/{participant.assists}
        </p>
        <p className={`text-[10px] font-bold ${getKDAColor(kda)}`}>
          {kda === Infinity ? "P" : kda.toFixed(1)}
        </p>
      </div>

      {/* CS + Gold */}
      <div className="w-[50px] text-center flex-shrink-0 hidden sm:block">
        <p className="text-xs text-text-primary">{cs}</p>
        <p className="text-[10px] text-text-tertiary">{(participant.goldEarned / 1000).toFixed(1)}k</p>
      </div>

      {/* Damage mini bar */}
      <div className="w-[50px] text-center flex-shrink-0 hidden md:block">
        <p className="text-[10px] text-text-primary">
          {(participant.totalDamageDealtToChampions / 1000).toFixed(1)}k
        </p>
      </div>

      {/* Multi kill badge */}
      {multiKill && (
        <span className={`px-1 py-0 text-[8px] font-bold rounded flex-shrink-0 ${multiKill.color}`}>
          {multiKill.label}
        </span>
      )}

      {/* Items (compact) */}
      <div className="flex gap-px flex-shrink-0 ml-auto items-center">
        {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].map((itemId, idx) => {
          const icon = getItemIconUrl(itemId);
          return (
            <div key={idx} className="w-5 h-5 bg-bg-elevated rounded border border-bg-tertiary/30">
              {icon && (
                <Image src={icon} alt="" width={20} height={20} className="w-full h-full rounded" />
              )}
            </div>
          );
        })}
        {participant.item7 != null && participant.item7 !== 0 && (
          <div className="w-5 h-5 bg-bg-elevated rounded border border-amber-500/40 ml-px">
            <Image src={getItemIcon(participant.item7)} alt="quest" width={20} height={20} className="w-full h-full rounded" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Team Section (collapsible) ─────────────────────

function TeamSection({
  teamName,
  teamColor,
  isWinner,
  participants,
  mvpId,
  aceId,
  maxDamage,
  gameDuration,
  isLargeMatch,
  defaultExpanded,
}: {
  teamName: string;
  teamColor: string;
  isWinner: boolean;
  participants: MatchParticipant[];
  mvpId: string | null;
  aceId: string | null;
  maxDamage: number;
  gameDuration: number;
  isLargeMatch: boolean;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const agg = getTeamAggregates(participants);

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden">
      {/* Team Header (always visible, clickable in large match) */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-4 py-3 ${
          isLargeMatch ? "cursor-pointer hover:bg-bg-elevated/30" : ""
        } transition-colors`}
      >
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor }} />
        <h3 className="text-base font-bold text-text-primary">{teamName}</h3>
        {isWinner && <Trophy className="h-4 w-4 text-amber-400 flex-shrink-0" />}
        <Badge variant={isWinner ? "success" : "danger"} className="text-[10px] flex-shrink-0">
          {isWinner ? "승리" : "패배"}
        </Badge>
        <span className="text-xs text-text-tertiary ml-2">
          {agg.kills}/{agg.deaths}/{agg.assists} · {participants.length}명
        </span>
        <div className="ml-auto flex-shrink-0">
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-text-tertiary" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-tertiary" />
          )}
        </div>
      </button>

      {/* Player List (collapsible) */}
      {expanded && (
        <div className="px-4 pb-4">
          {!isLargeMatch && (
            <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-text-tertiary font-medium uppercase tracking-wider">
              <div className="w-12 flex-shrink-0" />
              <div className="w-5 flex-shrink-0" />
              <div className="w-[110px] flex-shrink-0">플레이어</div>
              <div className="w-[90px] text-center flex-shrink-0">KDA</div>
              <div className="w-[60px] text-center flex-shrink-0 hidden md:block">CS</div>
              <div className="w-[55px] text-center flex-shrink-0 hidden md:block">골드</div>
              <div className="w-[130px] text-center flex-shrink-0 hidden lg:block">딜량</div>
              <div className="w-[40px] text-center flex-shrink-0 hidden lg:block">시야</div>
              <div className="ml-auto flex-shrink-0">아이템</div>
            </div>
          )}
          <div className={isLargeMatch ? "space-y-0.5" : "space-y-1"}>
            {participants.map((p) =>
              isLargeMatch ? (
                <CompactPlayerRow
                  key={p.id}
                  participant={p}
                  isWinner={isWinner}
                  isMvp={p.userId === mvpId}
                  isAce={p.userId === aceId}
                  teamColor={teamColor}
                />
              ) : (
                <PlayerRow
                  key={p.id}
                  participant={p}
                  isWinner={isWinner}
                  isMvp={p.userId === mvpId}
                  isAce={!isWinner && p.userId === aceId}
                  maxDamage={maxDamage}
                  gameDuration={gameDuration}
                  teamColor={teamColor}
                />
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Stats Tabs ───────────────────────────────

function DetailStatsTabs({
  allParticipants,
  gameDuration,
}: {
  allParticipants: MatchParticipant[];
  gameDuration: number;
}) {
  const sorted = [...allParticipants];

  return (
    <Tabs defaultValue="damage" className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
      <TabsList className="mb-4">
        <TabsTrigger value="damage">딜량 상세</TabsTrigger>
        <TabsTrigger value="vision">시야 상세</TabsTrigger>
        <TabsTrigger value="economy">경제</TabsTrigger>
      </TabsList>

      {/* Damage Tab */}
      <TabsContent value="damage">
        <div className="space-y-2">
          <StatBarSection
            title="챔피언 딜량"
            participants={sorted.sort((a, b) => b.totalDamageDealtToChampions - a.totalDamageDealtToChampions)}
            getValue={(p) => p.totalDamageDealtToChampions}
            gradient="bg-gradient-to-r from-red-600 to-orange-500"
          />
          <div className="border-t border-bg-tertiary my-4" />
          <StatBarSection
            title="받은 피해량"
            participants={[...allParticipants].sort((a, b) => b.totalDamageTaken - a.totalDamageTaken)}
            getValue={(p) => p.totalDamageTaken}
            gradient="bg-gradient-to-r from-blue-600 to-cyan-500"
          />
          <div className="border-t border-bg-tertiary my-4" />
          <StatBarSection
            title="회복량"
            participants={[...allParticipants].sort((a, b) => b.totalHeal - a.totalHeal)}
            getValue={(p) => p.totalHeal}
            gradient="bg-gradient-to-r from-green-600 to-emerald-500"
          />
        </div>
      </TabsContent>

      {/* Vision Tab */}
      <TabsContent value="vision">
        <div className="space-y-2">
          <StatBarSection
            title="시야 점수"
            participants={[...allParticipants].sort((a, b) => b.visionScore - a.visionScore)}
            getValue={(p) => p.visionScore}
            gradient="bg-gradient-to-r from-yellow-600 to-amber-500"
            raw
          />
          <div className="border-t border-bg-tertiary my-4" />
          <StatBarSection
            title="와드 설치"
            participants={[...allParticipants].sort((a, b) => b.wardsPlaced - a.wardsPlaced)}
            getValue={(p) => p.wardsPlaced}
            gradient="bg-gradient-to-r from-emerald-600 to-green-500"
            raw
          />
          <div className="border-t border-bg-tertiary my-4" />
          <StatBarSection
            title="와드 제거"
            participants={[...allParticipants].sort((a, b) => b.wardsKilled - a.wardsKilled)}
            getValue={(p) => p.wardsKilled}
            gradient="bg-gradient-to-r from-rose-600 to-pink-500"
            raw
          />
          <div className="border-t border-bg-tertiary my-4" />
          <StatBarSection
            title="제어 와드"
            participants={[...allParticipants].sort((a, b) => b.detectorWardsPlaced - a.detectorWardsPlaced)}
            getValue={(p) => p.detectorWardsPlaced}
            gradient="bg-gradient-to-r from-purple-600 to-violet-500"
            raw
          />
        </div>
      </TabsContent>

      {/* Economy Tab */}
      <TabsContent value="economy">
        <div className="space-y-2">
          <StatBarSection
            title="골드 획득"
            participants={[...allParticipants].sort((a, b) => b.goldEarned - a.goldEarned)}
            getValue={(p) => p.goldEarned}
            gradient="bg-gradient-to-r from-yellow-600 to-amber-500"
          />
          <div className="border-t border-bg-tertiary my-4" />
          <StatBarSection
            title="골드 사용"
            participants={[...allParticipants].sort((a, b) => b.goldSpent - a.goldSpent)}
            getValue={(p) => p.goldSpent}
            gradient="bg-gradient-to-r from-orange-600 to-yellow-500"
          />
          <div className="border-t border-bg-tertiary my-4" />
          <StatBarSection
            title="CS (총)"
            participants={[...allParticipants].sort((a, b) => (b.totalMinionsKilled + b.neutralMinionsKilled) - (a.totalMinionsKilled + a.neutralMinionsKilled))}
            getValue={(p) => p.totalMinionsKilled + p.neutralMinionsKilled}
            gradient="bg-gradient-to-r from-teal-600 to-cyan-500"
            raw
          />
          <div className="border-t border-bg-tertiary my-4" />
          <StatBarSection
            title="CS/분"
            participants={[...allParticipants].sort((a, b) => {
              const csA = (a.totalMinionsKilled + a.neutralMinionsKilled) / Math.max(gameDuration / 60, 1);
              const csB = (b.totalMinionsKilled + b.neutralMinionsKilled) / Math.max(gameDuration / 60, 1);
              return csB - csA;
            })}
            getValue={(p) => {
              const mins = Math.max(gameDuration / 60, 1);
              return (p.totalMinionsKilled + p.neutralMinionsKilled) / mins;
            }}
            gradient="bg-gradient-to-r from-sky-600 to-blue-500"
            formatValue={(v) => v.toFixed(1)}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function StatBarSection({
  title,
  participants,
  getValue,
  gradient,
  raw,
  formatValue,
  defaultShowCount = 5,
}: {
  title: string;
  participants: MatchParticipant[];
  getValue: (p: MatchParticipant) => number;
  gradient: string;
  raw?: boolean;
  formatValue?: (v: number) => string;
  defaultShowCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxVal = Math.max(...participants.map(getValue), 1);
  const needsExpand = participants.length > defaultShowCount;
  const visible = expanded || !needsExpand ? participants : participants.slice(0, defaultShowCount);

  const fmt = (v: number) => {
    if (formatValue) return formatValue(v);
    if (raw) return v.toString();
    return (v / 1000).toFixed(1) + "k";
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-text-secondary mb-2">{title}</h4>
      <div className="space-y-1">
        {visible.map((p) => {
          const val = getValue(p);
          const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
          return (
            <div key={p.id} className="flex items-center gap-2">
              <Image
                src={getChampionIcon(p.championName)}
                alt={p.championName}
                width={20}
                height={20}
                className="w-5 h-5 rounded flex-shrink-0"
              />
              <span className="text-xs text-text-secondary w-16 truncate flex-shrink-0">
                {p.user.username}
              </span>
              <div className="flex-1 h-4 bg-bg-tertiary rounded overflow-hidden">
                <div
                  className={`h-full rounded ${gradient} transition-all duration-300`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-text-primary w-12 text-right flex-shrink-0">
                {fmt(val)}
              </span>
            </div>
          );
        })}
      </div>
      {needsExpand && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-accent-primary hover:text-accent-hover flex items-center gap-1 mx-auto"
        >
          {expanded ? (
            <>접기 <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>나머지 {participants.length - defaultShowCount}명 더 보기 <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────

function MatchSkeleton() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="border-b border-bg-tertiary">
        <div className="container mx-auto px-4 py-4">
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-7xl space-y-4">
        {/* Header skeleton */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden">
          <Skeleton className="h-1 w-full" />
          <div className="p-6 flex items-center justify-between">
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-16 w-24" />
            <Skeleton className="h-12 w-40" />
          </div>
        </div>
        {/* Comparison bars skeleton */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
        {/* Player cards skeleton */}
        {[1, 2].map((t) => (
          <div key={t} className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 space-y-2">
            <Skeleton className="h-6 w-32 mb-2" />
            {[1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="flex items-center gap-3 p-2">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <Skeleton className="w-5 h-11 rounded" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-20 ml-auto" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3 w-24" />
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((k) => (
                    <Skeleton key={k} className="w-7 h-7 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────

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

  if (isLoading) return <MatchSkeleton />;

  if (error || !match) {
    return (
      <div className="flex-grow flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <p className="text-accent-danger mb-4">{error || "매치를 찾을 수 없습니다."}</p>
          <Button onClick={() => router.back()}>돌아가기</Button>
        </div>
      </div>
    );
  }

  // ── Data Not Collected ──
  if (!match.dataCollected && match.participants.length === 0) {
    return (
      <div className="min-h-screen bg-bg-primary">
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
        <div className="container mx-auto px-4 py-16 max-w-7xl">
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-12 text-center">
            <Loader2 className="h-10 w-10 text-accent-primary animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              Riot 게임 데이터가 아직 수집되지 않았습니다
            </h3>
            <p className="text-text-secondary text-sm">
              데이터 수집이 완료되면 상세 정보를 확인할 수 있습니다. 잠시 후 새로고침해 주세요.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived Data ──
  const teamAParticipants = match.participants.filter((p) => p.teamId === match.teamAId);
  const teamBParticipants = match.participants.filter((p) => p.teamId === match.teamBId);
  const teamAStats = match.teamStats.find((ts) => ts.teamId === match.teamAId);
  const teamBStats = match.teamStats.find((ts) => ts.teamId === match.teamBId);
  const isTeamAWinner = match.winnerId === match.teamAId;

  const aggA = getTeamAggregates(teamAParticipants);
  const aggB = getTeamAggregates(teamBParticipants);

  const winTeam = isTeamAWinner ? teamAParticipants : teamBParticipants;
  const loseTeam = isTeamAWinner ? teamBParticipants : teamAParticipants;
  const { mvpId, aceId } = getMvpAndAce(winTeam, loseTeam);

  const allParticipants = match.participants;
  const maxDamage = Math.max(...allParticipants.map((p) => p.totalDamageDealtToChampions), 1);
  const gameDuration = match.gameDuration || 0;

  const isLargeMatch = allParticipants.length > 10;

  const winTeamName = isTeamAWinner ? match.teamA.name : match.teamB.name;
  const loseTeamName = isTeamAWinner ? match.teamB.name : match.teamA.name;
  const winTeamColor = isTeamAWinner ? TEAM_A_COLOR : TEAM_B_COLOR;
  const loseTeamColor = isTeamAWinner ? TEAM_B_COLOR : TEAM_A_COLOR;
  const winTeamStats = isTeamAWinner ? teamAStats : teamBStats;
  const loseTeamStats = isTeamAWinner ? teamBStats : teamAStats;

  // Bans parsing
  const parseBans = (bans: any): number[] => {
    if (!bans) return [];
    if (Array.isArray(bans)) return bans.map((b: any) => (typeof b === "object" ? b.championId : b)).filter(Boolean);
    return [];
  };
  const teamABans = parseBans(teamAStats?.bans);
  const teamBBans = parseBans(teamBStats?.bans);

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

      <div className="container mx-auto px-4 py-6 max-w-7xl space-y-4">
        {/* ──────────── Section 1: Match Header (Scoreboard) ──────────── */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden">
          {/* Team color gradient bar */}
          <div className="h-1 flex">
            <div className="flex-1" style={{ background: `linear-gradient(to right, ${TEAM_A_COLOR}, ${TEAM_A_COLOR}88)` }} />
            <div className="flex-1" style={{ background: `linear-gradient(to left, ${TEAM_B_COLOR}, ${TEAM_B_COLOR}88)` }} />
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between">
              {/* Team A */}
              <div className="flex-1 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  {isTeamAWinner && <Trophy className="h-5 w-5 text-amber-400" />}
                  <h2 className={`text-xl font-bold ${isTeamAWinner ? "text-text-primary" : "text-text-secondary"}`}>
                    {match.teamA.name}
                  </h2>
                </div>
                <Badge variant={isTeamAWinner ? "success" : "danger"} className="text-xs">
                  {isTeamAWinner ? "승리" : "패배"}
                </Badge>
              </div>

              {/* Score */}
              <div className="flex-shrink-0 px-8 text-center">
                <div className="flex items-center gap-3">
                  <span className="text-4xl font-black" style={{ color: TEAM_A_COLOR }}>
                    {aggA.kills}
                  </span>
                  <span className="text-2xl text-text-tertiary font-light">-</span>
                  <span className="text-4xl font-black" style={{ color: TEAM_B_COLOR }}>
                    {aggB.kills}
                  </span>
                </div>
              </div>

              {/* Team B */}
              <div className="flex-1 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <h2 className={`text-xl font-bold ${!isTeamAWinner ? "text-text-primary" : "text-text-secondary"}`}>
                    {match.teamB.name}
                  </h2>
                  {!isTeamAWinner && <Trophy className="h-5 w-5 text-amber-400" />}
                </div>
                <Badge variant={!isTeamAWinner ? "success" : "danger"} className="text-xs">
                  {!isTeamAWinner ? "승리" : "패배"}
                </Badge>
              </div>
            </div>

            {/* Meta info */}
            <div className="flex items-center justify-center gap-4 mt-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(gameDuration)}
              </span>
              <span>•</span>
              <span>{new Date(match.completedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}</span>
              <span>•</span>
              <span>내전 매치</span>
              {match.bracketRound && (
                <>
                  <span>•</span>
                  <span>{match.bracketRound}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ──────────── Section 2: Team Comparison Bars ──────────── */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-5 space-y-3">
          <ComparisonBar
            label="총 킬"
            icon={<Crosshair className="h-3 w-3" />}
            valueA={aggA.kills}
            valueB={aggB.kills}
            format={(v) => v.toString()}
          />
          <ComparisonBar
            label="총 골드"
            icon={<Coins className="h-3 w-3" />}
            valueA={aggA.gold}
            valueB={aggB.gold}
            format={(v) => (v / 1000).toFixed(1) + "k"}
          />
          <ComparisonBar
            label="총 딜량"
            icon={<Sword className="h-3 w-3" />}
            valueA={aggA.damage}
            valueB={aggB.damage}
            format={(v) => (v / 1000).toFixed(1) + "k"}
          />
          <ComparisonBar
            label="시야 점수"
            icon={<Eye className="h-3 w-3" />}
            valueA={aggA.vision}
            valueB={aggB.vision}
            format={(v) => v.toString()}
          />
        </div>

        {/* ──────────── Section 3: Objectives & Firsts ──────────── */}
        {(teamAStats || teamBStats) && (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-5">
            <div className="grid grid-cols-2 gap-6">
              {/* Team A Objectives */}
              <div>
                <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TEAM_A_COLOR }} />
                  {match.teamA.name}
                </h3>
                <div className="flex items-center gap-4 mb-3">
                  <ObjectiveIcon type="baron" count={teamAStats?.baronKills ?? 0} />
                  <ObjectiveIcon type="dragon" count={teamAStats?.dragonKills ?? 0} />
                  <ObjectiveIcon type="tower" count={teamAStats?.towerKills ?? 0} />
                  <ObjectiveIcon type="herald" count={teamAStats?.riftHeraldKills ?? 0} />
                  <ObjectiveIcon type="inhibitor" count={teamAStats?.inhibitorKills ?? 0} />
                </div>
                <div className="flex flex-wrap gap-1">
                  <FirstBadge label="First Blood" active={teamAStats?.firstBlood ?? false} />
                  <FirstBadge label="First Tower" active={teamAStats?.firstTower ?? false} />
                  <FirstBadge label="First Dragon" active={teamAStats?.firstDragon ?? false} />
                  <FirstBadge label="First Baron" active={teamAStats?.firstBaron ?? false} />
                </div>
              </div>

              {/* Team B Objectives */}
              <div>
                <h3 className="text-sm font-semibold text-text-secondary mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TEAM_B_COLOR }} />
                  {match.teamB.name}
                </h3>
                <div className="flex items-center gap-4 mb-3">
                  <ObjectiveIcon type="baron" count={teamBStats?.baronKills ?? 0} />
                  <ObjectiveIcon type="dragon" count={teamBStats?.dragonKills ?? 0} />
                  <ObjectiveIcon type="tower" count={teamBStats?.towerKills ?? 0} />
                  <ObjectiveIcon type="herald" count={teamBStats?.riftHeraldKills ?? 0} />
                  <ObjectiveIcon type="inhibitor" count={teamBStats?.inhibitorKills ?? 0} />
                </div>
                <div className="flex flex-wrap gap-1">
                  <FirstBadge label="First Blood" active={teamBStats?.firstBlood ?? false} />
                  <FirstBadge label="First Tower" active={teamBStats?.firstTower ?? false} />
                  <FirstBadge label="First Dragon" active={teamBStats?.firstDragon ?? false} />
                  <FirstBadge label="First Baron" active={teamBStats?.firstBaron ?? false} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ──────────── Section 4: Bans ──────────── */}
        {(teamABans.length > 0 || teamBBans.length > 0) && (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-5">
            <h3 className="text-sm font-semibold text-text-secondary mb-3">밴</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TEAM_A_COLOR }} />
                  <span className="text-xs text-text-tertiary">{match.teamA.name}</span>
                </div>
                <div className="flex gap-1.5">
                  {teamABans.map((champId, idx) => (
                    <Image
                      key={idx}
                      src={getChampionIconById(champId)}
                      alt={`ban-${champId}`}
                      width={36}
                      height={36}
                      className="w-9 h-9 rounded-lg grayscale opacity-60 border border-bg-tertiary"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ))}
                  {teamABans.length === 0 && (
                    <span className="text-xs text-text-tertiary">밴 정보 없음</span>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TEAM_B_COLOR }} />
                  <span className="text-xs text-text-tertiary">{match.teamB.name}</span>
                </div>
                <div className="flex gap-1.5">
                  {teamBBans.map((champId, idx) => (
                    <Image
                      key={idx}
                      src={getChampionIconById(champId)}
                      alt={`ban-${champId}`}
                      width={36}
                      height={36}
                      className="w-9 h-9 rounded-lg grayscale opacity-60 border border-bg-tertiary"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ))}
                  {teamBBans.length === 0 && (
                    <span className="text-xs text-text-tertiary">밴 정보 없음</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ──────────── Section 5: Player Cards (Winner first) ──────────── */}
        <div className={isLargeMatch ? "" : "overflow-x-auto"}>
          <div className={`${isLargeMatch ? "" : "min-w-[900px]"} space-y-4`}>
            <TeamSection
              teamName={winTeamName}
              teamColor={winTeamColor}
              isWinner={true}
              participants={winTeam}
              mvpId={mvpId}
              aceId={null}
              maxDamage={maxDamage}
              gameDuration={gameDuration}
              isLargeMatch={isLargeMatch}
              defaultExpanded={true}
            />
            <TeamSection
              teamName={loseTeamName}
              teamColor={loseTeamColor}
              isWinner={false}
              participants={loseTeam}
              mvpId={null}
              aceId={aceId}
              maxDamage={maxDamage}
              gameDuration={gameDuration}
              isLargeMatch={isLargeMatch}
              defaultExpanded={!isLargeMatch}
            />
          </div>
        </div>

        {/* ──────────── Section 6: Detailed Stats Tabs ──────────── */}
        <DetailStatsTabs allParticipants={allParticipants} gameDuration={gameDuration} />
      </div>
    </div>
  );
}
