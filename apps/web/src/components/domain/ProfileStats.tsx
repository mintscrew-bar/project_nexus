"use client";

import type { ElementType, ReactNode } from "react";
import { ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  commendationTagLabel,
  type CommendationSummary,
} from "@/lib/commendation";

/**
 * 프로필 통계 공통 컴포넌트
 *
 * PlayerProfileModal · /profile · /users/[id] 세 곳에서 각각 별도 구현되어 있던
 * RepBar / SummaryChip / WinRateSparkline 을 하나로 통합한다.
 * - 기준 치수는 모달 버전(104px / 24px)을 채택
 * - 색상은 모두 테마 토큰(bg-bg-*, text-text-*, accent-*)으로 라이트/다크 자동 대응
 */

// ─── 최근 승패 추출 (최신 6경기, 좌→우 시간순) ───────────────
function getRecentWinOutcomes(matches: any[]): boolean[] {
  return matches
    .slice(0, 6)
    .reverse()
    .map((match) => Boolean(match.participant?.win));
}

interface ProfileBaseStats {
  gamesPlayed?: number | null;
  wins?: number | null;
  losses?: number | null;
  participations?: number | null;
}

interface RankedChampionStat {
  games?: number | null;
  wins?: number | null;
  losses?: number | null;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
}

interface StatAggregate {
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
}

