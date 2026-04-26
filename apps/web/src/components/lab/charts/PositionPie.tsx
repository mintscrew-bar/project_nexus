"use client";

import { useMemo } from "react";
import { formatRate, formatPosition } from "@/lib/lab-format";
import type { ChampionDetailResponse } from "@/lib/lab-queries";

const SLICE_COLORS = ["#667EEA", "#0bc4e2", "#764BA2", "#ffa726", "#f472b6"];

interface Props {
  detail: ChampionDetailResponse;
}

/** 포지션 분포 파이 차트 */
export function PositionPie({ detail }: Props) {
  const slices = useMemo(() => {
    const rows = detail.positions;
    const total = rows.reduce((acc, r) => acc + r.games, 0);
    if (rows.length === 0 || total === 0) return [];
    let startAngle = -Math.PI / 2;
    return rows.map((row, idx) => {
      const slice = (row.games / total) * Math.PI * 2;
      const endAngle = startAngle + slice;
      const largeArc = slice > Math.PI ? 1 : 0;
      const r = 76; const cx = 96; const cy = 96;
      const x1 = cx + Math.cos(startAngle) * r;
      const y1 = cy + Math.sin(startAngle) * r;
      const x2 = cx + Math.cos(endAngle) * r;
      const y2 = cy + Math.sin(endAngle) * r;
      const path = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
      startAngle = endAngle;
      return { ...row, path, color: SLICE_COLORS[idx % SLICE_COLORS.length] };
    });
  }, [detail]);

  if (slices.length === 0) {
    return <p className="text-sm text-text-secondary">포지션 분포 데이터가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <svg viewBox="0 0 192 192" className="h-44 w-44 shrink-0">
        {slices.map((s) => (
          <path key={s.position} d={s.path} fill={s.color} opacity={s.confidenceLevel === "low" ? 0.6 : 1} />
        ))}
        <circle cx="96" cy="96" r="36" fill="rgba(15,23,42,0.9)" />
      </svg>
      <div className="w-full space-y-2">
        {slices.map((s) => (
          <div
            key={`legend-${s.position}`}
            className={`rounded-lg bg-bg-secondary/40 px-3 py-2 text-xs ${
              s.confidenceLevel === "low"
                ? "border border-dashed border-white/10 opacity-70"
                : "border border-white/10"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary">{formatPosition(s.position)}</span>
            </div>
            <p className="mt-1 text-text-secondary">
              {s.games}게임 · {(s.pickRateWithinChampion * 100).toFixed(1)}% · 승률 {formatRate(s.winRate)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
