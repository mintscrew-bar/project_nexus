"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import type { ChampionDetailResponse } from "@/lib/lab-queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui";
import { getItemIcon } from "@/components/matches/match-utils";

interface Props {
  detail: ChampionDetailResponse;
}

// ─── 패치별 승률 바 차트 ─────────────────────────────────────────────────────────

function PatchWinRateChart({
  patchTrend,
}: {
  patchTrend: ChampionDetailResponse["patchTrend"];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (patchTrend.length === 0) return null;
    const width = 520;
    const height = 200;
    const pad = { left: 38, right: 10, top: 10, bottom: 28 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const rates = patchTrend.map((p) => p.winRate);
    const rawMin = Math.min(...rates);
    const rawMax = Math.max(...rates);
    const yMin = Math.max(0, rawMin - 0.08);
    const yMax = Math.min(1, rawMax + 0.08);
    const yRange = Math.max(yMax - yMin, 0.01);

    const barW = Math.min(36, chartW / patchTrend.length - 6);
    const toX = (i: number) =>
      pad.left + (i + 0.5) * (chartW / patchTrend.length);
    const toBarTop = (rate: number) =>
      pad.top + chartH - ((rate - yMin) / yRange) * chartH;
    const barBottom = pad.top + chartH;

    const yTicks = [yMin, (yMin + yMax) / 2, yMax];

    return { width, height, pad, yTicks, chartH, barW, toX, toBarTop, barBottom, yMin, yMax, yRange };
  }, [patchTrend]);

  if (!chart) {
    return (
      <p className="text-sm text-text-secondary">패치 데이터가 없습니다.</p>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      className="w-full"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {/* Y축 그리드 + 레이블 */}
      {chart.yTicks.map((tick, i) => (
        <g key={i}>
          <line
            x1={chart.pad.left}
            x2={chart.width - chart.pad.right}
            y1={chart.toBarTop(tick)}
            y2={chart.toBarTop(tick)}
            stroke="currentColor"
            strokeOpacity={0.1}
          />
          <text
            x={chart.pad.left - 4}
            y={chart.toBarTop(tick) + 4}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            fillOpacity={0.55}
          >
            {(tick * 100).toFixed(0)}%
          </text>
        </g>
      ))}

      {/* 50% 기준선 */}
      {chart.yMin < 0.5 && chart.yMax > 0.5 && (
        <line
          x1={chart.pad.left}
          x2={chart.width - chart.pad.right}
          y1={chart.toBarTop(0.5)}
          y2={chart.toBarTop(0.5)}
          stroke="rgba(255,255,255,0.25)"
          strokeDasharray="4,3"
        />
      )}

      {/* 바 */}
      {patchTrend.map((p, i) => {
        const x = chart.toX(i);
        const barTop = chart.toBarTop(p.winRate);
        const barH = chart.barBottom - barTop;
        const isHover = hoveredIdx === i;
        const isWin = p.winRate >= 0.5;
        return (
          <g key={p.patch}>
            <rect
              x={x - chart.barW / 2}
              y={barTop}
              width={chart.barW}
              height={Math.max(barH, 2)}
              rx="3"
              fill={isWin ? "var(--color-accent-success, #00c853)" : "var(--color-accent-danger, #ef4444)"}
              fillOpacity={isHover ? 0.9 : 0.55}
              style={{ transition: "fill-opacity 0.1s" }}
            />
            {/* 히트 영역 */}
            <rect
              x={x - chart.barW / 2 - 4}
              y={chart.pad.top}
              width={chart.barW + 8}
              height={chart.chartH}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
            />
          </g>
        );
      })}

      {/* X축 패치 레이블 */}
      {patchTrend.map((p, i) => (
        <text
          key={p.patch}
          x={chart.toX(i)}
          y={chart.height - 8}
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
          fillOpacity={hoveredIdx === i ? 0.9 : 0.55}
        >
          {p.patch}
        </text>
      ))}

      {/* hover 툴팁 */}
      {hoveredIdx !== null && (() => {
        const p = patchTrend[hoveredIdx];
        const x = chart.toX(hoveredIdx);
        const tipW = 108;
        const tipX = x + tipW + 12 > chart.width ? x - tipW - 6 : x + 6;
        const tipY = chart.toBarTop(p.winRate) - 10;
        return (
          <g>
            <rect
              x={tipX}
              y={tipY}
              width={tipW}
              height={46}
              rx="5"
              fill="rgba(15,23,42,0.92)"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
            <text x={tipX + tipW / 2} y={tipY + 14} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.55)">
              {p.patch} 패치
            </text>
            <text
              x={tipX + tipW / 2}
              y={tipY + 29}
              textAnchor="middle"
              fontSize="12"
              fontWeight="700"
              fill={p.winRate >= 0.5 ? "var(--color-accent-success, #00c853)" : "var(--color-accent-danger, #ef4444)"}
            >
              {(p.winRate * 100).toFixed(1)}%
            </text>
            <text x={tipX + tipW / 2} y={tipY + 42} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)">
              {p.games}게임
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// ─── 패치별 아이템 변화 테이블 ───────────────────────────────────────────────────

function PatchItemTable({
  patchItemTrend,
}: {
  patchItemTrend: ChampionDetailResponse["patchItemTrend"];
}) {
  if (patchItemTrend.length === 0) {
    return (
      <p className="text-sm text-text-secondary">패치별 아이템 데이터가 없습니다.</p>
    );
  }

  // 최신 패치부터 표시
  const rows = [...patchItemTrend].reverse();

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.patch} className="flex items-center gap-3">
          {/* 패치 레이블 */}
          <span className="w-12 shrink-0 text-xs font-semibold text-text-tertiary">
            {row.patch}
          </span>
          {/* 아이템 아이콘 + 픽률 */}
          <div className="flex flex-wrap gap-2">
            {row.topItems.map((item) => (
              <div key={item.itemId} className="flex flex-col items-center gap-0.5">
                <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10">
                  <Image
                    src={getItemIcon(item.itemId)}
                    alt={`item-${item.itemId}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <span className="text-[10px] text-text-tertiary">
                  {item.pickRate.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 메인 카드 ───────────────────────────────────────────────────────────────────

type Tab = "winrate" | "items";

export function PatchTrendCard({ detail }: Props) {
  const [tab, setTab] = useState<Tab>("winrate");

  const hasPatchData = detail.patchTrend.length > 0;
  const hasItemData = detail.patchItemTrend.length > 0;

  if (!hasPatchData && !hasItemData) return null;

  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">패치 히스토리</CardTitle>
            <CardDescription>패치별 승률 변화 및 아이템 빌드 추이</CardDescription>
          </div>
          {/* 탭 토글 */}
          <div className="flex overflow-hidden rounded-lg border border-white/10 bg-bg-primary/60">
            <button
              type="button"
              onClick={() => setTab("winrate")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === "winrate"
                  ? "bg-accent-primary/20 text-accent-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              승률 추이
            </button>
            <button
              type="button"
              onClick={() => setTab("items")}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                tab === "items"
                  ? "bg-accent-primary/20 text-accent-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              아이템 변화
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {tab === "winrate" ? (
          hasPatchData ? (
            <PatchWinRateChart patchTrend={detail.patchTrend} />
          ) : (
            <p className="text-sm text-text-secondary">패치 승률 데이터가 없습니다.</p>
          )
        ) : hasItemData ? (
          <PatchItemTable patchItemTrend={detail.patchItemTrend} />
        ) : (
          <p className="text-sm text-text-secondary">패치별 아이템 데이터가 없습니다.</p>
        )}
      </CardContent>
    </Card>
  );
}
