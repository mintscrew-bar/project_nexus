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
 * - 한 챔피언을 두 줄 높이로 줄였다 — 세 칸 상자는 옆 열보다 카드가 훨씬 길어졌다
 *   (판당 K/D/A 는 KDA 에 마우스를 올리면 보인다)
 */
export function ChampionStatsCard({
  stats,
  fill = false,
}: {
  stats: ChampionStat[];
  /**
   * 부모 높이를 꽉 채우고 목록은 그 안에서 스크롤한다(넓은 화면 전용).
   * 유저 전적 화면에서 옆 "내전 지표" 카드와 높이를 맞출 때 쓴다.
   * 좁은 화면(한 줄씩 쌓일 때)은 지금처럼 5개 + "더 보기".
   */
  fill?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalGames = stats.reduce((sum, stat) => sum + stat.games, 0);

  return (
    <div
      className={cn(
        "bg-bg-secondary border border-bg-tertiary rounded-xl p-5",
        fill && "lg:flex lg:h-full lg:flex-col",
      )}
    >
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
          <ul
            className={cn(
              "space-y-1.5",
              // 넓은 화면에서는 남은 높이 안에서 스크롤 — 스크롤바가 붙지 않게 오른쪽 여백
              fill &&
                "lg:-mr-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2",
            )}
          >
            {stats.map((stat, index) => {
              // 접힌 상태에서 6번째부터는 숨긴다. fill 이면 넓은 화면에선 전부 보인다(스크롤).
              const collapsed = !expanded && index >= INITIAL_COUNT;
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
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg bg-bg-tertiary/50 px-2.5 py-2",
                    collapsed && (fill ? "hidden lg:flex" : "hidden"),
                  )}
                >
                  {/* 아이콘 + 판수 */}
                  <div className="relative shrink-0">
                    <Image
                      src={getChampionIcon(stat.championName)}
                      alt={stat.championName}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-md"
                    />
                    <span className="absolute -bottom-1 -right-1 rounded bg-bg-primary px-0.5 text-[9px] font-bold tabular-nums text-text-secondary ring-1 ring-bg-tertiary">
                      {stat.games}판
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* 이름 · 승률 */}
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
                    <div className="mt-1 flex h-1 overflow-hidden rounded-full bg-bg-primary">
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
                    {/* 승패 · 판당 지표 — 한 줄. KDA 는 오른쪽 끝에 색으로 */}
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] tabular-nums text-text-tertiary">
                      <span className="truncate">
                        {stat.wins}승 {stat.losses}패 · CS {cs} · 피해{" "}
                        {(damage / 1000).toFixed(1)}k
                      </span>
                      <span
                        className="shrink-0"
                        title={`판당 ${per(stat.kills)}/${per(stat.deaths)}/${per(stat.assists)}`}
                      >
                        <span className={cn("font-bold", kdaTone(ratio))}>
                          {ratio != null ? ratio.toFixed(2) : "Perfect"}
                        </span>{" "}
                        KDA
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {stats.length > INITIAL_COUNT && (
            <button
              // fill 이면 넓은 화면에선 스크롤로 다 보이므로 버튼을 숨긴다(lg:hidden)
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={cn(
                "mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary",
                fill && "lg:hidden",
              )}
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
