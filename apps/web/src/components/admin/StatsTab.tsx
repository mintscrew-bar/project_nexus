"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Home, Swords, UserPlus, Users, Flag } from "lucide-react";
import { GAMES } from "@nexus/types";
import { adminApi, type AdminDailyStat } from "@/lib/api-client";
import { StatCard, makeDelta, type StatDetail } from "./shared";
import { useAdminGameScope } from "./game-scope";
import { TrendCards } from "./TrendCards";
import { RoomFunnelCard } from "./RoomFunnelCard";

const DAY_OPTIONS = [14, 30, 90];

type SeriesKey = Exclude<keyof AdminDailyStat, "date" | "scope">;

/** 기간 합계 — 기록이 하나도 없으면 null(0 과 구분한다) */
function sumOf(rows: AdminDailyStat[], key: SeriesKey): number | null {
  const values = rows
    .map((r) => r[key] as number | null)
    .filter((v): v is number => v !== null);
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}

/** 기간 하루 평균(기록 있는 날만) */
function avgOf(rows: AdminDailyStat[], key: SeriesKey): number | null {
  const values = rows
    .map((r) => r[key] as number | null)
    .filter((v): v is number => v !== null);
  return values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
}

/** 가장 많았던 날 — "날짜 · 값" */
function peakOf(rows: AdminDailyStat[], key: SeriesKey): string {
  let best: AdminDailyStat | null = null;
  for (const r of rows) {
    const v = r[key] as number | null;
    if (v === null) continue;
    if (!best || v > (best[key] as number)) best = r;
  }
  return best
    ? `${best.date.slice(5, 10)} · ${(best[key] as number).toLocaleString()}`
    : "-";
}

const fmt = (v: number | null) => (v === null ? "-" : v.toLocaleString());

/**
 * 관리자 「통계」 탭 — 기간별 추이를 본다.
 *
 * 대시보드는 "오늘 처리할 것", 여기는 "어떻게 변하고 있나" 다. 기간(14·30·90일)과 게임을
 * 고르면 위의 요약 숫자는 **지난 같은 길이 기간과 비교**하고, 아래 그래프는 마우스를 올린
 * 날의 값을 보여 준다. 비교하려고 기간의 두 배를 한 번에 받아 앞뒤로 나눈다.
 */
export function StatsTab() {
  const { game } = useAdminGameScope();
  const [days, setDays] = useState(30);
  const scope = game ?? "ALL";

  // 이번 기간 + 바로 전 기간을 한 번에 받는다
  const seriesQuery = useQuery({
    queryKey: ["admin-stats-series", scope, days * 2],
    queryFn: () =>
      adminApi.getStatsSeries(scope, days * 2) as Promise<AdminDailyStat[]>,
  });
  const all = seriesQuery.data ?? null;
  const rows = all ? all.slice(-days) : null;
  const prev = all ? all.slice(0, Math.max(0, all.length - days)) : [];
  const basis = `지난 ${days}일 대비`;

  // 요약 카드 하나 — 이번 기간 합계(또는 평균)와 지난 기간 비교, 호버 세부 내역
  const summary = (
    key: SeriesKey,
    mode: "sum" | "avg",
  ): {
    value: string;
    delta: ReturnType<typeof makeDelta>;
    details: StatDetail[];
  } => {
    const now = rows
      ? mode === "sum"
        ? sumOf(rows, key)
        : avgOf(rows, key)
      : null;
    const before = mode === "sum" ? sumOf(prev, key) : avgOf(prev, key);
    return {
      value: fmt(now),
      delta: makeDelta(now, before, basis),
      details: [
        { label: `이번 ${days}일`, value: fmt(now) },
        { label: `지난 ${days}일`, value: fmt(before) },
        ...(mode === "sum"
          ? [{ label: "하루 평균", value: fmt(rows ? avgOf(rows, key) : null) }]
          : []),
        { label: "가장 많은 날", value: rows ? peakOf(rows, key) : "-" },
      ],
    };
  };

  const cards = game
    ? [
        {
          icon: <Home className="h-5 w-5" />,
          label: "시작한 방",
          ...summary("roomsStarted", "sum"),
        },
        {
          icon: <Flag className="h-5 w-5" />,
          label: "끝난 방",
          ...summary("roomsEnded", "sum"),
        },
        {
          icon: <Swords className="h-5 w-5" />,
          label: game === "PUBG" ? "스크림 기록" : "내전 기록",
          ...summary("records", "sum"),
        },
      ]
    : [
        {
          icon: <UserPlus className="h-5 w-5" />,
          label: "신규 가입",
          ...summary("newUsers", "sum"),
        },
        {
          icon: <Activity className="h-5 w-5" />,
          label: "평균 일간 활성",
          ...summary("active1d", "avg"),
        },
        {
          icon: <Users className="h-5 w-5" />,
          label: "평균 주간 활성",
          ...summary("active7d", "avg"),
        },
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">통계</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            {game ? `${GAMES[game].shortLabel} 방·기록` : "전체 유저"} 기준 ·
            숫자 카드에 마우스를 올리면 지난 기간과 비교합니다. 매일
            00:10(KST)에 전날 값이 기록됩니다.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              adminApi
                .downloadExport("daily-stats", {
                  gameTitle: game ?? undefined,
                  days,
                })
                .catch(() => undefined)
            }
            className="mr-1 rounded-md bg-bg-tertiary px-2.5 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
            title="이 기간의 일별 지표를 CSV 로 저장"
          >
            CSV
          </button>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                days === d
                  ? "bg-accent-primary text-accent-on"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <StatCard
            key={c.label}
            icon={c.icon}
            label={`${c.label} (${days}일)`}
            value={c.value}
            delta={c.delta}
            details={c.details}
          />
        ))}
      </div>

      <TrendCards
        game={game}
        days={days}
        rows={rows}
        failed={seriesQuery.isError}
      />
      {game && <RoomFunnelCard game={game} days={days} />}
    </div>
  );
}
