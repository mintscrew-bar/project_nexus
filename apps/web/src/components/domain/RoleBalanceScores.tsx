import {
  PositionIcon,
  POSITION_LABELS,
} from "@/app/tournaments/[id]/lobby/_components/icons";

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

export type RoleBalanceScoreMap = Partial<Record<string, number>>;

export function RoleBalanceScores({
  scores,
  className = "",
  compact = false,
}: {
  scores?: RoleBalanceScoreMap | null;
  className?: string;
  compact?: boolean;
}) {
  const entries = ROLE_ORDER.map((role) => ({
    role,
    score: scores?.[role],
  })).filter(
    (entry): entry is { role: string; score: number } =>
      typeof entry.score === "number" && Number.isFinite(entry.score),
  );

  if (!entries.length) return null;

  return (
    <div className={className}>
      <p className="mb-1.5 text-[10px] font-semibold text-text-muted">
        라인별 점수
      </p>
      <div className="grid grid-cols-5 gap-1">
        {entries.map(({ role, score }) => (
          <div
            key={role}
            className={`flex min-w-0 items-center justify-center rounded-md bg-bg-tertiary text-text-secondary ${
              compact
                ? "gap-1 px-1 py-1 text-[10px]"
                : "gap-1.5 px-1.5 py-1.5 text-xs"
            }`}
            title={`${POSITION_LABELS[role] || role} 자동 밸런스 점수`}
          >
            <PositionIcon
              position={role}
              className={compact ? "!h-3 !w-3" : "!h-3.5 !w-3.5"}
            />
            <span className="truncate font-bold tabular-nums">
              {score.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
