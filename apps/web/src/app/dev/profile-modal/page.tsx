"use client";

// 개발용 프리뷰 — PlayerProfileModal 목업 확인 페이지
// 접속: http://localhost:3000/dev/profile-modal

import Image from "next/image";
import type { ElementType, ReactNode } from "react";
import {
  Activity,
  CalendarDays,
  Flag,
  Swords,
  Star,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { getChampionIcon } from "@/components/matches/match-utils";
import {
  ChampionIcon,
  PositionIcon,
  POSITION_LABELS,
} from "@/app/tournaments/[id]/lobby/_components/icons";

const MOCK_PROFILE = {
  username: "mintscrew",
  createdAt: "2025-11-12T12:00:00Z",
  avatar: null as string | null,
  clan: { tag: "NXS", name: "Nexus 공식" },
  riot: {
    gameName: "진혁",
    tagLine: "진혁",
    tier: "DIAMOND",
    rank: "IV",
    lp: 64,
    peakTier: "MASTER",
    peakRank: "",
    peakLp: 124,
    mainRole: "TOP",
    subRole: "JUNGLE",
  },
  stats: {
    gamesPlayed: 87,
    wins: 48,
    losses: 39,
    winRate: 55,
    participations: 112,
  },
  reputation: {
    totalRatings: 17,
    overallAverage: 4.2,
    averageSkill: 4.5,
    averageAttitude: 4.0,
    averageCommunication: 4.1,
  },
};

const ACCENT = "#667EEA";

const TIER_COLOR: Record<string, string> = {
  CHALLENGER: "#F59E0B",
  GRANDMASTER: "#F43F5E",
  MASTER: "#A855F7",
  DIAMOND: "#22D3EE",
  PLATINUM: "#2DD4BF",
  EMERALD: "#10B981",
  GOLD: "#EAB308",
  SILVER: "#94A3B8",
  BRONZE: "#F97316",
  IRON: "#78716C",
};

const TIER_KO: Record<string, string> = {
  CHALLENGER: "챌린저",
  GRANDMASTER: "그랜드마스터",
  MASTER: "마스터",
  DIAMOND: "다이아몬드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  GOLD: "골드",
  SILVER: "실버",
  BRONZE: "브론즈",
  IRON: "아이언",
};

const CHAMPIONS = [
  { role: "TOP", championId: "Darius", order: 1 },
  { role: "TOP", championId: "Garen", order: 2 },
  { role: "TOP", championId: "Sett", order: 3 },
  { role: "TOP", championId: "Mordekaiser", order: 4 },
  { role: "TOP", championId: "Fiora", order: 5 },
  { role: "JUNGLE", championId: "Vi", order: 1 },
  { role: "JUNGLE", championId: "Warwick", order: 2 },
  { role: "JUNGLE", championId: "Hecarim", order: 3 },
  { role: "MID", championId: "Galio", order: 1 },
  { role: "MID", championId: "Ahri", order: 2 },
];

const RECENT_MATCHES = [
  {
    matchId: "1",
    team: { id: "blue", name: "블루팀" },
    match: {
      createdAt: "2026-06-16T04:42:00Z",
      teamA: { id: "blue", name: "블루팀" },
      teamB: { id: "red", name: "레드팀" },
    },
    participant: {
      championName: "Darius",
      championNameKorean: "다리우스",
      position: "TOP",
      kills: 8,
      deaths: 2,
      assists: 9,
      damage: 28420,
      win: true,
    },
  },
  {
    matchId: "2",
    team: { id: "red", name: "레드팀" },
    match: {
      createdAt: "2026-06-16T03:15:00Z",
      teamA: { id: "blue", name: "블루팀" },
      teamB: { id: "red", name: "레드팀" },
    },
    participant: {
      championName: "Vi",
      championNameKorean: "바이",
      position: "JUNGLE",
      kills: 5,
      deaths: 4,
      assists: 13,
      damage: 19304,
      win: true,
    },
  },
  {
    matchId: "3",
    team: { id: "blue", name: "블루팀" },
    match: {
      createdAt: "2026-06-15T18:20:00Z",
      teamA: { id: "blue", name: "블루팀" },
      teamB: { id: "red", name: "레드팀" },
    },
    participant: {
      championName: "Garen",
      championNameKorean: "가렌",
      position: "TOP",
      kills: 4,
      deaths: 6,
      assists: 5,
      damage: 15120,
      win: false,
    },
  },
  {
    matchId: "4",
    team: { id: "red", name: "레드팀" },
    match: {
      createdAt: "2026-06-14T20:08:00Z",
      teamA: { id: "blue", name: "블루팀" },
      teamB: { id: "red", name: "레드팀" },
    },
    participant: {
      championName: "Sett",
      championNameKorean: "세트",
      position: "TOP",
      kills: 9,
      deaths: 3,
      assists: 7,
      damage: 30110,
      win: true,
    },
  },
  {
    matchId: "5",
    team: { id: "blue", name: "블루팀" },
    match: {
      createdAt: "2026-06-13T11:30:00Z",
      teamA: { id: "blue", name: "블루팀" },
      teamB: { id: "red", name: "레드팀" },
    },
    participant: {
      championName: "Mordekaiser",
      championNameKorean: "모데카이저",
      position: "TOP",
      kills: 3,
      deaths: 5,
      assists: 4,
      damage: 17480,
      win: false,
    },
  },
];

function formatTier(riot: typeof MOCK_PROFILE.riot) {
  const isApex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(riot.tier);
  const tier = TIER_KO[riot.tier] ?? riot.tier;
  return `${tier}${riot.rank && !isApex ? ` ${riot.rank}` : ""}`;
}

function formatPeakTier(riot: typeof MOCK_PROFILE.riot) {
  const isApex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(riot.peakTier);
  const tier = TIER_KO[riot.peakTier] ?? riot.peakTier;
  return `${tier}${riot.peakRank && !isApex ? ` ${riot.peakRank}` : ""}`;
}

function formatDamage(value?: number | null) {
  if (!value) return "-";
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return `${value}`;
}

function formatOneDecimal(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function getKdaRatio(kills = 0, deaths = 0, assists = 0) {
  return deaths === 0 ? kills + assists : (kills + assists) / deaths;
}

function getRecentMetrics(matches: typeof RECENT_MATCHES) {
  const games = matches.length;
  const wins = matches.filter((match) => match.participant.win).length;
  const kills = matches.reduce((sum, match) => sum + match.participant.kills, 0);
  const deaths = matches.reduce((sum, match) => sum + match.participant.deaths, 0);
  const assists = matches.reduce((sum, match) => sum + match.participant.assists, 0);
  const damage = matches.reduce((sum, match) => sum + match.participant.damage, 0);

  return {
    games,
    wins,
    winRate: Math.round((wins / games) * 100),
    avgKills: kills / games,
    avgDeaths: deaths / games,
    avgAssists: assists / games,
    avgKda: getKdaRatio(kills, deaths, assists),
    avgDamage: damage / games,
  };
}

function getChampionGroups(
  champions: typeof CHAMPIONS,
  mainRole?: string | null,
  subRole?: string | null,
) {
  const grouped = new Map<string, typeof CHAMPIONS>();
  for (const champion of champions) {
    grouped.set(champion.role, [...(grouped.get(champion.role) || []), champion]);
  }

  const roleOrder: string[] = [];
  const addRole = (role?: string | null) => {
    if (role && grouped.has(role) && !roleOrder.includes(role)) roleOrder.push(role);
  };

  addRole(mainRole);
  addRole(subRole);
  for (const champion of champions) addRole(champion.role);

  return roleOrder.map((role) => ({
    role,
    champions: grouped.get(role) || [],
  }));
}

function getRecentWinOutcomes(matches: typeof RECENT_MATCHES) {
  return matches
    .slice(0, 6)
    .reverse()
    .map((match) => match.participant.win);
}

function WinRateSparkline({ matches }: { matches: typeof RECENT_MATCHES }) {
  const outcomes = getRecentWinOutcomes(matches);
  const width = 46;
  const height = 22;
  const innerWidth = 34;
  const xStart = 6;
  const points = outcomes.map((won, index) => {
    const x = outcomes.length === 1 ? width / 2 : xStart + (index * innerWidth) / (outcomes.length - 1);
    const y = won ? 6 : 16;
    return { x, y, won };
  });
  const pointPath = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="h-5 w-11 opacity-70" title="최근 경기 승패 흐름">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="최근 승패 그래프">
        <polyline
          points={pointPath}
          fill="none"
          stroke="rgb(125, 211, 252)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

function RepBar({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(5, value || 0));

  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-xs font-semibold text-zinc-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-violet-500"
          style={{ width: `${(safeValue / 5) * 100}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-bold text-white">
        {safeValue.toFixed(1)}
      </span>
    </div>
  );
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value || 0)));

  return (
    <span className="text-sm text-yellow-400">
      {"★".repeat(rounded)}
      <span className="text-zinc-700">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

function SummaryChip({
  icon: Icon,
  label,
  value,
  detail,
  side,
  valueClassName = "text-white",
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail?: string;
  side?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-h-[104px] flex-col justify-between rounded-xl bg-[#181818] p-4">
      <div className="flex h-5 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="pt-3">
        <div className="flex items-end justify-between gap-3">
          <p className={`min-w-0 text-[24px] font-black leading-none tracking-[-0.01em] ${valueClassName}`}>
            {value}
          </p>
          {side && <div className="shrink-0 translate-y-0.5">{side}</div>}
        </div>
        {detail && <p className="mt-2 truncate text-xs font-semibold leading-none text-zinc-500">{detail}</p>}
      </div>
    </div>
  );
}

export default function ProfileModalDevPage() {
  const { riot, stats, reputation, clan } = MOCK_PROFILE;
  const championGroups = getChampionGroups(CHAMPIONS, riot.mainRole, riot.subRole);
  const recent = getRecentMetrics(RECENT_MATCHES);

  return (
    <main className="min-h-screen bg-bg-primary px-4 py-10 text-text-primary sm:px-6">
      <div className="mx-auto mb-5 max-w-5xl">
        <p className="font-mono text-xs text-text-muted">개발 프리뷰 · /dev/profile-modal</p>
        <h1 className="mt-1 text-2xl font-black text-text-primary">PlayerProfileModal</h1>
      </div>

      <div
        className="mx-auto max-w-5xl rounded-[18px] bg-[#101010] p-3 text-white shadow-[0_32px_70px_rgba(0,0,0,0.82)] sm:p-4"
        style={{
          border: `1px solid ${ACCENT}66`,
          boxShadow: `0 32px 70px rgba(0,0,0,0.82), 0 0 0 1px ${ACCENT}18`,
        }}
      >
        <div className="space-y-4">
          <section className="px-1 pt-1 sm:px-2">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  title="이 유저 신고"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-xs font-semibold text-zinc-400"
                >
                  <Flag className="h-3.5 w-3.5" />
                  신고
                </button>
                <button
                  type="button"
                  aria-label="프로필 닫기"
                  className="rounded-lg bg-[#1a1a1a] p-1.5 text-zinc-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-[#171717] sm:h-24 sm:w-24"
                  style={{ border: `2px solid ${ACCENT}88` }}
                >
                  {MOCK_PROFILE.avatar ? (
                    <Image
                      src={MOCK_PROFILE.avatar}
                      alt={MOCK_PROFILE.username}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Users className="h-9 w-9 text-zinc-500" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-black leading-tight text-white sm:text-2xl">
                      {MOCK_PROFILE.username}
                    </h2>
                    <span
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-black leading-none"
                      style={{ color: ACCENT, backgroundColor: `${ACCENT}22` }}
                    >
                      {clan.tag}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-zinc-500">
                    {riot.gameName}<span className="text-zinc-600"> #{riot.tagLine}</span>
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg font-black" style={{ color: TIER_COLOR[riot.tier] ?? ACCENT }}>
                      {formatTier(riot)}
                    </span>
                    <span className="text-sm font-bold text-zinc-200">{riot.lp} LP</span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-zinc-600">최고</span>
                    <span className="text-xs font-semibold text-zinc-400">
                      {formatPeakTier(riot)}
                      {riot.peakLp != null && ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(riot.peakTier) ? ` ${riot.peakLp}LP` : ""}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5">
                      <PositionIcon position={riot.mainRole} className="!h-4 !w-4" />
                      <span className="text-xs font-bold text-white">{POSITION_LABELS[riot.mainRole] || riot.mainRole}</span>
                      <span className="rounded bg-[#262626] px-1 text-[9px] font-black text-zinc-600">주</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5">
                      <PositionIcon position={riot.subRole} className="!h-4 !w-4" opacity={0.6} />
                      <span className="text-xs font-semibold text-zinc-400">{POSITION_LABELS[riot.subRole] || riot.subRole}</span>
                      <span className="rounded bg-[#262626] px-1 text-[9px] font-black text-zinc-600">부</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                      <CalendarDays className="h-3 w-3" />
                      2025. 11. 12. 가입
                    </span>
                  </div>
                </div>
              </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryChip
              icon={Swords}
              label="전적"
              value={`${stats.wins}승 ${stats.losses}패`}
              detail={`${stats.gamesPlayed}게임 · 참여 ${stats.participations}회`}
            />
            <SummaryChip
              icon={TrendingUp}
              label="승률"
              value={`${stats.winRate}%`}
              detail={`${stats.wins}승 ${stats.losses}패`}
              side={<WinRateSparkline matches={RECENT_MATCHES} />}
              valueClassName="text-sky-300"
            />
            <SummaryChip
              icon={Activity}
              label="최근 KDA"
              value={recent.avgKda.toFixed(2)}
              detail={`${formatOneDecimal(recent.avgKills)} / ${formatOneDecimal(recent.avgDeaths)} / ${formatOneDecimal(recent.avgAssists)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-xl bg-[#181818] p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-black text-white">포지션 및 선호 챔피언</h3>
              </div>

              <div className="space-y-2">
                {championGroups.map((group) => (
                  <div key={group.role} className="rounded-xl bg-[#101010] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
                        <PositionIcon position={group.role} />
                        {POSITION_LABELS[group.role] || group.role}
                        {group.role === riot.mainRole && <span className="text-zinc-500">주</span>}
                        {group.role === riot.subRole && <span className="text-zinc-500">부</span>}
                      </span>
                      <span className="text-[10px] font-semibold text-zinc-600">
                        {group.champions.length}개
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.champions.map((champion, index) => (
                        <div key={`${group.role}-${champion.championId}-${index}`} className="relative">
                          <ChampionIcon championId={champion.championId} size={34} />
                          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[9px] font-black text-zinc-300 ring-1 ring-white/10">
                            {champion.order}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl bg-[#181818] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-yellow-400" />
                  <h3 className="text-sm font-black text-white">신뢰도 상세</h3>
                </div>
                <span className="text-xs text-zinc-600">{reputation.totalRatings}개 평가</span>
              </div>
              <div className="mb-4 flex items-center justify-between rounded-xl bg-[#101010] p-3">
                <div>
                  <p className="text-xs font-semibold text-zinc-500">종합 평가</p>
                  <div className="mt-1">
                    <RatingStars value={reputation.overallAverage} />
                  </div>
                </div>
                <p className="text-2xl font-black text-white">
                  {reputation.overallAverage.toFixed(1)}
                </p>
              </div>
              <div className="space-y-3">
                <RepBar label="실력" value={reputation.averageSkill} />
                <RepBar label="태도" value={reputation.averageAttitude} />
                <RepBar label="소통" value={reputation.averageCommunication} />
              </div>
            </section>
          </div>

          <section className="rounded-xl bg-[#181818] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-black text-white">최근 5경기</h3>
              <span className="text-xs text-zinc-600">내전 기록</span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {RECENT_MATCHES.map((match) => {
                const { participant } = match;
                const opponent =
                  match.match.teamA.id === match.team.id
                    ? match.match.teamB.name
                    : match.match.teamA.name;

                return (
                  <div key={match.matchId} className="rounded-xl bg-[#101010] p-3">
                    <div className="flex items-center gap-3">
                      <Image
                        src={getChampionIcon(participant.championName)}
                        alt={participant.championName}
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full"
                        unoptimized
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">
                          {participant.kills}/{participant.deaths}/{participant.assists} · {participant.championNameKorean}
                        </p>
                        <p className="text-xs text-zinc-600">
                          {POSITION_LABELS[participant.position] || participant.position} · {match.team.name}
                        </p>
                      </div>
                      <span className={`rounded-md px-2 py-1 text-xs font-black ${participant.win ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
                        {participant.win ? "승" : "패"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-[#181818] px-2 py-1.5">
                        <p className="text-[10px] text-zinc-600">KDA</p>
                        <p className="text-xs font-black text-white">
                          {getKdaRatio(participant.kills, participant.deaths, participant.assists).toFixed(2)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#181818] px-2 py-1.5">
                        <p className="text-[10px] text-zinc-600">피해량</p>
                        <p className="text-xs font-black text-white">{formatDamage(participant.damage)}</p>
                      </div>
                      <div className="rounded-lg bg-[#181818] px-2 py-1.5">
                        <p className="text-[10px] text-zinc-600">상대</p>
                        <p className="truncate text-xs font-black text-white">{opponent}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
