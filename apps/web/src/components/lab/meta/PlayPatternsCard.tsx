"use client";

import { Activity } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { PlayPatternsResponse } from "@/lib/lab-queries";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

interface Props {
  playPatterns: PlayPatternsResponse;
}

export function PlayPatternsCard({ playPatterns }: Props) {
  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent-info" />
          내전 활동 패턴
        </CardTitle>
        <CardDescription>
          KST 기준 요일·시간대별 내전 빈도 (총 {playPatterns.totalGames}경기 / {playPatterns.periodDays}일)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {/* 요일별 */}
          <div>
            <p className="mb-3 text-xs font-semibold text-text-secondary">요일별 빈도</p>
            <div className="space-y-1.5">
              {playPatterns.byDayOfWeek.map((d) => {
                const maxGames = Math.max(...playPatterns.byDayOfWeek.map((x) => x.games), 1);
                const pct = d.games / maxGames;
                const isPeak = d.dayOfWeek === playPatterns.peakDayOfWeek;
                return (
                  <div key={d.dayOfWeek} className="flex items-center gap-2">
                    <span className={`w-4 text-xs font-medium ${isPeak ? "text-accent-info" : "text-text-tertiary"}`}>
                      {d.dayLabel}
                    </span>
                    <div className="flex-1 rounded-full bg-bg-primary/60">
                      <div
                        className={`h-4 rounded-full ${isPeak ? "bg-accent-info" : "bg-white/20"}`}
                        style={{ width: `${Math.max(pct * 100, 2)}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-text-secondary">{d.games}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 시간대별 */}
          <div>
            <p className="mb-3 text-xs font-semibold text-text-secondary">시간대별 빈도 (KST)</p>
            <div className="flex h-32 items-end gap-0.5">
              {playPatterns.byHour.map((h) => {
                const maxGames = Math.max(...playPatterns.byHour.map((x) => x.games), 1);
                const pct = h.games / maxGames;
                const isPeak = h.hour === playPatterns.peakHour;
                return (
                  <div key={h.hour} className="group relative flex flex-1 flex-col items-center">
                    <div
                      className={`w-full rounded-t transition-colors ${isPeak ? "bg-accent-info" : "bg-white/20 group-hover:bg-white/30"}`}
                      style={{ height: `${Math.max(pct * 100, 2)}%` }}
                    />
                    {h.hour % 6 === 0 && (
                      <span className="absolute -bottom-5 text-[9px] text-text-tertiary">{h.hour}시</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 flex gap-4 text-xs text-text-tertiary">
              <span>
                피크 요일:{" "}
                <span className="font-medium text-accent-info">
                  {DAY_LABELS[playPatterns.peakDayOfWeek]}요일
                </span>
              </span>
              <span>
                피크 시간:{" "}
                <span className="font-medium text-accent-info">{playPatterns.peakHour}시</span>
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
