"use client";

import { useState } from "react";
import { getQueueTypeName } from "./match-utils";

interface GameResult {
  win: boolean;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  queueId?: number;  // 큐 타입 (전체 탭에서 구분 표시용)
}

interface WinLossTrendChartProps {
  games: GameResult[];
}

export default function WinLossTrendChart({ games }: WinLossTrendChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (games.length === 0) return null;

  const W = 500, H = 120;
  const padL = 8, padR = 8, padT = 16, padB = 20;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const count = games.length;

  // Build cumulative win rate data
  const cumData: { winRate: number; wins: number; total: number }[] = [];
  let wins = 0;
  for (let i = 0; i < count; i++) {
    if (games[i].win) wins++;
    const total = i + 1;
    cumData.push({ winRate: (wins / total) * 100, wins, total });
  }

  const toX = (i: number) => padL + (count > 1 ? (i / (count - 1)) * cW : cW / 2);
  const toY = (rate: number) => padT + cH - (rate / 100) * cH;

  // Build line path
  const linePath = cumData
    .map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.winRate).toFixed(1)}`)
    .join(" ");

  // Area path
  const areaPath = `${linePath} L${toX(count - 1).toFixed(1)},${(padT + cH).toFixed(1)} L${toX(0).toFixed(1)},${(padT + cH).toFixed(1)} Z`;

  const baselineY = toY(50);

  return (
    <div className="relative select-none">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="overflow-visible cursor-crosshair"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * W;
          if (count <= 1) {
            setHoverIdx(0);
          } else {
            const dataIdx = Math.round(((svgX - padL) / cW) * (count - 1));
            setHoverIdx(Math.max(0, Math.min(count - 1, dataIdx)));
          }
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* 50% baseline */}
        <line
          x1={padL} x2={padL + cW} y1={baselineY} y2={baselineY}
          stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="4,3"
        />
        <text x={padL + cW + 4} y={baselineY + 3} fontSize="8" fill="currentColor" fillOpacity="0.3">50%</text>

        {/* Area fill */}
        <path d={areaPath} fill="#6366f1" fillOpacity="0.08" />

        {/* Win rate line */}
        <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" />

        {/* Game dots */}
        {games.map((game, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(cumData[i].winRate)}
            r={hoverIdx === i ? 5 : 3}
            fill={game.win ? "#22c55e" : "#ef4444"}
            stroke="white"
            strokeWidth={hoverIdx === i ? 2 : 1}
            strokeOpacity="0.5"
          />
        ))}

        {/* Hover vertical line */}
        {hoverIdx !== null && (
          <line
            x1={toX(hoverIdx)} x2={toX(hoverIdx)}
            y1={padT} y2={padT + cH}
            stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="3,2"
          />
        )}

        {/* X axis labels */}
        <text x={padL} y={H - 2} fontSize="8" fill="currentColor" fillOpacity="0.35" textAnchor="start">1</text>
        <text x={padL + cW} y={H - 2} fontSize="8" fill="currentColor" fillOpacity="0.35" textAnchor="end">{count}</text>
      </svg>

      {/* Tooltip */}
      {hoverIdx !== null && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: `${(toX(hoverIdx) / W) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-bg-secondary/95 backdrop-blur-sm border border-bg-elevated rounded-lg shadow-xl px-2.5 py-1.5 text-[11px] whitespace-nowrap">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`font-bold ${games[hoverIdx].win ? "text-accent-success" : "text-accent-danger"}`}>
                {games[hoverIdx].win ? "승" : "패"}
              </span>
              <span className="text-text-secondary">{games[hoverIdx].championName}</span>
              {/* 큐 타입 뱃지 (전체 탭에서 큐 구분 표시) */}
              {games[hoverIdx].queueId !== undefined && (
                <span className="text-text-muted text-[10px]">
                  {getQueueTypeName(games[hoverIdx].queueId!)}
                </span>
              )}
            </div>
            <div className="text-text-tertiary">
              {games[hoverIdx].kills}/{games[hoverIdx].deaths}/{games[hoverIdx].assists} ·
              승률 {cumData[hoverIdx].winRate.toFixed(0)}% ({cumData[hoverIdx].wins}승/{cumData[hoverIdx].total - cumData[hoverIdx].wins}패)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
