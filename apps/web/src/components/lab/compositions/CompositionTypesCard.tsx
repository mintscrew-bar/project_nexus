"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { labQueryOptions, type CompositionsResponse } from "@/lib/lab-queries";
import type { LabPeriod } from "@/stores/lab-store";
import { getChampionIconById } from "@/components/matches/match-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { LabSourceBadge } from "@/components/lab/shared/LabSourceBadge";

interface Props {
  activePeriod: LabPeriod;
  canFetch: boolean;
}

/** 팀 구성 유형 분석 카드 */
export function CompositionTypesCard({ activePeriod, canFetch }: Props) {
  const [dataSource, setDataSource] = useState<"custom" | "ranked-community" | "all">("custom");
  const { data: compositionsData, isLoading: compositionsLoading } = useQuery<CompositionsResponse>({
    ...labQueryOptions.compositions({ period: activePeriod, source: dataSource }),
    enabled: canFetch,
  });

  const rows = compositionsData?.rows ?? [];

  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>팀 구성 유형 분석</CardTitle>
        <CardDescription>팀 단위 챔피언 태그와 경기 길이로 조합 성향, 승률, 근거를 봅니다.</CardDescription>
        <LabSourceBadge source={compositionsData?.source} />
      </CardHeader>
      <CardContent>
        <div className="mb-4 inline-flex rounded-lg border border-white/10 bg-bg-primary/60 p-1">
          {[
            { key: "custom", label: "내전" },
            { key: "ranked-community", label: "랭크" },
            { key: "all", label: "전체" },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setDataSource(option.key as "custom" | "ranked-community" | "all")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                dataSource === option.key
                  ? "bg-accent-primary/20 text-accent-primary"
                  : "text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {compositionsLoading ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : rows.length === 0 ? (
          <LabEmptyState level="insufficient" section="조합 유형" />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={`comp-${row.type}`}
                className={`rounded-xl bg-bg-primary/50 p-4 ${
                  row.confidenceLevel === "low"
                    ? "border border-dashed border-white/10 opacity-70"
                    : "border border-white/10"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-semibold text-text-primary">{row.label}</p>
                      <p className="mt-1 text-xs text-text-tertiary">{row.description}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {row.exampleChampions.map((champion) => (
                        <Link key={`${row.type}-${champion.championId}`} href={`/lab/champions/${champion.championId}`} title={`${champion.championNameKorean} ${champion.games}회`}>
                          <div className="relative h-6 w-6 overflow-hidden rounded border border-white/10 transition-opacity hover:opacity-80">
                            <Image
                              src={getChampionIconById(champion.championId)}
                              alt={champion.championNameKorean}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
                {/* 승률 바 */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                  <div
                    className="h-full rounded-full bg-accent-info"
                    style={{ width: `${Math.max(4, row.winRate * 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                  <span>{row.games}팀</span>
                  <span>승률 {(row.winRate * 100).toFixed(1)}%</span>
                  <span>픽률 {(row.pickRate * 100).toFixed(1)}%</span>
                  <span>성향 점수 {(row.avgScore * 100).toFixed(0)}</span>
                  <span>평균 {Math.round(row.avgGameDurationSec / 60)}분</span>
                </div>
                {row.reasons.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {row.reasons.map((reason) => (
                      <span key={`${row.type}-${reason}`} className="rounded border border-white/10 bg-bg-secondary/70 px-2 py-1 text-xs text-text-tertiary">
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {compositionsData?.caveat && (
              <p className="text-xs text-text-tertiary">{compositionsData.caveat}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
