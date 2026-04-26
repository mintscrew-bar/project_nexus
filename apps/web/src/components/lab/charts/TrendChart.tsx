"use client";

import { useMemo, useState } from "react";
import type { ChampionDetailResponse } from "@/lib/lab-queries";

interface Props {
  detail: ChampionDetailResponse;
}

/** 기간별 승률 추이 SVG 차트 (hover 툴팁 포함) */
export function TrendChart({ detail }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    const points = detail.winrateTrend;
    if (points.length < 3) return null;
    const width = 520;
    const height = 220;
    const pad = { left: 34, right: 10, top: 10, bottom: 28 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const xDenom = Math.max(points.length - 1, 1);
    const minRate = Math.min(...points.map((p) => p.winRate));
    const maxRate = Math.max(...points.map((p) => p.winRate));
    const yMin = Math.max(0, minRate - 0.08);
    const yMax = Math.min(1, maxRate + 0.08);
    const yRange = Math.max(yMax - yMin, 0.01);
    const toX = (idx: number) => pad.left + (idx / xDenom) * chartWidth;
    const toY = (rate: number) => pad.top + chartHeight - ((rate - yMin) / yRange) * chartHeight;
    const path = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.winRate).toFixed(1)}`)
      .join(" ");
    const area = `${path} L${toX(points.length - 1).toFixed(1)},${(pad.top + chartHeight).toFixed(1)} L${toX(0).toFixed(1)},${(pad.top + chartHeight).toFixed(1)} Z`;
    const yTicks = [yMin, (yMin + yMax) / 2, yMax];
    const xTicks = points.map((p, i) => ({
      x: toX(i),
      label: new Date(p.weekStart).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
    }));
    return { width, height, pad, points, yTicks, xTicks, toX, toY, path, area };
  }, [detail]);

  if (!chart) {
    return <p className="text-sm text-text-secondary">주간 데이터가 3포인트 미만이라 추이를 표시하지 않습니다.</p>;
  }

  const hovered = hoveredIdx !== null ? chart.points[hoveredIdx] : null;
  const hoveredX = hoveredIdx !== null ? chart.xTicks[hoveredIdx].x : 0;
  const hoveredY = hovered ? chart.toY(hovered.winRate) : 0;

  // 툴팁이 오른쪽 끝에 걸릴 경우 왼쪽으로 표시
  const tooltipW = 100;
  const tooltipX = hoveredX + tooltipW + 12 > chart.width
    ? hoveredX - tooltipW - 8
    : hoveredX + 8;

  return (
    <svg
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      className="w-full"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {/* Y축 그리드 + 레이블 */}
      {chart.yTicks.map((tick, idx) => (
        <g key={idx}>
          <line
            x1={chart.pad.left}
            x2={chart.width - chart.pad.right}
            y1={chart.toY(tick)}
            y2={chart.toY(tick)}
            stroke="currentColor"
            strokeOpacity={0.12}
          />
          <text
            x={chart.pad.left - 4}
            y={chart.toY(tick) + 4}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            fillOpacity={0.6}
          >
            {(tick * 100).toFixed(1)}%
          </text>
        </g>
      ))}

      {/* 영역 채우기 + 선 */}
      <path d={chart.area} fill="var(--color-accent-success, #00c853)" fillOpacity={0.1} />
      <path d={chart.path} stroke="var(--color-accent-success, #00c853)" strokeWidth="2.5" fill="none" />

      {/* 데이터 포인트 + 투명 히트 영역 */}
      {chart.points.map((p, i) => (
        <g key={p.weekStart}>
          {/* 히트 영역 (투명한 넓은 영역) */}
          <rect
            x={chart.xTicks[i].x - 16}
            y={chart.pad.top}
            width={32}
            height={chart.height - chart.pad.top - chart.pad.bottom}
            fill="transparent"
            onMouseEnter={() => setHoveredIdx(i)}
          />
          {/* 포인트 원 */}
          <circle
            cx={chart.xTicks[i].x}
            cy={chart.toY(p.winRate)}
            r={hoveredIdx === i ? 5 : 3.5}
            fill="var(--color-accent-success, #00c853)"
            style={{ transition: "r 0.1s" }}
          />
        </g>
      ))}

      {/* X축 레이블 */}
      {chart.xTicks.map((tick, i) => (
        <text
          key={`${tick.label}-${i}`}
          x={tick.x}
          y={chart.height - 8}
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
          fillOpacity={0.6}
        >
          {tick.label}
        </text>
      ))}

      {/* hover 툴팁 */}
      {hovered && hoveredIdx !== null && (
        <g>
          {/* 수직 가이드 선 */}
          <line
            x1={hoveredX}
            x2={hoveredX}
            y1={chart.pad.top}
            y2={chart.height - chart.pad.bottom}
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeDasharray="3,3"
          />
          {/* 툴팁 박스 */}
          <rect
            x={tooltipX}
            y={hoveredY - 28}
            width={tooltipW}
            height={38}
            rx="5"
            fill="rgba(15,23,42,0.92)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />
          <text
            x={tooltipX + tooltipW / 2}
            y={hoveredY - 14}
            textAnchor="middle"
            fontSize="10"
            fill="rgba(255,255,255,0.6)"
          >
            {chart.xTicks[hoveredIdx].label}
          </text>
          <text
            x={tooltipX + tooltipW / 2}
            y={hoveredY + 2}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="var(--color-accent-success, #00c853)"
          >
            {(hovered.winRate * 100).toFixed(1)}%
          </text>
          <text
            x={tooltipX + tooltipW / 2}
            y={hoveredY + 14}
            textAnchor="middle"
            fontSize="9"
            fill="rgba(255,255,255,0.4)"
          >
            {hovered.games}게임
          </text>
        </g>
      )}
    </svg>
  );
}
