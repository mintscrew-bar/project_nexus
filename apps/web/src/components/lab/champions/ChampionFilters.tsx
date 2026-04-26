"use client";

type SortKey = "winRate" | "pickRate" | "banRate";
type Position = "ALL" | "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

const SORT_LABELS: Record<SortKey, string> = {
  winRate: "승률순",
  pickRate: "픽률순",
  banRate: "밴률순",
};

const POSITION_LABELS: Record<Position, string> = {
  ALL: "전체",
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
  includeLowSample: boolean;
  onIncludeLowSampleChange: (v: boolean) => void;
  position: Position;
  onPositionChange: (v: Position) => void;
}

export function ChampionFilters({
  search, onSearchChange,
  sort, onSortChange,
  includeLowSample, onIncludeLowSampleChange,
  position, onPositionChange,
}: Props) {
  return (
    <>
      {/* 검색 + 정렬 */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="챔피언 검색 (한글/영문)"
          className="w-full rounded-xl border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary md:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          {(["winRate", "pickRate", "banRate"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSortChange(key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                sort === key
                  ? "bg-accent-primary/20 text-accent-primary"
                  : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              {SORT_LABELS[key]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onIncludeLowSampleChange(!includeLowSample)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              includeLowSample
                ? "bg-accent-info/20 text-accent-info"
                : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            5게임 미만 포함
          </button>
        </div>
      </div>

      {/* 포지션 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["ALL", "TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const).map((pos) => (
          <button
            key={pos}
            type="button"
            onClick={() => onPositionChange(pos)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              position === pos
                ? "bg-accent-purple/20 text-accent-purple"
                : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            {POSITION_LABELS[pos]}
          </button>
        ))}
      </div>
    </>
  );
}
