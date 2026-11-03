"use client";

import Image from "next/image";
import { Swords } from "lucide-react";
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
  /** 경기 시간이 기록된 판의 CS 합 / 경기 시간 합(초) — 분당 CS 계산용 */
  timedCs?: number;
  timedSeconds?: number;
}

/** KDA 색 — 경매 매물 카드와 같이 3 이상을 금색으로 */
function kdaTone(ratio: number | null): string {
  // null = 데스 0(Perfect)
  if (ratio == null || ratio >= 3) return "text-accent-gold";
  if (ratio < 1.5) return "text-text-tertiary";
  return "text-text-primary";
}

/** 승률 글자색 — 3판 미만은 표본이 작아 약하게 */
function winRateTone(winRate: number, games: number): string {
  if (games < 3) return "text-text-secondary";
  if (winRate >= 60) return "text-accent-primary";
  if (winRate < 40) return "text-accent-danger";
  return "text-text-primary";
}

/** 표시용 값을 한 번에 계산해 둔다 */
function summarize(stat: ChampionStat) {
  const winRate = Math.round((stat.wins / stat.games) * 100);
  const ratio =
    stat.deaths > 0 ? (stat.kills + stat.assists) / stat.deaths : null;
  const per = (value: number) => (value / stat.games).toFixed(1);
  const minutes = (stat.timedSeconds ?? 0) / 60;
  return {
    winRate,
    ratio,
    kdaText: ratio != null ? ratio.toFixed(2) : "Perfect",
    kdaDetail: `${per(stat.kills)}/${per(stat.deaths)}/${per(stat.assists)}`,
    // 경기 시간이 기록된 판이 없으면 계산하지 않는다
    csPerMin: minutes > 0 ? ((stat.timedCs ?? 0) / minutes).toFixed(1) : "—",
  };
}

/**
 * 챔피언 아이콘 둘레에 승률 링 — 파랑 = 승, 빨강 = 패.
 * 아이콘 자체가 승률 그래프라 숫자를 덜 읽어도 잘하는 챔피언이 보인다.
 */
function WinRateRing({
  championName,
  winRate,
  size,
}: {
  championName: string;
  winRate: number;
  size: number;
}) {
  const stroke = size >= 56 ? 4 : 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const inset = stroke + 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-accent-danger/60"
        />
        {winRate > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={`${(circumference * winRate) / 100} ${circumference}`}
            strokeLinecap={winRate < 100 ? "round" : "butt"}
            className="stroke-accent-primary"
          />
        )}
      </svg>
      <Image
        src={getChampionIcon(championName)}
        alt={championName}
        width={size - inset * 2}
        height={size - inset * 2}
        className="absolute rounded-full"
        style={{ inset }}
      />
    </div>
  );
}

/** 목록 머리줄·행이 같이 쓰는 열: 챔피언 | 승패(판수) | KDA | 분당 CS */
const COLUMNS = "grid-cols-[minmax(0,1fr)_76px_48px_44px]";

/**
 * 넥서스 유저 전적 화면의 "내전 챔피언" 카드.
 *
 * 2026-11-03 운영자와 시안 셋(표형 / 승률 링 / 대표 챔피언 + 목록)을 비교하고
 * 승률 링과 대표 챔피언을 섞기로 했다.
 * - 가장 많이 한 챔피언을 맨 위에 크게 — "이 사람 주력이 뭐지"에 바로 답한다
 * - 지표는 승패(판수) · KDA · 분당 CS 세 가지로 통일 (평균 딜량은 운영자 요청으로 뺐다)
 * - 아이콘 둘레 링이 승률
 * - 나머지 챔피언은 카드 안에서 스크롤로 더 본다(접기/펼치기 버튼 없음)
 */
