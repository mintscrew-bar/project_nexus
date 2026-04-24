"use client";

import Link from "next/link";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { formatRate } from "@/lib/lab-format";
import type { AuctionEfficiencyResponse } from "@/lib/lab-queries";

function TrendIcon({ delta }: { delta: number }) {
  if (delta > 0.02) return <TrendingUp className="h-3.5 w-3.5 text-accent-success" />;
  if (delta < -0.02) return <TrendingDown className="h-3.5 w-3.5 text-accent-danger" />;
  return <Minus className="h-3.5 w-3.5 text-text-tertiary" />;
}

export function AuctionEfficiencyCard({ data }: { data: AuctionEfficiencyResponse }) {
  const { scatter, efficiencyTop, overpricedTop, buckets } = data;

  const chartW = 480;
  const chartH = 200;
  const prices = scatter.map((d) => d.soldPrice);
  const perfs = scatter.map((d) => d.performance);
  const xMin = Math.min(...prices, 0);
  const xMax = Math.max(...prices, 100);
  const yMin = Math.min(...perfs, 0);
  const yMax = Math.max(...perfs, 1);
  const toX = (v: number) => ((v - xMin) / (xMax - xMin || 1)) * chartW;
  const toY = (v: number) => chartH - ((v - yMin) / (yMax - yMin || 1)) * chartH;

  const { beta0, beta1 } = data.regression;
  const regX1 = xMin;
  const regX2 = xMax;
  const regY1 = beta0 + beta1 * regX1;
  const regY2 = beta0 + beta1 * regX2;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold text-text-secondary">경매가 vs 퍼포먼스 산점도</p>
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-bg-primary/50 p-3">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="h-48 w-full" preserveAspectRatio="xMidYMid meet">
            <line
              x1={toX(regX1)}
              y1={toY(regY1)}
              x2={toX(regX2)}
              y2={toY(regY2)}
              stroke="#667EEA"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              opacity={0.7}
            />
            {scatter.map((d) => (
              <circle
                key={d.userId}
                cx={toX(d.soldPrice)}
                cy={toY(d.performance)}
                r={3.5}
                fill={d.efficiency > 0 ? "#00c853" : "#ff1744"}
                opacity={0.7}
              >
                <title>
                  {d.username}: 경매가 {d.soldPrice} / 퍼포먼스 {d.performance.toFixed(2)}
                </title>
              </circle>
            ))}
          </svg>
          <p className="mt-1 text-center text-xs text-text-tertiary">
            초록 = 효율 양호 · 빨강 = 고평가 · 파선 = 회귀선
          </p>
        </div>
      </div>

      {buckets.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-text-secondary">경매가 구간별 지표</p>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-bg-primary/70 text-text-tertiary">
                <tr>
                  <th className="px-3 py-2 text-left">구간</th>
                  <th className="px-3 py-2 text-right">유저</th>
                  <th className="px-3 py-2 text-right">승률</th>
                  <th className="px-3 py-2 text-right">평균 KDA</th>
                  <th className="px-3 py-2 text-right">딜 점유율</th>
                  <th className="px-3 py-2 text-right">평균 퍼포먼스</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.label} className="border-t border-white/10 bg-bg-secondary/40 hover:bg-bg-elevated/60">
                    <td className="px-3 py-2 text-text-primary">{b.label}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{b.users}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{formatRate(b.winRate)}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{b.avgKda.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{(b.avgDamageShare * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{b.avgPerformance.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-accent-success">효율 우수 TOP 5</p>
          <div className="space-y-2">
            {efficiencyTop.slice(0, 5).map((u) => (
              <div key={u.userId} className="flex items-center justify-between rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2">
                <Link href={`/users/${u.userId}`} className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-accent-primary">
                  {u.username}
                </Link>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span>{formatRate(u.winRate)}</span>
                  <span className="font-semibold text-accent-success">
                    {u.efficiency > 0 ? "+" : ""}
                    {u.efficiency.toFixed(3)}
                  </span>
                  <TrendIcon delta={u.recentTrendDelta} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-accent-danger">고평가 TOP 5</p>
          <div className="space-y-2">
            {overpricedTop.slice(0, 5).map((u) => (
              <div key={u.userId} className="flex items-center justify-between rounded-xl border border-white/10 bg-bg-primary/50 px-3 py-2">
                <Link href={`/users/${u.userId}`} className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-accent-primary">
                  {u.username}
                </Link>
                <div className="flex items-center gap-3 text-xs text-text-secondary">
                  <span>{formatRate(u.winRate)}</span>
                  <span className="font-semibold text-accent-danger">{u.efficiency.toFixed(3)}</span>
                  <TrendIcon delta={u.recentTrendDelta} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
