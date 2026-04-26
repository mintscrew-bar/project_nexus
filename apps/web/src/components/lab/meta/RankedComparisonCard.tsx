"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatRate, formatDelta } from "@/lib/lab-format";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

interface RankedRow {
  championId: number;
  winRate: number;
  customWinRate: number | null;
  delta: number | null;
}

interface Props {
  rankedComparison: RankedRow[];
}

export function RankedComparisonCard({ rankedComparison }: Props) {
  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>내전 vs 랭크 메타 비교</CardTitle>
        <CardDescription>
          고티어(챌린저+그마) 랭크 메타와 내전 메타의 챔피언 승률 차이
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rankedComparison.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-bg-primary/60 p-4 text-sm text-text-secondary">
            랭크 메타 스냅샷 수집 중입니다. 고티어 시딩 유저 배치가 완료되면 표시됩니다.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="mb-3 flex gap-4 text-xs text-text-tertiary">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-accent-success" />
                랭크 우세
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-accent-danger" />
                내전 우세
              </span>
            </div>
            {rankedComparison.map((row) => {
              const isRankedBetter = (row.delta ?? 0) > 0;
              return (
                <Link
                  key={row.championId}
                  href={`/lab/champions/${row.championId}`}
                  className="flex items-center gap-2 rounded-lg bg-bg-primary/40 px-3 py-2 transition-colors hover:bg-bg-elevated"
                >
                  <Image
                    src={getChampionIconById(row.championId)}
                    alt={`챔피언 ${row.championId}`}
                    width={24}
                    height={24}
                    className="rounded-full"
                    unoptimized
                  />
                  <span className="w-20 truncate text-xs text-text-secondary">
                    {`#${row.championId}`}
                  </span>
                  <div className="flex flex-1 items-center gap-1 text-xs">
                    <span className="text-text-tertiary">
                      내전 {formatRate(row.customWinRate ?? 0)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-text-tertiary" />
                    <span className="text-text-primary">
                      랭크 {formatRate(row.winRate)}
                    </span>
                  </div>
                  <Badge
                    variant={isRankedBetter ? "success" : "danger"}
                    className="shrink-0 text-xs"
                  >
                    {formatDelta((row.delta ?? 0) * 100)}
                  </Badge>
                </Link>
              );
            })}
            <p className="mt-2 text-xs text-text-tertiary">
              * KR 챌린저+그마 30일 데이터 기준 (최소 5경기)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
