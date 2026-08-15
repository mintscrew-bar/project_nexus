import { PositionIcon, POSITION_LABELS } from "@/app/tournaments/[id]/lobby/_components/icons";
import type { RoleTier } from "@/lib/role-tier";

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

export function RoleTierBadges({
  roleTiers,
  className = "",
  compact = false,
}: {
  roleTiers?: RoleTier[] | null;
  className?: string;
  compact?: boolean;
}) {
  if (!roleTiers?.length) return null;

  const sorted = [...roleTiers].sort(
    (left, right) => ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role),
  );

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {sorted.map((roleTier) => {
        const detail = APEX_TIERS.has(roleTier.tier)
          ? roleTier.lp != null
            ? `${roleTier.lp}LP`
            : ""
          : roleTier.rank || "";
        return (
          <span
            key={roleTier.role}
            className={`inline-flex min-w-0 items-center gap-1 rounded-md bg-bg-tertiary text-text-secondary ${compact ? "px-1.5 py-1 text-[10px]" : "px-2 py-1.5 text-xs"}`}
            title={`${POSITION_LABELS[roleTier.role] || roleTier.role} 라인 티어`}
          >
            <PositionIcon
              position={roleTier.role}
              className={compact ? "!h-3 !w-3" : "!h-3.5 !w-3.5"}
            />
            <span className="truncate font-semibold">
              {roleTier.tier} {detail}
            </span>
          </span>
        );
      })}
    </div>
  );
}