function numberOrZero(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function aggregateRecentMatches(matches: any[]) {
  return matches.reduce<Pick<StatAggregate, "games" | "kills" | "deaths" | "assists">>(
    (acc, match) => {
      const participant = match.participant ?? {};
      acc.games += 1;
      acc.kills += numberOrZero(participant.kills);
      acc.deaths += numberOrZero(participant.deaths);
      acc.assists += numberOrZero(participant.assists);
      return acc;
    },
    { games: 0, kills: 0, deaths: 0, assists: 0 },
  );
}

function aggregateRankedChampions(champions: RankedChampionStat[]) {
  return champions.reduce<StatAggregate>(
    (acc, champion) => {
      const games = numberOrZero(champion.games);
      const wins = numberOrZero(champion.wins);
      const losses = champion.losses == null ? Math.max(0, games - wins) : numberOrZero(champion.losses);
      acc.games += games;
      acc.wins += wins;
      acc.losses += losses;
      acc.kills += numberOrZero(champion.kills);
      acc.deaths += numberOrZero(champion.deaths);
      acc.assists += numberOrZero(champion.assists);
      return acc;
    },
    { games: 0, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0 },
  );
}

export function getCombinedProfileMetrics({
  stats,
  recentMatches,
  rankedChampStats,
}: {
  stats?: ProfileBaseStats | null;
  recentMatches: any[];
  rankedChampStats: RankedChampionStat[];
}) {
  const customGames = numberOrZero(stats?.gamesPlayed);
  const customWins = numberOrZero(stats?.wins);
  const customLosses = numberOrZero(stats?.losses);
  const ranked = aggregateRankedChampions(rankedChampStats);
  const recent = aggregateRecentMatches(recentMatches);

  const games = customGames + ranked.games;
  const wins = customWins + ranked.wins;
  const losses = customLosses + ranked.losses;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;

  const kdaGames = recent.games + ranked.games;
  const kills = recent.kills + ranked.kills;
  const deaths = recent.deaths + ranked.deaths;
  const assists = recent.assists + ranked.assists;

  return {
    games,
    wins,
    losses,
    winRate,
    customGames,
    rankedGames: ranked.games,
    participations: numberOrZero(stats?.participations),
    kdaGames,
    avgKills: kdaGames > 0 ? kills / kdaGames : 0,
    avgDeaths: kdaGames > 0 ? deaths / kdaGames : 0,
    avgAssists: kdaGames > 0 ? assists / kdaGames : 0,
    avgKda: kdaGames > 0 ? (deaths === 0 ? kills + assists : (kills + assists) / deaths) : 0,
  };
}

/** 최근 경기 승패 흐름 스파크라인 */
export function WinRateSparkline({ matches }: { matches: any[] }) {
  const outcomes = getRecentWinOutcomes(matches);

  if (outcomes.length === 0) {
    return <div className="h-5 w-11" />;
  }

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

function clampRating(value?: number | null) {
  return Math.max(0, Math.min(5, Number(value || 0)));
}

export function RatingStars({ value, className }: { value: number; className?: string }) {
  const rounded = Math.round(clampRating(value));

  return (
    <span className={cn("whitespace-nowrap text-lg leading-none text-accent-gold", className)}>
      {"★".repeat(rounded)}
      <span className="text-text-muted">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

/** 평판 점수 바 (0~5 스케일) */
export function RepBar({ label, value }: { label: string; value: number }) {
  const safeValue = clampRating(value);
  return (
    <div className="flex items-center gap-3">
      <span className="w-9 text-xs font-semibold text-text-tertiary">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
        <div className="h-full rounded-full bg-accent-primary" style={{ width: `${(safeValue / 5) * 100}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-bold text-text-secondary">{safeValue.toFixed(1)}</span>
    </div>
  );
}

export interface ReputationStats {
  totalRatings?: number | null;
  averageSkill?: number | null;
  averageAttitude?: number | null;
  averageCommunication?: number | null;
  overallAverage?: number | null;
  /** 받은 칭찬 — 평판 표시는 별점에서 칭찬으로 바뀌었다 */
  commendations?: CommendationSummary | null;
}

/**
 * 평판 요약 — 경기 뒤 함께 뛴 사람들에게 받은 칭찬 수와 많이 받은 태그.
 * 예전 별점(실력·태도·소통)은 아무도 남기지 않아(2026-11 실측 0건) 칭찬으로 바꿨다.
 */
export function ReputationSummary({
  stats,
  className,
}: {
  stats?: ReputationStats | null;
  className?: string;
}) {
  const total = stats?.commendations?.total ?? 0;
  const topTags = stats?.commendations?.topTags ?? [];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-xl border border-accent-primary/20 bg-bg-tertiary p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-text-tertiary">받은 칭찬</p>
            <div className="mt-1 flex items-end gap-1.5">
              <span className="text-3xl font-black leading-none text-text-primary">{total}</span>
              <span className="pb-0.5 text-xs font-semibold text-text-tertiary">회</span>
            </div>
          </div>
          <ThumbsUp className={cn("h-8 w-8", total > 0 ? "text-accent-primary" : "text-text-muted")} />
        </div>
      </div>

      {topTags.length > 0 ? (
        <div className="rounded-xl border border-bg-elevated bg-bg-tertiary/50 p-3">
          <p className="mb-3 text-xs font-bold text-text-secondary">많이 받은 칭찬</p>
          <div className="space-y-2.5">
            {topTags.map(({ tag, count }) => (
              <div key={tag} className="flex items-center gap-3">
                <span className="w-16 flex-shrink-0 text-xs font-semibold text-text-secondary">
                  {commendationTagLabel(tag)}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-elevated">
                  <div
                    className="h-full rounded-full bg-accent-primary"
                    style={{ width: `${Math.round((count / Math.max(1, total)) * 100)}%` }}
                  />
                </div>
                <span className="w-6 text-right text-xs font-bold text-text-primary">{count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-bg-elevated bg-bg-tertiary/50 px-3 py-4 text-center text-xs font-semibold text-text-tertiary">
          {total > 0 ? "태그 없이 받은 칭찬만 있습니다" : "내전이 끝나면 함께 뛴 사람들이 칭찬을 남길 수 있습니다"}
        </p>
      )}
    </div>
  );
}

/** 요약 스탯 칩 (전적 / 승률 / KDA 등) */
export function SummaryChip({
  icon: Icon,
  label,
  value,
  detail,
  side,
  valueClassName = "text-text-primary",
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail?: string;
  side?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-h-[96px] items-center justify-between gap-4 rounded-lg border border-bg-tertiary bg-bg-secondary px-4 py-3">
      <div className="min-w-0">
        <div className="mb-3 flex h-5 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p className={`min-w-0 text-[24px] font-black leading-none tracking-normal ${valueClassName}`}>
          {value}
        </p>
        {detail && <p className="mt-2 truncate text-xs font-semibold leading-none text-text-tertiary">{detail}</p>}
      </div>
      {side && <div className="shrink-0">{side}</div>}
    </div>
  );
}
