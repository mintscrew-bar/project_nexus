"use client";

import { useState } from "react";
import Image from "next/image";
import { Swords, ChevronDown } from "lucide-react";
import { getChampionKoreanName } from "@nexus/types";
import { getChampionIcon } from "@/components/matches/match-utils";
import { cn } from "@/lib/utils";

/** /stats/user/:id/champion-stats 한 줄 — 내전(isInternal) 판만 챔피언별로 합산한 값 */
export interface ChampionStat {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  totalDamageDealtToChampions: number;
}

/** 처음에 보여줄 챔피언 수. 나머지는 "더 보기"로 편다 */
const INITIAL_COUNT = 5;

/** KDA 색 — 경매 매물 카드와 같이 3 이상을 금색으로 */
function kdaTone(ratio: number | null): string {
  // null = 데스 0(Perfect)
  if (ratio == null || ratio >= 3) return "text-accent-gold";
  if (ratio < 1.5) return "text-text-tertiary";
  return "text-text-primary";
}

/**
 * 넥서스 유저 전적 화면의 "내전 챔피언" 카드.
 *
 * 예전 모양은 아이콘 · 승패 · 승률 · KDA 가 한 줄에 같은 크기로 늘어서서 어떤 챔피언을
 * 잘하는지가 눈에 안 들어왔다(2026-11-03 운영자 요청으로 다시 그림).
 * - 승/패를 한 줄 막대로 나눠 그려 승률을 길이로 읽게 한다
 * - KDA 는 비율을 크게, 판당 평균 K/D/A 를 작게
 * - 판당 CS·피해량을 함께 적어 경매 매물 카드의 지표와 같은 눈높이로 본다
 */
export function ChampionStatsCard({ stats }: { stats: ChampionStat[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? stats : stats.slice(0, INITIAL_COUNT);
  const totalGames = stats.reduce((sum, stat) => sum + stat.games, 0);

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Swords className="h-5 w-5 text-accent-primary" />
          내전 챔피언
        </h2>
        {stats.length > 0 && (
          <span className="text-xs text-text-tertiary">
            {stats.length}챔피언 · {totalGames}판
          </span>
        )}
      </div>

      {stats.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-secondary">
          상세 기록이 수집된 내전이 아직 없습니다
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((stat) => {
              const winRate = Math.round((stat.wins / stat.games) * 100);
              const ratio =
                stat.deaths > 0
                  ? (stat.kills + stat.assists) / stat.deaths
                  : null;
              const per = (value: number) => (value / stat.games).toFixed(1);
              const cs = Math.round(
                (stat.totalMinionsKilled + stat.neutralMinionsKilled) /
                  stat.games,
              );
              const damage = Math.round(
                stat.totalDamageDealtToChampions / stat.games,
              );

              return (
                <li
                  key={stat.championId}
                  className="rounded-lg bg-bg-tertiary/50 p-3"
                >
                  <div className="flex items-center gap-3">
                    {/* 아이콘 + 판수 */}
                    <div className="relative shrink-0">
                      <Image
                        src={getChampionIcon(stat.championName)}
                        alt={stat.championName}
                        width={44}
                        height={44}
                        className="h-11 w-11 rounded-lg"
                      />
                      <span className="absolute -bottom-1 -right-1 rounded bg-bg-primary px-1 text-[10px] font-bold tabular-nums text-text-secondary ring-1 ring-bg-tertiary">
                        {stat.games}판
                      </span>
                    </div>

                    {/* 이름 + 승패 막대 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold text-text-primary">
                          {getChampionKoreanName(stat.championName)}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 text-sm font-black tabular-nums",
                            stat.games < 3
                              ? "text-text-secondary"
                              : winRate >= 60
                                ? "text-accent-primary"
                                : winRate < 40
                                  ? "text-accent-danger"
                                  : "text-text-primary",
                          )}
                        >
                          {winRate}%
                        </span>
                      </div>
                      {/* 승(파랑) | 패(빨강) 비율 막대 */}
                      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-bg-primary">
                        {stat.wins > 0 && (
                          <div
                            className="bg-accent-primary"
                            style={{ width: `${winRate}%` }}
                          />
                        )}
                        {stat.losses > 0 && (
                          <div className="flex-1 bg-accent-danger/70" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] tabular-nums text-text-tertiary">
                        {stat.wins}승 {stat.losses}패
                      </p>
                    </div>
                  </div>

                  {/* 판당 지표 */}
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-md bg-bg-primary/50 px-1 py-1.5">
                      <p
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          kdaTone(ratio),
                        )}
                      >
                        {ratio != null ? ratio.toFixed(2) : "Perfect"}
                      </p>
                      <p className="truncate text-[10px] tabular-nums text-text-tertiary">
                        {per(stat.kills)}/{per(stat.deaths)}/{per(stat.assists)}
                      </p>
                    </div>
                    <div className="rounded-md bg-bg-primary/50 px-1 py-1.5">
                      <p className="text-sm font-bold tabular-nums text-text-primary">
                        {cs}
                      </p>
                      <p className="text-[10px] text-text-tertiary">평균 CS</p>
                    </div>
                    <div className="rounded-md bg-bg-primary/50 px-1 py-1.5">
                      <p className="text-sm font-bold tabular-nums text-text-primary">
                        {damage.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-text-tertiary">
                        평균 피해량
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {stats.length > INITIAL_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            >
              {expanded
                ? "접기"
                : `${stats.length - INITIAL_COUNT}챔피언 더 보기`}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </button>
          )}
        </>
      )}
    </div>
  );
}
