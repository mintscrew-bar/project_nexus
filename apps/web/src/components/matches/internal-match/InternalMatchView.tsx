"use client";

import { userProfilePath } from "@/lib/profile-routes";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useGamePrefix } from "@/hooks/useCurrentGame";
import { matchApi, statsApi } from "@/lib/api-client";
import { TeamGoldChart } from "./TeamGoldChart";
import { Button, Badge, Skeleton } from "@/components/ui";
import {
  Trophy,
  Clock,
  Loader2,
  Eye,
  Sword,
  Coins,
  Crosshair,
  ChevronDown,
  ChevronUp,
  Info,
  Ban,
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
  // 로스터와 매칭되지 않은 참가자(부계정·대타)는 null — riotIdSnapshot 으로만 표시
  userId: string | null;
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
  riotIdSnapshot?: string | null;
  // 골드 차이 그래프에서 Riot 타임라인 참가자를 팀으로 나눌 때 쓴다
  puuid?: string | null;
  riotTeamId?: number | null;
  user: {
    id: string;
    username: string;
    avatar?: string;
  } | null;
}

/**
 * 표시 이름. Nexus 계정이 없으면 경기 당시 Riot 게임이름을 쓴다.
 * 이런 참가자는 나중에 그 Riot 계정이 등록되면 계정에 연결된다.
 */
function participantName(p: MatchParticipant): string {
  return p.user?.username ?? p.riotIdSnapshot?.split("#")[0] ?? "알 수 없음";
}

/**
 * 참가자 이름 — 누르면 그 사람 전적으로 간다.
 * 넥서스 계정이 있으면 넥서스 유저 전적(내전+일반), 미연동이면 경기 당시
 * Riot ID 의 소환사 전적. 둘 다 없으면 링크 없이 이름만.
 */
