"use client";

import { Swords } from "lucide-react";
import {
  getSeriesPresetsForTeamCount,
  type SeriesPreset,
} from "@nexus/types";

/** 게임당 평균 소요 시간(시간). 예상 시간 표시에만 쓴다. */
const HOURS_PER_GAME = 0.5;

function formatHours(games: number): string {
  const hours = games * HOURS_PER_GAME;
  // 0.5 단위로 떨어지므로 소수점 한 자리면 충분하다.
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

function formatEstimate(minGames: number, maxGames: number): string {
  if (minGames === maxGames) {
    return `${minGames}경기 · 약 ${formatHours(minGames)}시간`;
  }
  return `${minGames}~${maxGames}경기 · 약 ${formatHours(minGames)}~${formatHours(maxGames)}시간`;
}

/**
 * 다전제 프리셋 선택.
 *
 * 고를 수 있는 프리셋은 팀 수마다 다르다 — 2팀 방에는 "결승만 3판 2선"이
 * 성립하지 않고, 8팀 방에는 완주가 불가능한 조합을 아예 내주지 않는다.
 * 선택지가 하나뿐이면(리그전 등 다전제 미지원) 렌더하지 않는다.
 */
export function SeriesPresetSelector({
  teamCount,
  value,
  onChange,
  disabled = false,
}: {
  teamCount: number;
  value: SeriesPreset;
  onChange: (preset: SeriesPreset) => void;
  disabled?: boolean;
}) {
  const presets = getSeriesPresetsForTeamCount(teamCount);

  if (presets.length <= 1) return null;

  return (
    <div>
      <label className="mb-3 block text-sm font-semibold text-text-primary">
        <Swords className="mr-2 inline h-4 w-4" />
        경기 방식
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {presets.map((preset) => {
          const selected = preset.key === value;
          return (
            <button
              key={preset.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(preset.key)}
              className={`rounded-lg border-2 p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-accent-primary bg-accent-primary/10"
                  : "border-bg-tertiary bg-bg-tertiary/50 hover:border-bg-elevated"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-text-primary">
                  {preset.label}
                </span>
                {preset.recommended && (
                  <span className="rounded bg-accent-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-primary">
                    추천
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-text-secondary">
                {preset.description}
              </div>
              <div className="mt-1 text-xs text-accent-primary">
                {formatEstimate(preset.minGames, preset.maxGames)}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        다전제는 2세트부터 직전 세트에서 진 팀이 진영을 고릅니다.
      </p>
    </div>
  );
}
