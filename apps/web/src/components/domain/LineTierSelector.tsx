import Image from "next/image";
import { Select } from "@/components/ui/Select";
import { getRoleIcon } from "@/lib/role-icon";

export type LineRole = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";
export type LineTierValue = { tier: string; rank: string; lp: number | null };
export type LineTierMap = Record<LineRole, LineTierValue>;

const ROLES: LineRole[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const ROLE_LABELS: Record<LineRole, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서폿",
};
const TIER_OPTIONS = [
  { value: "", label: "미입력" },
  { value: "IRON", label: "아이언" },
  { value: "BRONZE", label: "브론즈" },
  { value: "SILVER", label: "실버" },
  { value: "GOLD", label: "골드" },
  { value: "PLATINUM", label: "플래티넘" },
  { value: "EMERALD", label: "에메랄드" },
  { value: "DIAMOND", label: "다이아몬드" },
  { value: "MASTER", label: "마스터" },
  { value: "GRANDMASTER", label: "그랜드마스터" },
  { value: "CHALLENGER", label: "챌린저" },
];
const RANK_OPTIONS = ["IV", "III", "II", "I"].map((value) => ({
  value,
  label: value,
}));
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

export function createEmptyLineTiers(): LineTierMap {
  return Object.fromEntries(
    ROLES.map((role) => [role, { tier: "", rank: "IV", lp: null }]),
  ) as LineTierMap;
}

export function toLineTierMap(
  values?: Array<{ role: string; tier: string; rank?: string; lp?: number }>,
): LineTierMap {
  const result = createEmptyLineTiers();
  for (const value of values || []) {
    if (!ROLES.includes(value.role as LineRole)) continue;
    const role = value.role as LineRole;
    result[role] = {
      tier: value.tier,
      rank: value.rank || "IV",
      lp: value.lp ?? null,
    };
  }
  return result;
}

export function toLineTierPayload(value: LineTierMap) {
  return Object.fromEntries(
    ROLES.map((role) => [
      role,
      {
        tier: value[role].tier,
        rank: value[role].rank,
        lp: value[role].lp ?? undefined,
      },
    ]),
  ) as Record<string, { tier: string; rank: string; lp?: number }>;
}

export function LineTierSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: LineTierMap;
  onChange: (value: LineTierMap) => void;
  disabled?: boolean;
}) {
  const updateRole = (role: LineRole, patch: Partial<LineTierValue>) => {
    onChange({ ...value, [role]: { ...value[role], ...patch } });
  };

  return (
    <div className="border-t border-bg-tertiary pt-4">
      <p className="text-sm font-semibold text-text-primary">라인별 티어</p>
      <p className="mt-1 text-xs leading-5 text-text-secondary">
        라인마다 실력이 다르면 직접 입력해주세요. 미입력한 라인은 현재 솔로랭크
        티어로 표시됩니다.
      </p>
      <div className="mt-3 space-y-2">
        {ROLES.map((role) => {
          const current = value[role];
          const isApex = APEX_TIERS.has(current.tier);
          return (
            <div
              key={role}
              className="grid min-h-12 grid-cols-[72px_minmax(0,1fr)_80px] items-end gap-2"
            >
              <div className="flex h-10 items-center gap-2 text-sm font-medium text-text-primary">
                <Image
                  src={getRoleIcon(role) || ""}
                  alt=""
                  width={20}
                  height={20}
                />
                <span>{ROLE_LABELS[role]}</span>
              </div>
              <Select
                value={current.tier}
                options={TIER_OPTIONS}
                onChange={(tier) =>
                  updateRole(role, {
                    tier,
                    rank:
                      tier && !APEX_TIERS.has(tier) ? current.rank || "IV" : "",
                    lp: APEX_TIERS.has(tier) ? current.lp : null,
                  })
                }
                disabled={disabled}
              />
              {current.tier && !isApex ? (
                <Select
                  value={current.rank || "IV"}
                  options={RANK_OPTIONS}
                  onChange={(rank) => updateRole(role, { rank })}
                  disabled={disabled}
                />
              ) : isApex ? (
                <input
                  aria-label={`${ROLE_LABELS[role]} LP`}
                  type="number"
                  min={0}
                  max={9999}
                  value={current.lp ?? ""}
                  onChange={(event) =>
                    updateRole(role, {
                      lp:
                        event.target.value === ""
                          ? null
                          : Math.max(0, Number(event.target.value)),
                    })
                  }
                  placeholder="LP"
                  disabled={disabled}
                  className="h-10 min-w-0 rounded-lg border border-bg-tertiary bg-bg-primary px-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none disabled:opacity-50"
                />
              ) : (
                <div className="h-10" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