function ParticipantNameLink({
  participant,
  className,
}: {
  participant: MatchParticipant;
  className: string;
}) {
  const gamePrefix = useGamePrefix();
  const name = participantName(participant);
  const [gameName, tagLine] = participant.riotIdSnapshot?.split("#") ?? [];
  const href = participant.user
    ? userProfilePath(participant.user.id, "LOL")
    : gameName && tagLine
      ? `${gamePrefix}/matches/summoner/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
      : null;

  if (!href) return <span className={className}>{name}</span>;
  return (
    <Link
      href={href}
      // 전적 목록에서 펼친 행 안에 있으므로 행 접힘 클릭으로 번지지 않게 한다
      onClick={(e) => e.stopPropagation()}
      className={`${className} hover:underline hover:text-accent-primary`}
    >
      {name}
    </Link>
  );
}

/** Nexus 계정과 아직 연결되지 않은 참가자 표시 */
function UnlinkedBadge({ participant }: { participant: MatchParticipant }) {
  if (participant.user) return null;
  return (
    <span
      className="px-1 py-0.5 rounded bg-bg-tertiary text-text-tertiary text-[9px] font-medium flex-shrink-0"
      title={`${participant.riotIdSnapshot ?? "Riot 계정"} — Nexus 계정에 아직 연결되지 않음. 이 Riot 계정을 등록하면 전적에 잡힙니다.`}
    >
      미연동
    </span>
  );
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

export interface MatchDetails {
  id: string;
  roomName?: string | null;
  winnerName?: string | null;
  updatedAt?: string;
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
  tournamentCode: string | null;
  // 수동 사설방 픽/밴 스냅샷 (Spectator 기반). 개인 스탯은 Riot이 제공하지 않는다.
  draftOnly?: boolean;
  draftSnapshots?: DraftSnapshot[];
  draftBans?: { championId: number; teamId: number; pickTurn: number }[] | null;
  liveStartedAt?: string | null;
}

interface DraftSnapshot {
  id: string;
  puuid?: string;
  userId: string | null;
  username: string | null;
  riotTeamId: number;
  teamIdSnapshot: string | null;
  championId: number;
  spell1Id: number;
  spell2Id: number;
  user?: { id: string; username: string; avatar: string | null } | null;
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
    { kills: 0, deaths: 0, assists: 0, gold: 0, damage: 0, vision: 0 },
  );
}

function getCarryScore(p: MatchParticipant) {
  return p.kills * 3 + p.assists + p.totalDamageDealtToChampions / 1000;
}

function getMvpAndAce(
  winTeam: MatchParticipant[],
  loseTeam: MatchParticipant[],
): { mvpId: string | null; aceId: string | null } {
  const mvp = [...winTeam].sort(
    (a, b) => getCarryScore(b) - getCarryScore(a),
  )[0];
  const ace = [...loseTeam].sort(
    (a, b) => getCarryScore(b) - getCarryScore(a),
  )[0];
  return {
    // 참가자 행 id 로 판별한다. userId 는 미연동 참가자면 null 이라
    // null === null 로 여러 명이 동시에 MVP 로 찍힌다.
    mvpId: mvp?.id ?? null,
    aceId: ace?.id ?? null,
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

function getMultiKillBadge(
  p: MatchParticipant,
): { label: string; color: string } | null {
  if (p.pentaKills > 0)
    return {
      label: "펜타킬",
      color: "bg-gradient-to-r from-red-500 to-orange-500 text-white",
    };
  if (p.quadraKills > 0)
    return {
      label: "쿼드라킬",
      color: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
    };
  if (p.tripleKills > 0)
    return {
      label: "트리플킬",
      color: "bg-gradient-to-r from-blue-500 to-cyan-500 text-white",
    };
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

/**
 * 팀 비교 한 줄 — 가운데 지표 이름을 기준으로 두 팀 막대가 바깥쪽으로 뻗는다.
 *
 * 2026-11-04 한 줄 막대를 두 색으로 나눠 칠하던 방식에서 바꿨다. 나눠 칠하면
 * 비율은 보여도 "얼마나 앞섰나"가 잘 안 읽혔다. 큰 쪽을 꽉 찬 길이로 잡아
 * 차이가 막대 길이로 바로 보이게 한다. 앞선 팀 숫자만 진하게 둔다.
 */
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
  // 양쪽 다 0이면 막대 없이 숫자만 보인다
  const max = Math.max(valueA, valueB);
  const widthA = max > 0 ? (valueA / max) * 100 : 0;
  const widthB = max > 0 ? (valueB / max) * 100 : 0;
  const leadA = valueA > valueB;
  const leadB = valueB > valueA;
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_88px_minmax(0,1fr)_64px] items-center gap-x-3">
      <span
        className={`text-right text-sm tabular-nums ${leadA ? "font-bold" : "text-text-secondary"}`}
        style={leadA ? { color: TEAM_A_COLOR } : undefined}
      >
        {format(valueA)}
      </span>
      <div className="flex h-2.5 justify-end rounded-sm bg-bg-tertiary/40">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{
            width: `${widthA}%`,
            backgroundColor: TEAM_A_COLOR,
            opacity: leadA ? 1 : 0.55,
          }}
        />
      </div>
      <span className="flex items-center justify-center gap-1 text-xs text-text-tertiary">
        {icon}
        {label}
      </span>
      <div className="flex h-2.5 rounded-sm bg-bg-tertiary/40">
        <div
          className="h-full rounded-sm transition-all duration-500"
          style={{
            width: `${widthB}%`,
            backgroundColor: TEAM_B_COLOR,
            opacity: leadB ? 1 : 0.55,
          }}
        />
      </div>
      <span
        className={`text-sm tabular-nums ${leadB ? "font-bold" : "text-text-secondary"}`}
        style={leadB ? { color: TEAM_B_COLOR } : undefined}
      >
        {format(valueB)}
      </span>
    </div>
  );
}

// 롤 클라이언트 전적 화면의 공식 오브젝트 아이콘 (CommunityDragon 에서 받아
// public/icons/objectives 에 둠). 팀색 두 벌이 있다: -100 블루, -200 레드.
// 라벨도 한국 클라이언트 표기를 따른다.
const OBJECTIVES = {
  tower: "포탑",
  inhibitor: "억제기",
  dragon: "드래곤",
  herald: "협곡의 전령",
  baron: "내셔 남작",
} as const;

function ObjectiveIcon({
  type,
  count,
  side,
}: {
  type: keyof typeof OBJECTIVES;
  count: number;
  /** 아이콘 색 — 팀 A(블루색) 100, 팀 B(레드색) 200 */
  side: 100 | 200;
}) {
  const label = OBJECTIVES[type];
  return (
    <div
      className={`flex items-center gap-1.5 ${count === 0 ? "opacity-40" : ""}`}
      title={`${label} ${count}`}
    >
      <Image
        src={`/icons/objectives/${type}-${side}.png`}
        alt={label}
        width={20}
        height={20}
        className="w-5 h-5"
        unoptimized
      />
      <span className="text-sm font-bold text-text-primary tabular-nums">
        {count}
      </span>
    </div>
  );
}

function FirstBadge({ label, active }: { label: string; active: boolean }) {
  if (!active) return null;
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
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
  const kda = calculateKDA(
    participant.kills,
    participant.deaths,
    participant.assists,
  );
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const csPerMin =
    gameDuration > 0 ? (cs / (gameDuration / 60)).toFixed(1) : "0.0";
  const dmgPct =
    maxDamage > 0
      ? (participant.totalDamageDealtToChampions / maxDamage) * 100
      : 0;
  const multiKill = getMultiKillBadge(participant);
  const items = [
    participant.item0,
    participant.item1,
    participant.item2,
    participant.item3,
    participant.item4,
    participant.item5,
  ];
  const trinket = participant.item6;
  const questItem = participant.item7;

  return (
    <div
      // 왼쪽 색 막대 대신 승패 색을 옅게 깐 둥근 칸 + 줄 간격으로 구분한다 (내전 기록 줄과 같은 방식)
      className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors hover:bg-bg-elevated/50 ${
        isWinner ? "bg-accent-success/[0.07]" : "bg-accent-danger/[0.07]"
      }`}
    >
      {/* Champion + Level */}
      <div className="relative flex-shrink-0">
        <Image
          src={getChampionIcon(participant.championName)}
          alt={participant.championName}
          width={48}
          height={48}
          className="w-12 h-12 rounded-lg"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
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
          <ParticipantNameLink
            participant={participant}
            className="font-semibold text-sm text-text-primary truncate"
          />
          <UnlinkedBadge participant={participant} />
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
            <span
              className={`px-1 py-0 text-[9px] font-bold rounded ${multiKill.color}`}
            >
              {multiKill.label}
            </span>
          )}
        </div>
      </div>

      {/* KDA */}
      <div className="w-[90px] text-center flex-shrink-0">
        <p className="text-sm text-text-primary font-medium">
          {participant.kills} /{" "}
          <span className="text-red-400">{participant.deaths}</span> /{" "}
          {participant.assists}
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
        <p className="text-sm font-medium text-text-primary">
          {participant.visionScore}
        </p>
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
  const kda = calculateKDA(
    participant.kills,
    participant.deaths,
    participant.assists,
  );
  const cs = participant.totalMinionsKilled + participant.neutralMinionsKilled;
  const multiKill = getMultiKillBadge(participant);

  return (
    <div
      // 왼쪽 색 막대 대신 승패 색을 옅게 깐 둥근 칸으로 구분한다
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors hover:bg-bg-elevated/50 ${
        isWinner ? "bg-accent-success/[0.07]" : "bg-accent-danger/[0.07]"
      }`}
    >
      {/* Champion */}
      <Image
        src={getChampionIcon(participant.championName)}
        alt={participant.championName}
        width={32}
        height={32}
        className="w-8 h-8 rounded flex-shrink-0"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />

      {/* Username + badges */}
      <div className="min-w-[80px] w-[80px] flex-shrink-0">
        <div className="flex items-center gap-1">
          <ParticipantNameLink
            participant={participant}
            className="font-medium text-xs text-text-primary truncate"
          />
          <UnlinkedBadge participant={participant} />
          {isMvp && (
            <span className="px-0.5 bg-amber-500/90 text-amber-950 text-[8px] font-bold rounded">
              MVP
            </span>
          )}
          {isAce && (
            <span className="px-0.5 bg-purple-500/80 text-white text-[8px] font-bold rounded">
              ACE
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-tertiary">
          {getPositionLabel(participant.position)}
        </span>
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
        <p className="text-[10px] text-text-tertiary">
          {(participant.goldEarned / 1000).toFixed(1)}k
        </p>
      </div>

      {/* Damage mini bar */}
      <div className="w-[50px] text-center flex-shrink-0 hidden md:block">
        <p className="text-[10px] text-text-primary">
          {(participant.totalDamageDealtToChampions / 1000).toFixed(1)}k
        </p>
      </div>

      {/* Multi kill badge */}
      {multiKill && (
        <span
          className={`px-1 py-0 text-[8px] font-bold rounded flex-shrink-0 ${multiKill.color}`}
        >
          {multiKill.label}
        </span>
      )}

      {/* Items (compact) */}
      <div className="flex gap-px flex-shrink-0 ml-auto items-center">
        {[
          participant.item0,
          participant.item1,
          participant.item2,
          participant.item3,
          participant.item4,
          participant.item5,
        ].map((itemId, idx) => {
          const icon = getItemIconUrl(itemId);
          return (
            <div
              key={idx}
              className="w-5 h-5 bg-bg-elevated rounded border border-bg-tertiary/30"
            >
              {icon && (
                <Image
                  src={icon}
                  alt=""
                  width={20}
                  height={20}
                  className="w-full h-full rounded"
                />
              )}
            </div>
          );
        })}
        {participant.item7 != null && participant.item7 !== 0 && (
          <div className="w-5 h-5 bg-bg-elevated rounded border border-amber-500/40 ml-px">
            <Image
              src={getItemIcon(participant.item7)}
              alt="quest"
              width={20}
              height={20}
              className="w-full h-full rounded"
            />
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
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: teamColor }}
        />
        <h3 className="text-base font-bold text-text-primary">{teamName}</h3>
        {isWinner && (
          <Trophy className="h-4 w-4 text-amber-400 flex-shrink-0" />
        )}
        <Badge
          variant={isWinner ? "success" : "danger"}
          className="text-[10px] flex-shrink-0"
        >
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
              <div className="w-[60px] text-center flex-shrink-0 hidden md:block">
                CS
              </div>
              <div className="w-[55px] text-center flex-shrink-0 hidden md:block">
                골드
              </div>
              <div className="w-[130px] text-center flex-shrink-0 hidden lg:block">
                딜량
              </div>
              <div className="w-[40px] text-center flex-shrink-0 hidden lg:block">
                시야
              </div>
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
                  isMvp={p.id === mvpId}
                  isAce={p.id === aceId}
                  teamColor={teamColor}
                />
              ) : (
                <PlayerRow
                  key={p.id}
                  participant={p}
                  isWinner={isWinner}
                  isMvp={p.id === mvpId}
                  isAce={!isWinner && p.id === aceId}
                  maxDamage={maxDamage}
                  gameDuration={gameDuration}
                  teamColor={teamColor}
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 상세 스탯 표 ─────────────────────────────────────
//
// 예전에는 항목마다(딜량·받은 피해·회복·시야…·CS/분, 11개) 10명짜리 순위 막대를
// 따로 그려서 세로로 110줄이 넘었고, 숫자도 31.2k 처럼 줄여 보여 줬다.
// 이제는 표 하나에 10명 = 10줄, 항목은 가로 칸이다. 숫자는 축약 없이 전부 쓰고,
// 숫자 밑 얇은 막대(팀색)로 10명 중 상대 크기를 보여 준다.
// 칸 제목을 누르면 팀 안에서 그 항목 순으로 정렬한다 (팀 구분은 유지).

interface StatColumn {
  key: string;
  label: string;
  group: "전투" | "시야" | "경제";
  getValue: (p: MatchParticipant, minutes: number) => number;
  /** 소수 자리. 없으면 정수로 천 단위 쉼표 */
  digits?: number;
}

const STAT_COLUMNS: StatColumn[] = [
  {
    key: "damage",
    label: "챔피언 딜량",
    group: "전투",
    getValue: (p) => p.totalDamageDealtToChampions,
  },
  {
    key: "taken",
    label: "받은 피해",
    group: "전투",
    getValue: (p) => p.totalDamageTaken,
  },
  { key: "heal", label: "회복량", group: "전투", getValue: (p) => p.totalHeal },
  {
    key: "vision",
    label: "시야 점수",
    group: "시야",
    getValue: (p) => p.visionScore,
  },
  {
    key: "wardsPlaced",
    label: "와드 설치",
    group: "시야",
    getValue: (p) => p.wardsPlaced,
  },
  {
    key: "wardsKilled",
    label: "와드 제거",
    group: "시야",
    getValue: (p) => p.wardsKilled,
  },
  {
    key: "controlWards",
    label: "제어 와드",
    group: "시야",
    getValue: (p) => p.detectorWardsPlaced,
  },
  {
    key: "goldEarned",
    label: "골드 획득",
    group: "경제",
    getValue: (p) => p.goldEarned,
  },
  {
    key: "goldSpent",
    label: "골드 사용",
    group: "경제",
    getValue: (p) => p.goldSpent,
  },
  {
    key: "cs",
    label: "CS",
    group: "경제",
    getValue: (p) => p.totalMinionsKilled + p.neutralMinionsKilled,
  },
  {
    key: "csPerMin",
    label: "분당 CS",
    group: "경제",
    getValue: (p, minutes) =>
      (p.totalMinionsKilled + p.neutralMinionsKilled) / minutes,
    digits: 1,
  },
];

/** 칸 묶음 머리글 — 연속된 같은 group 을 colSpan 으로 합친다 */
const STAT_GROUPS = STAT_COLUMNS.reduce<{ name: string; span: number }[]>(
  (groups, column) => {
    const last = groups[groups.length - 1];
    if (last && last.name === column.group) last.span += 1;
    else groups.push({ name: column.group, span: 1 });
    return groups;
  },
  [],
);

function formatStat(value: number, digits?: number) {
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits ?? 0,
    maximumFractionDigits: digits ?? 0,
  });
}

function DetailStatsTable({
  teams,
  allParticipants,
  gameDuration,
}: {
  /** 위에서부터 그릴 팀 순서 (승리 팀 먼저) */
  teams: { name: string; color: string; participants: MatchParticipant[] }[];
  allParticipants: MatchParticipant[];
  gameDuration: number;
}) {
  // 기본은 딜량 내림차순
  const [sortKey, setSortKey] = useState("damage");
  const minutes = Math.max(gameDuration / 60, 1);
  const sortColumn =
    STAT_COLUMNS.find((column) => column.key === sortKey) ?? STAT_COLUMNS[0];

  // 막대 길이와 "최고" 강조는 팀 구분 없이 전체 10명 기준이다
  const maxByKey = new Map(
    STAT_COLUMNS.map((column) => [
      column.key,
      Math.max(...allParticipants.map((p) => column.getValue(p, minutes)), 0),
    ]),
  );

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-xs tabular-nums">
          <thead>
            {/* 묶음 머리글 */}
            <tr className="text-[10px] text-text-tertiary">
              <th className="sticky left-0 z-10 bg-bg-secondary" />
              {STAT_GROUPS.map((group) => (
                <th
                  key={group.name}
                  colSpan={group.span}
                  className="px-3 pt-3 pb-1 text-center font-medium border-l border-bg-tertiary"
                >
                  {group.name}
                </th>
              ))}
            </tr>
            <tr className="border-b border-bg-tertiary">
              <th className="sticky left-0 z-10 bg-bg-secondary px-4 py-2 text-left font-medium text-text-tertiary">
                플레이어
              </th>
              {STAT_COLUMNS.map((column, index) => {
                const active = column.key === sortKey;
                // 묶음이 바뀌는 칸에 세로 구분선
                const groupStart =
                  index === 0 || STAT_COLUMNS[index - 1].group !== column.group;
                return (
                  <th
                    key={column.key}
                    className={`px-3 py-2 text-right font-medium ${groupStart ? "border-l border-bg-tertiary" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSortKey(column.key)}
                      className={`inline-flex items-center gap-0.5 whitespace-nowrap transition-colors ${
                        active
                          ? "text-text-primary"
                          : "text-text-tertiary hover:text-text-secondary"
                      }`}
                    >
                      {column.label}
                      {active && <ChevronDown className="h-3 w-3" />}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          {teams.map((team) => {
            const rows = [...team.participants].sort(
              (a, b) =>
                sortColumn.getValue(b, minutes) -
                sortColumn.getValue(a, minutes),
            );
            return (
              <tbody key={team.name}>
                <tr>
                  <td
                    colSpan={STAT_COLUMNS.length + 1}
                    className="px-4 pt-3 pb-1 text-[11px] font-semibold"
                    style={{ color: team.color }}
                  >
                    ● {team.name}
                  </td>
                </tr>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-bg-tertiary/50 last:border-b-0 hover:bg-bg-tertiary/30"
                  >
                    <td className="sticky left-0 z-10 bg-bg-secondary px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Image
                          src={getChampionIcon(p.championName)}
                          alt={p.championName}
                          width={20}
                          height={20}
                          className="w-5 h-5 rounded flex-shrink-0"
                        />
                        <ParticipantNameLink
                          participant={p}
                          className="max-w-[110px] truncate text-text-secondary"
                        />
                      </div>
                    </td>
                    {STAT_COLUMNS.map((column, index) => {
                      const value = column.getValue(p, minutes);
                      const max = maxByKey.get(column.key) ?? 0;
                      const isTop = max > 0 && value === max;
                      const groupStart =
                        index === 0 ||
                        STAT_COLUMNS[index - 1].group !== column.group;
                      return (
                        <td
                          key={column.key}
                          className={`px-3 py-2 text-right align-middle ${groupStart ? "border-l border-bg-tertiary" : ""}`}
                        >
                          <div
                            className={
                              isTop
                                ? "font-bold text-text-primary"
                                : "text-text-secondary"
                            }
                          >
                            {formatStat(value, column.digits)}
                          </div>
                          <div className="mt-1 ml-auto h-[3px] w-full max-w-[72px] rounded-full bg-bg-tertiary overflow-hidden">
                            <div
                              className="ml-auto h-full rounded-full"
                              style={{
                                width: `${max > 0 ? (value / max) * 100 : 0}%`,
                                backgroundColor: team.color,
                              }}
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────

export function MatchSkeleton() {
  return (
    <div className="min-h-screen">
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
          <div
            key={t}
            className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 space-y-2"
          >
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

// ─── Draft-Only View ─────────────────────────────────
//
// 수동 사설방은 Riot이 종료 후 데이터를 주지 않는다. 경기 중 Spectator로 확보한
// 픽/밴만 있으므로, 없는 개인 스탯을 "로딩 중"처럼 보이게 하지 않고 있는 것만 보여준다.

function DraftTeamColumn({
  title,
  color,
  isWinner,
  drafts,
  bans,
}: {
  title: string;
  color: string;
  isWinner: boolean;
  drafts: DraftSnapshot[];
  bans: number[];
}) {
  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary"
        style={{ backgroundColor: `${color}14` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-bold text-text-primary truncate">{title}</span>
        </div>
        {isWinner && (
          <Badge variant="success" size="sm">
            <Trophy className="h-3 w-3 mr-1" />
            승리
          </Badge>
        )}
      </div>

      <div className="divide-y divide-bg-tertiary/60">
        {drafts.map((draft) => (
          <div key={draft.id} className="flex items-center gap-3 px-4 py-2.5">
            <Image
              src={getChampionIconById(draft.championId)}
              alt={String(draft.championId)}
              width={36}
              height={36}
              className="rounded-md shrink-0"
              unoptimized
            />
            <div className="flex flex-col gap-0.5 shrink-0">
              <Image
                src={getSummonerSpellIcon(draft.spell1Id)}
                alt={String(draft.spell1Id)}
                width={16}
                height={16}
                className="rounded"
                unoptimized
              />
              <Image
                src={getSummonerSpellIcon(draft.spell2Id)}
                alt={String(draft.spell2Id)}
                width={16}
                height={16}
                className="rounded"
                unoptimized
              />
            </div>
            <span className="text-sm text-text-primary truncate">
              {draft.user?.username ?? draft.username ?? "알 수 없음"}
            </span>
          </div>
        ))}
      </div>

      {bans.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-bg-tertiary bg-bg-tertiary/20">
          <Ban className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
          <div className="flex flex-wrap gap-1">
            {bans.map((championId, index) => (
              <Image
                key={`${championId}-${index}`}
                src={getChampionIconById(championId)}
                alt={String(championId)}
                width={22}
                height={22}
                className="rounded opacity-60 grayscale"
                unoptimized
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DraftOnlyView({ match }: { match: MatchDetails }) {
  const drafts = match.draftSnapshots ?? [];
  const bans = match.draftBans ?? [];

  // Spectator의 riotTeamId(100/200)를 Nexus 팀으로 되돌린다.
  // 매핑에 실패한 경우(teamIdSnapshot이 없을 때)는 100=A로 둔다.
  const teamAKey =
    drafts.find((d) => d.teamIdSnapshot === match.teamAId)?.riotTeamId ?? 100;
  const teamADrafts = drafts.filter((d) => d.riotTeamId === teamAKey);
  const teamBDrafts = drafts.filter((d) => d.riotTeamId !== teamAKey);
  const banFor = (riotTeamId: number) =>
    bans.filter((b) => b.teamId === riotTeamId).map((b) => b.championId);

  return (
    <>
      <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-accent-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-semibold text-text-primary">
              픽/밴만 기록된 경기입니다
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Riot은 토너먼트 코드로 만든 사용자 지정 게임의 기록만 제공합니다.
              이 경기는 직접 만든 사설방이라 KDA·골드 같은 개인 기록을 가져올 수
              없어, 경기 중에 확보한 밴픽과 팀 구성만 남아 있습니다.
            </p>
            {match.gameDuration ? (
              <p className="text-xs text-text-tertiary pt-1">
                <Clock className="h-3 w-3 inline mr-1" />
                경기 시간 약 {Math.floor(match.gameDuration / 60)}분
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DraftTeamColumn
          title={match.teamA?.name ?? "팀 A"}
          color={TEAM_A_COLOR}
          isWinner={match.winnerId === match.teamAId}
          drafts={teamADrafts}
          bans={banFor(teamAKey)}
        />
        <DraftTeamColumn
          title={match.teamB?.name ?? "팀 B"}
          color={TEAM_B_COLOR}
          isWinner={match.winnerId === match.teamBId}
          drafts={teamBDrafts}
          bans={banFor(teamAKey === 100 ? 200 : 100)}
        />
      </div>
    </>
  );
}

// ─── 내전 상세 화면 ──────────────────────────────────
//
// 내전 상세 페이지와, 전적 목록에서 내전 판을 펼쳤을 때 같은 화면을 쓴다.
// (2026-11-02 "내전 기록 보는 방식 통일" — 어느 목록에서 열든 같은 모양)
// 데이터 조회·뒤로가기·바깥 여백은 쓰는 쪽이 맡는다.

/**
 * 펼친 내전 전적의 탭.
 * 정보가 한 줄로 쌓여 너무 길어져서(2026-11-04 운영자 요청) 세 갈래로 나눴다.
 * 스코어보드는 탭 위에 항상 보이고, 탭과 내용은 스코어보드와 한 카드로 묶는다.
 */
const MATCH_TABS = [
  { value: "overview", label: "종합" },
  { value: "team", label: "팀 분석" },
  { value: "detail", label: "상세 지표" },
] as const;
type MatchTab = (typeof MATCH_TABS)[number]["value"];

export function InternalMatchView({ match }: { match: MatchDetails }) {
  // 처음 펼치면 양 팀 선수 카드(종합)부터 보여준다
  const [tab, setTab] = useState<MatchTab>("overview");
  // 골드 차이 그래프용 Riot 타임라인. Riot 매치 ID 가 있는(토너먼트 코드로 수집된)
  // 경기만 가능하다. 실패하면 그래프만 빠지고 나머지 화면은 그대로다.
  const riotMatchId = match?.riotMatchId ?? null;
  const [timeline, setTimeline] = useState<any>(null);
  useEffect(() => {
    if (!riotMatchId) return;
    let cancelled = false;
    statsApi
      .getMatchTimeline(riotMatchId)
      .then((data) => {
        if (!cancelled) setTimeline(data);
      })
      .catch(() => {
        // 타임라인이 없으면(오래된 경기·Riot 오류) 그래프를 그리지 않는다
      });
    return () => {
      cancelled = true;
    };
  }, [riotMatchId]);

  // ── 상세 스탯이 없는 경우 ──
  //
  // 세 갈래로 나뉜다. 예전에는 전부 "수집 중" 스피너였는데, 수동 사설방은
  // 기다려도 영원히 오지 않아서 사용자를 속이는 화면이었다.
  //   1) 픽/밴 스냅샷이 있음      → 그거라도 보여준다
  //   2) 수집 경로 자체가 없음    → 불가하다고 분명히 알린다
  //   3) 수집 가능한데 아직 안 됨 → 기존대로 대기 안내
  if (!match.dataCollected && match.participants.length === 0) {
    const hasDraft = (match.draftSnapshots?.length ?? 0) > 0;
    const collectable = Boolean(match.tournamentCode || match.riotMatchId);

    return (
      <div className="space-y-6">
        {hasDraft ? (
          <DraftOnlyView match={match} />
        ) : collectable ? (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-12 text-center">
            <Loader2 className="h-10 w-10 text-accent-primary animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              Riot 게임 데이터를 수집하는 중입니다
            </h3>
            <p className="text-text-secondary text-sm">
              수집이 완료되면 상세 정보를 확인할 수 있습니다. 잠시 후 새로고침해
              주세요.
            </p>
          </div>
        ) : (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-12 text-center">
            <Info className="h-10 w-10 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              이 경기는 상세 전적을 제공할 수 없습니다
            </h3>
            <p className="text-text-secondary text-sm max-w-lg mx-auto leading-relaxed">
              Riot은 토너먼트 코드로 생성된 사용자 지정 게임의 기록만
              제공합니다. 직접 만든 사설방은 경기가 끝나면 조회할 수 없어
              KDA·골드 같은 개인 기록이 남지 않습니다.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Derived Data ──
  const teamAParticipants = match.participants.filter(
    (p) => p.teamId === match.teamAId,
  );
  const teamBParticipants = match.participants.filter(
    (p) => p.teamId === match.teamBId,
  );
  const teamAStats = match.teamStats.find((ts) => ts.teamId === match.teamAId);
  const teamBStats = match.teamStats.find((ts) => ts.teamId === match.teamBId);
  const isTeamAWinner = match.winnerId === match.teamAId;

  const aggA = getTeamAggregates(teamAParticipants);
  const aggB = getTeamAggregates(teamBParticipants);

  const winTeam = isTeamAWinner ? teamAParticipants : teamBParticipants;
  const loseTeam = isTeamAWinner ? teamBParticipants : teamAParticipants;
  const { mvpId, aceId } = getMvpAndAce(winTeam, loseTeam);

  const allParticipants = match.participants;
  const maxDamage = Math.max(
    ...allParticipants.map((p) => p.totalDamageDealtToChampions),
    1,
  );
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
    if (Array.isArray(bans))
      return bans
        .map((b: any) => (typeof b === "object" ? b.championId : b))
        .filter(Boolean);
    return [];
  };
  const teamABans = parseBans(teamAStats?.bans);
  const teamBBans = parseBans(teamBStats?.bans);

  return (
    // 스코어보드·탭·내용을 한 카드로 묶는다. 구분은 탭 줄 경계선과
    // 한 톤 어두운 내용 영역 배경으로 준다(내용 속 카드들은 그 위에 떠 보인다).
    <div className="overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary">
      {/* ──────────── Section 1: Match Header (Scoreboard) ──────────── */}
      <div>
        {/* Team color gradient bar */}
        <div className="h-1 flex">
          <div
            className="flex-1"
            style={{
              background: `linear-gradient(to right, ${TEAM_A_COLOR}, ${TEAM_A_COLOR}88)`,
            }}
          />
          <div
            className="flex-1"
            style={{
              background: `linear-gradient(to left, ${TEAM_B_COLOR}, ${TEAM_B_COLOR}88)`,
            }}
          />
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between">
            {/* Team A */}
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                {isTeamAWinner && <Trophy className="h-5 w-5 text-amber-400" />}
                <h2
                  className={`text-xl font-bold ${isTeamAWinner ? "text-text-primary" : "text-text-secondary"}`}
                >
                  {match.teamA.name}
                </h2>
              </div>
              <Badge
                variant={isTeamAWinner ? "success" : "danger"}
                className="text-xs"
              >
                {isTeamAWinner ? "승리" : "패배"}
              </Badge>
            </div>

            {/* Score */}
            <div className="flex-shrink-0 px-4 md:px-8 text-center">
              <div className="flex items-center gap-3">
                <span
                  className="text-3xl md:text-4xl font-black"
                  style={{ color: TEAM_A_COLOR }}
                >
                  {aggA.kills}
                </span>
                <span className="text-xl md:text-2xl text-text-tertiary font-light">
                  -
                </span>
                <span
                  className="text-3xl md:text-4xl font-black"
                  style={{ color: TEAM_B_COLOR }}
                >
                  {aggB.kills}
                </span>
              </div>
            </div>

            {/* Team B */}
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <h2
                  className={`text-xl font-bold ${!isTeamAWinner ? "text-text-primary" : "text-text-secondary"}`}
                >
                  {match.teamB.name}
                </h2>
                {!isTeamAWinner && (
                  <Trophy className="h-5 w-5 text-amber-400" />
                )}
              </div>
              <Badge
                variant={!isTeamAWinner ? "success" : "danger"}
                className="text-xs"
              >
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
            <span>
              {new Date(match.completedAt).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
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

      {/* ──────────── 탭 ──────────── */}
      <div
        role="tablist"
        aria-label="경기 정보"
        className="flex gap-6 border-t border-bg-tertiary px-5"
      >
        {MATCH_TABS.map((item) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={(e) => {
                // 전적 목록에서 펼친 상태라면 줄 접기로 번지지 않게 한다
                e.stopPropagation();
                setTab(item.value);
              }}
              className={`-mb-px border-b-2 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "border-accent-primary text-text-primary"
                  : "border-transparent text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        className="space-y-4 border-t border-bg-tertiary bg-bg-primary/40 p-4"
      >
        {tab === "team" && (
          <>
            {/* ──────────── 골드 차이 그래프 (대회 중계 방식) ──────────── */}
            {timeline && (
              <TeamGoldChart
                timeline={timeline}
                teams={[
                  {
                    name: match.teamA.name,
                    color: TEAM_A_COLOR,
                    puuids: teamAParticipants.flatMap((p) =>
                      p.puuid ? [p.puuid] : [],
                    ),
                    riotTeamId: teamAParticipants[0]?.riotTeamId ?? null,
                  },
                  {
                    name: match.teamB.name,
                    color: TEAM_B_COLOR,
                    puuids: teamBParticipants.flatMap((p) =>
                      p.puuid ? [p.puuid] : [],
                    ),
                    riotTeamId: teamBParticipants[0]?.riotTeamId ?? null,
                  },
                ]}
              />
            )}

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
            {/* 팀당 한 줄: 팀 이름 · 공식 오브젝트 아이콘 · 달성한 "첫 ~" 배지만 */}
            {(teamAStats || teamBStats) && (
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl divide-y divide-bg-tertiary">
                {(
                  [
                    {
                      name: match.teamA.name,
                      color: TEAM_A_COLOR,
                      stats: teamAStats,
                      side: 100,
                    },
                    {
                      name: match.teamB.name,
                      color: TEAM_B_COLOR,
                      stats: teamBStats,
                      side: 200,
                    },
                  ] as const
                ).map((team) => (
                  <div
                    key={team.side}
                    className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3"
                  >
                    <div className="flex w-36 items-center gap-2 text-sm font-semibold text-text-secondary">
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="truncate">{team.name}</span>
                    </div>
                    <div className="flex items-center gap-5">
                      <ObjectiveIcon
                        type="tower"
                        count={team.stats?.towerKills ?? 0}
                        side={team.side}
                      />
                      <ObjectiveIcon
                        type="inhibitor"
                        count={team.stats?.inhibitorKills ?? 0}
                        side={team.side}
                      />
                      <ObjectiveIcon
                        type="dragon"
                        count={team.stats?.dragonKills ?? 0}
                        side={team.side}
                      />
                      <ObjectiveIcon
                        type="herald"
                        count={team.stats?.riftHeraldKills ?? 0}
                        side={team.side}
                      />
                      <ObjectiveIcon
                        type="baron"
                        count={team.stats?.baronKills ?? 0}
                        side={team.side}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <FirstBadge
                        label="선취점"
                        active={team.stats?.firstBlood ?? false}
                      />
                      <FirstBadge
                        label="첫 포탑"
                        active={team.stats?.firstTower ?? false}
                      />
                      <FirstBadge
                        label="첫 드래곤"
                        active={team.stats?.firstDragon ?? false}
                      />
                      <FirstBadge
                        label="첫 내셔 남작"
                        active={team.stats?.firstBaron ?? false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ──────────── Section 4: Bans ──────────── */}
            {(teamABans.length > 0 || teamBBans.length > 0) && (
              <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-5">
                <h3 className="text-sm font-semibold text-text-secondary mb-3">
                  밴
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: TEAM_A_COLOR }}
                      />
                      <span className="text-xs text-text-tertiary">
                        {match.teamA.name}
                      </span>
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
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ))}
                      {teamABans.length === 0 && (
                        <span className="text-xs text-text-tertiary">
                          밴 정보 없음
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: TEAM_B_COLOR }}
                      />
                      <span className="text-xs text-text-tertiary">
                        {match.teamB.name}
                      </span>
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
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ))}
                      {teamBBans.length === 0 && (
                        <span className="text-xs text-text-tertiary">
                          밴 정보 없음
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ──────────── Section 5: Player Cards (Winner first) ──────────── */}
        {tab === "overview" && (
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
        )}

        {/* ──────────── Section 6: Detailed Stats Table ──────────── */}
        {tab === "detail" && (
          <DetailStatsTable
            teams={[
              {
                name: winTeamName,
                color: winTeamColor,
                participants: winTeam,
              },
              {
                name: loseTeamName,
                color: loseTeamColor,
                participants: loseTeam,
              },
            ]}
            allParticipants={allParticipants}
            gameDuration={gameDuration}
          />
        )}
      </div>
    </div>
  );
}
