"use client";

import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { labQueryOptions, type CompositionsResponse } from "@/lib/lab-queries";
import type { LabPeriod } from "@/stores/lab-store";
import { getChampionIconById } from "@/components/matches/match-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { LabSourceBadge } from "@/components/lab/shared/LabSourceBadge";

/** 조합 유형별 예시 챔피언 ID */
const COMPOSITION_EXAMPLE_CHAMPIONS: Record<string, number[]> = {
  TEAMFIGHT: [89, 99, 53],
  SPLIT_PUSH: [157, 92, 114],
  POKE: [81, 115, 74],
  EARLY_AGGRO: [64, 121, 91],
  TANK_LINE: [54, 516, 113],
};

interface Props {
  activePeriod: LabPeriod;
  canFetch: boolean;
}

/** 팀 구성 유형 분석 카드 */
export function CompositionTypesCard({ activePeriod, canFetch }: Props) {
  const { data: compositionsData, isLoading: compositionsLoading } = useQuery<CompositionsResponse>({
    ...labQueryOptions.compositions(activePeriod),
    enabled: canFetch,
  });

  const rows = compositionsData?.rows ?? [];

  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>팀 구성 유형 분석</CardTitle>
        <CardDescription>한타/스플릿/포킹/속공/탱커라인 유형별 승률과 픽률</CardDescription>
        <LabSourceBadge source={compositionsData?.source} />
      </CardHeader>
      <CardContent>
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
                className={`rounded-xl bg-bg-primary/50 p-3 ${
                  row.confidenceLevel === "low"
                    ? "border border-dashed border-white/10 opacity-70"
                    : "border border-white/10"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-text-primary">{row.label}</p>
                    <div className="flex items-center gap-1">
                      {(COMPOSITION_EXAMPLE_CHAMPIONS[row.type] ?? []).map((championId) => (
                        <Link key={`${row.type}-${championId}`} href={`/lab/champions/${championId}`}>
                          <div className="relative h-6 w-6 overflow-hidden rounded border border-white/10 transition-opacity hover:opacity-80">
                            <Image
                              src={getChampionIconById(championId)}
                              alt={`example-${championId}`}
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
                  <span>평균 {Math.round(row.avgGameDurationSec / 60)}분</span>
                </div>
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
