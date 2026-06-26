"use client";

import { Trophy } from "lucide-react";
import { ChampionImage } from "@/components/ChampionImage";
import { PositionIcon, POSITION_LABELS } from "@/app/tournaments/[id]/lobby/_components/icons";
import { cn } from "@/lib/utils";
import { getChampionKoreanName } from "@nexus/types";

const ROLE_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서포터",
};

interface PreferredChampionGroup {
  role: string;
  champions: Array<{ championId: string; order?: number }>;
}

interface RankedChampionStat {
  championName: string;
  games?: number;
  wins?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
}

function getRoleLabel(role: string) {
  return POSITION_LABELS[role] ?? ROLE_LABELS[role] ?? role;
}

function getChampionMetrics(champ: RankedChampionStat) {
  const games = champ.games ?? 0;
  const wins = champ.wins ?? 0;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
  const kills = champ.kills ?? 0;
  const deaths = champ.deaths ?? 0;
  const assists = champ.assists ?? 0;
  const kda = games > 0
    ? deaths > 0
      ? ((kills + assists) / deaths).toFixed(2)
      : "Perfect"
    : "-";

  return { games, winRate, kda };
}

export function PreferredChampionPanel({
  groups,
  getChampionKey,
  getChampionName,
}: {
  groups: PreferredChampionGroup[];
  getChampionKey: (championId: string) => string;
  getChampionName: (championId: string) => string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {groups.map(({ role, champions }, groupIndex) => (
        <section
          key={role}
          className={cn(
            "rounded-lg border border-bg-tertiary bg-bg-primary/70 p-4",
            groupIndex === 0 && groups.length % 2 === 1 && "lg:col-span-2",
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-bg-elevated bg-bg-tertiary">
                <PositionIcon position={role} className="!h-5 !w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-text-primary">{getRoleLabel(role)}</p>
                <p className="text-xs font-semibold text-text-tertiary">{champions.length}개 선호 챔피언</p>
              </div>
            </div>
            {groupIndex === 0 && (
              <span className="rounded-md border border-accent-primary/25 bg-accent-primary/10 px-2 py-1 text-[11px] font-black text-accent-primary">
                우선
              </span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {champions.map(({ championId }, index) => (
              <div
                key={championId}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-bg-elevated bg-bg-secondary px-3 py-2"
              >
                <span className="w-4 flex-shrink-0 text-center text-[11px] font-black text-text-tertiary">
                  {index + 1}
                </span>
                <ChampionImage
                  championKey={getChampionKey(championId)}
                  size={34}
                  className="flex-shrink-0 rounded-md"
                />
                <span className="min-w-0 truncate text-sm font-bold text-text-primary">
                  {getChampionName(championId)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function RankedChampionPanel({ champions }: { champions: RankedChampionStat[] }) {
  const [featured, ...rest] = champions.slice(0, 5);
  if (!featured) return null;

  const featuredMetrics = getChampionMetrics(featured);

  return (
    <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
      <section className="rounded-lg border border-accent-gold/25 bg-bg-primary/80 p-4">
        <div className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-accent-gold">
          <Trophy className="h-4 w-4" />
          Rank 1
        </div>
        <div className="flex items-center gap-4">
          <ChampionImage championKey={featured.championName} size={72} className="rounded-xl" />
          <div className="min-w-0">
            <h3 className="truncate text-2xl font-black text-text-primary">
              {getChampionKoreanName(featured.championName)}
            </h3>
            <p className="mt-1 text-xs font-semibold text-text-tertiary">{featuredMetrics.games}게임 기준</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-bg-secondary px-3 py-2 text-center">
            <p className="text-lg font-black text-text-primary">{featuredMetrics.games}</p>
            <p className="mt-1 text-[11px] font-semibold text-text-tertiary">게임</p>
          </div>
          <div className="rounded-lg bg-bg-secondary px-3 py-2 text-center">
            <p className={cn("text-lg font-black", featuredMetrics.winRate >= 50 ? "text-accent-success" : "text-accent-danger")}>
              {featuredMetrics.winRate}%
            </p>
            <p className="mt-1 text-[11px] font-semibold text-text-tertiary">승률</p>
          </div>
          <div className="rounded-lg bg-bg-secondary px-3 py-2 text-center">
            <p className="text-lg font-black text-text-primary">{featuredMetrics.kda}</p>
            <p className="mt-1 text-[11px] font-semibold text-text-tertiary">KDA</p>
          </div>
        </div>
      </section>

      <div className="grid gap-2">
        {rest.map((champ, index) => {
          const metrics = getChampionMetrics(champ);
          return (
            <div
              key={champ.championName}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-bg-tertiary bg-bg-primary/70 px-3 py-2.5"
            >
              <span className="w-5 flex-shrink-0 text-center text-xs font-black text-text-tertiary">
                {index + 2}
              </span>
              <ChampionImage championKey={champ.championName} size={38} className="flex-shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-text-primary">
                  {getChampionKoreanName(champ.championName)}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-text-tertiary">{metrics.games}게임</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3 text-right text-xs font-bold">
                <span className={metrics.winRate >= 50 ? "text-accent-success" : "text-accent-danger"}>
                  {metrics.winRate}%
                </span>
                <span className="w-12 text-text-secondary">{metrics.kda}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