export function ChampionStatsCard({
  stats,
  fill = false,
}: {
  stats: ChampionStat[];
  /**
   * 부모 높이를 꽉 채우고 목록은 그 안에서 스크롤한다(넓은 화면 전용).
   * 유저 전적 화면에서 옆 "내전 지표" 카드와 높이를 맞출 때 쓴다.
   * 좁은 화면에서는 목록 높이를 정해 두고 스크롤한다.
   */
  fill?: boolean;
}) {
  const totalGames = stats.reduce((sum, stat) => sum + stat.games, 0);
  const [top, ...rest] = stats;
  const topSummary = top ? summarize(top) : null;

  return (
    <div
      className={cn(
        "bg-bg-secondary border border-bg-tertiary rounded-xl p-5",
        fill && "lg:flex lg:h-full lg:flex-col",
      )}
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-2">
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

      {!top || !topSummary ? (
        <p className="py-8 text-center text-sm text-text-secondary">
          상세 기록이 수집된 내전이 아직 없습니다
        </p>
      ) : (
        <>
          {/* 주력 챔피언 */}
          <div className="mb-3 flex shrink-0 items-center gap-4 rounded-lg bg-gradient-to-r from-accent-primary/15 to-transparent p-3 ring-1 ring-accent-primary/30">
            <WinRateRing
              championName={top.championName}
              winRate={topSummary.winRate}
              size={68}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-accent-primary">
                주력 챔피언
              </p>
              <div className="flex items-baseline gap-2">
                <p className="truncate text-lg font-black text-text-primary">
                  {getChampionKoreanName(top.championName)}
                </p>
                <span
                  className={cn(
                    "shrink-0 text-sm font-black tabular-nums",
                    winRateTone(topSummary.winRate, top.games),
                  )}
                >
                  {topSummary.winRate}%
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-sm font-black tabular-nums">
                    <span className="text-accent-primary">{top.wins}승</span>{" "}
                    <span className="text-accent-danger">{top.losses}패</span>
                  </p>
                  <p className="text-[10px] tabular-nums text-text-tertiary">
                    {top.games}판
                  </p>
                </div>
                <div>
                  <p
                    className={cn(
                      "text-sm font-black tabular-nums",
                      kdaTone(topSummary.ratio),
                    )}
                  >
                    {topSummary.kdaText}
                  </p>
                  <p className="text-[10px] tabular-nums text-text-tertiary">
                    {topSummary.kdaDetail}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-black tabular-nums text-text-primary">
                    {topSummary.csPerMin}
                  </p>
                  <p className="text-[10px] text-text-tertiary">분당 CS</p>
                </div>
              </div>
            </div>
          </div>

          {rest.length > 0 && (
            <>
              {/* 머리줄 */}
              <div
                className={cn(
                  "grid shrink-0 items-center gap-x-2 px-2 pb-1.5 text-[10px] font-medium text-text-tertiary",
                  COLUMNS,
                )}
              >
                <span>챔피언</span>
                <span className="text-right">승패(판수)</span>
                <span className="text-right">KDA</span>
                <span className="text-right">분당 CS</span>
              </div>

              {/* 나머지 — 카드 안에서 스크롤 (오른쪽 여백은 스크롤바 자리) */}
              <ul
                className={cn(
                  "-mr-2 max-h-[320px] space-y-0.5 overflow-y-auto pr-2",
                  fill && "lg:max-h-none lg:min-h-0 lg:flex-1",
                )}
              >
                {rest.map((stat) => {
                  const s = summarize(stat);
                  return (
                    <li
                      key={stat.championId}
                      className={cn(
                        "grid items-center gap-x-2 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-tertiary/50",
                        COLUMNS,
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <WinRateRing
                          championName={stat.championName}
                          winRate={s.winRate}
                          size={36}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary">
                            {getChampionKoreanName(stat.championName)}
                          </p>
                          <p
                            className={cn(
                              "text-[11px] font-bold tabular-nums",
                              winRateTone(s.winRate, stat.games),
                            )}
                          >
                            {s.winRate}%
                          </p>
                        </div>
                      </div>
                      <span className="text-right text-xs tabular-nums">
                        <span className="text-accent-primary">
                          {stat.wins}승
                        </span>{" "}
                        <span className="text-accent-danger">
                          {stat.losses}패
                        </span>
                        <span className="text-text-tertiary">
                          {" "}
                          ({stat.games})
                        </span>
                      </span>
                      <span
                        className={cn(
                          "text-right text-xs font-bold tabular-nums",
                          kdaTone(s.ratio),
                        )}
                        title={`판당 ${s.kdaDetail}`}
                      >
                        {s.kdaText}
                      </span>
                      <span className="text-right text-xs tabular-nums text-text-secondary">
                        {s.csPerMin}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
