"use client";

import Image from "next/image";
import Link from "next/link";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatDelta } from "@/lib/lab-format";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { MetaRadarResponse } from "@/lib/lab-queries";

interface Props {
  trending: MetaRadarResponse["trending"];
  activePeriod: string;
}

export function TrendingChampionsCard({ trending, activePeriod }: Props) {
  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>트렌딩 챔피언</CardTitle>
        <CardDescription>최근 픽률 상승폭 기준 TOP 5</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {trending.length === 0 ? (
          <p className="text-sm text-text-secondary">트렌딩 데이터가 아직 부족합니다.</p>
        ) : (
          trending.slice(0, 5).map((champion) => (
            <Link
              key={champion.championId}
              href={`/lab/champions/${champion.championId}?period=${activePeriod}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-primary/60 p-3 transition-colors hover:bg-bg-elevated"
            >
              <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                <Image
                  src={getChampionIconById(champion.championId)}
                  alt={champion.championNameKorean}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text-primary">{champion.championNameKorean}</p>
                <p className="text-xs text-text-tertiary">
                  승률 {champion.recentWinRate.toFixed(1)}% · 최근 {champion.recentGames}게임
                </p>
              </div>
              <Badge variant="success">{formatDelta(champion.pickRateDelta, 2)}</Badge>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
