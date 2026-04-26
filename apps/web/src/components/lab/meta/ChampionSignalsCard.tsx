"use client";

import Image from "next/image";
import Link from "next/link";
import { getChampionIconById } from "@/components/matches/match-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { LabOverview } from "@/lib/lab-queries";

interface Props {
  championSignals: LabOverview["championSignals"];
  activePeriod: string;
}

export function ChampionSignalsCard({ championSignals, activePeriod }: Props) {
  if (championSignals.length === 0) return null;

  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>연구 우선순위 챔피언</CardTitle>
        <CardDescription>표본이 쌓인 챔피언부터 내전 특화 지표 후보로 분류합니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {championSignals.map((champion) => (
          <Link
            key={champion.championId}
            href={`/lab/champions/${champion.championId}?period=${activePeriod}`}
            className="rounded-2xl border border-white/10 bg-bg-primary/60 p-4 transition-colors hover:bg-bg-elevated"
          >
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
                <Image
                  src={getChampionIconById(champion.championId)}
                  alt={champion.championName}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div>
                <p className="font-semibold text-text-primary">{champion.championNameKorean}</p>
                <p className="text-xs text-text-tertiary">{champion.games.toLocaleString()}게임 표본</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-tertiary">승률</p>
                <p className="mt-0.5 font-semibold text-text-primary">{champion.winRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-text-tertiary">평균 KDA</p>
                <p className="mt-0.5 font-semibold text-text-primary">
                  {champion.avgKills.toFixed(1)} / {champion.avgDeaths.toFixed(1)} / {champion.avgAssists.toFixed(1)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
