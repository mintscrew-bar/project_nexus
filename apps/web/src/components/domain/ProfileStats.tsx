"use client";

import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

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
}

export function ReputationSummary({
  stats,
  className,
}: {
  stats?: ReputationStats | null;
  className?: string;
}) {
  const totalRatings = stats?.totalRatings ?? 0;
  const overallAverage = clampRating(stats?.overallAverage);
  const hasRatings = totalRatings > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-xl border border-accent-gold/20 bg-bg-tertiary p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-text-tertiary">종합 평가</p>
            <div className="mt-1 flex items-end gap-1.5">
              <span className="text-3xl font-black leading-none text-text-primary">{overallAverage.toFixed(1)}</span>
              <span className="pb-0.5 text-xs font-semibold text-text-tertiary">/ 5</span>
            </div>
          </div>
          <div className="text-right">
            <RatingStars value={overallAverage} />
            <p className="mt-2 text-xs font-semibold text-text-tertiary">
              {hasRatings ? `${totalRatings}개 평가` : "평가 없음"}
            </p>
          </div>
        </div>
      </div>

      {hasRatings ? (
        <div className="rounded-xl border border-bg-elevated bg-bg-tertiary/50 p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-text-secondary">세부 항목</p>
            <p className="text-[11px] font-semibold text-text-muted">5점 만점</p>
          </div>
          <div className="space-y-2.5">
            <RepBar label="실력" value={stats?.averageSkill ?? 0} />
            <RepBar label="태도" value={stats?.averageAttitude ?? 0} />
            <RepBar label="소통" value={stats?.averageCommunication ?? 0} />
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-bg-elevated bg-bg-tertiary/50 px-3 py-4 text-center text-xs font-semibold text-text-tertiary">
          완료된 매치에서 받은 평가가 아직 없습니다
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
