"use client";

import Image from "next/image";
import Link from "next/link";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatPosition } from "@/lib/lab-format";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { MetaRadarResponse } from "@/lib/lab-queries";

interface Props {
  tiers: MetaRadarResponse["tiers"] | undefined;
  activePeriod: string;
}

const POSITIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;

export function TierGridCard({ tiers, activePeriod }: Props) {
  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>포지션별 티어 그리드</CardTitle>
        <CardDescription>Wilson + 픽률 가중 점수 기반 (S/A/B/C/D)</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {POSITIONS.map((position) => {
          const rows = (tiers?.[position] ?? []).slice(0, 5);
          return (
            <div key={position} className="rounded-xl border border-white/10 bg-bg-primary/60 p-3">
              <p className="mb-2 text-sm font-semibold text-text-primary">{formatPosition(position)}</p>
              <div className="space-y-2">
                {rows.length === 0 ? (
                  <p className="text-xs text-text-tertiary">데이터 부족</p>
                ) : (
                  rows.map((row) => (
                    <Link
                      key={`${position}-${row.championId}`}
                      href={`/lab/champions/${row.championId}?period=${activePeriod}`}
                      className="flex items-center justify-between gap-2 text-xs transition-opacity hover:opacity-80"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded border border-white/10">
                          <Image
                            src={getChampionIconById(row.championId)}
                            alt={`champion-${row.championId}`}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <span className="truncate text-text-secondary">{row.championId}</span>
                      </div>
                      <Badge
                        variant={
                          row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"
                        }
                      >
                        {row.tier}
                      </Badge>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
