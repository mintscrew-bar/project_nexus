import { Select } from "@/components/ui/Select";

const EMPTY_TIER_OPTION = { value: "", label: "입력하지 않음" };
const PEAK_TIER_OPTIONS = [
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

const PEAK_RANK_OPTIONS = [
  { value: "IV", label: "IV" },
  { value: "III", label: "III" },
  { value: "II", label: "II" },
  { value: "I", label: "I" },
];

const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

export function PeakTierSelector({
  peakTier,
  peakRank,
  peakLp,
  onTierChange,
  onRankChange,
  onLpChange,
  disabled = false,
  allowEmpty = true,
}: {
  peakTier: string;
  peakRank: string;
  peakLp?: number | null;
  onTierChange: (tier: string) => void;
  onRankChange: (rank: string) => void;
  onLpChange?: (lp: number | null) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  const isApex = Boolean(peakTier) && APEX_TIERS.has(peakTier);
  const needsRank = Boolean(peakTier) && !isApex;

  const handleTierChange = (tier: string) => {
    onTierChange(tier);
    if (!tier || APEX_TIERS.has(tier)) {
      onRankChange("");
    } else if (!peakRank) {
      onRankChange("IV");
    }
    // 마스터 이하로 변경 시 LP 초기화
    if (!APEX_TIERS.has(tier)) {
      onLpChange?.(null);
    }
  };

  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-text-primary">역대 최고 티어</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Riot API에서 조회되지 않는 과거 최고 티어가 있으면 직접 입력할 수
          있습니다. 현재 티어가 이 기록보다 올라가면 자동 갱신됩니다.
        </p>
      </div>

      <div className={`grid gap-3 ${needsRank || isApex ? "grid-cols-2" : "grid-cols-1"}`}>
        <Select
          label="티어"
          value={peakTier}
          options={allowEmpty ? [EMPTY_TIER_OPTION, ...PEAK_TIER_OPTIONS] : PEAK_TIER_OPTIONS}
          onChange={handleTierChange}
          disabled={disabled}
        />
        {needsRank && (
          <Select
            label="디비전"
            value={peakRank || "IV"}
            options={PEAK_RANK_OPTIONS}
            onChange={onRankChange}
            disabled={disabled}
          />
        )}
        {isApex && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">LP</label>
            <input
              type="number"
              min={0}
              max={9999}
              value={peakLp ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onLpChange?.(val === "" ? null : Math.max(0, parseInt(val, 10)));
              }}
              placeholder="예: 412"
              disabled={disabled}
              className="h-10 w-full rounded-lg border border-bg-tertiary bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none disabled:opacity-50"
            />
          </div>
        )}
      </div>

      <p className="text-xs text-text-tertiary">
        {allowEmpty
          ? "직접 입력한 기록은 본인이 확인한 과거 기록을 기준으로 입력해주세요."
          : "저장된 최고 기록은 더 높은 기록으로만 갱신할 수 있습니다."}
      </p>
    </div>
  );
}
