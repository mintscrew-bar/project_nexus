"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminApi,
  type AdminCohort,
  type AdminSignupSource,
  type AdminDailyStat,
} from "@/lib/api-client";
import type { GameTitle } from "@nexus/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type SeriesKey = Exclude<keyof AdminDailyStat, "date" | "scope">;
export interface Line {
  key: SeriesKey;
  label: string;
  /** Tailwind stroke 색 클래스 */
  stroke: string;
  dot: string;
}

/**
 * 일별 추이 선 그래프. 외부 차트 라이브러리 없이 SVG 로 그린다.
 * null(기록 없음)은 0 으로 그리지 않고 선을 끊는다 — 0 은 "없었다" 가 아니라 "0 이었다" 다.
 *
 * 마우스를 올리면 가장 가까운 날에 세로 기준선·점이 생기고 그날 값이 툴팁으로 뜬다.
 */
export function LineChart({
  rows,
  lines,
}: {
  rows: AdminDailyStat[];
  lines: Line[];
}) {
  // 카드 폭에 맞춘다. viewBox 비율을 고정하면 넓은 카드에서 그래프가 가운데에 좁게 놓인다.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setW(Math.max(280, Math.round(el.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // 마우스가 가리키는 날(행 번호). 없으면 null
  const [hover, setHover] = useState<number | null>(null);
  const H = 180;
  const pad = { l: 36, r: 8, t: 8, b: 20 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const values = rows.flatMap((r) =>
    lines.map((l) => r[l.key] as number | null).filter((v) => v !== null),
  ) as number[];
  const max = Math.max(1, ...values);
  const x = (i: number) =>
    pad.l + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  const pathFor = (key: SeriesKey) => {
    let d = "";
    let pen = false;
    rows.forEach((r, i) => {
      const v = r[key] as number | null;
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };

  // 마우스 x 좌표 → 가장 가까운 날
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (rows.length === 0) return;
    const t = rows.length <= 1 ? 0 : (px - pad.l) / innerW;
    const i = Math.round(t * (rows.length - 1));
    setHover(Math.min(rows.length - 1, Math.max(0, i)));
  };

  const hovered = hover !== null ? rows[hover] : null;
  // 툴팁이 그래프 밖으로 나가지 않게, 오른쪽 절반이면 왼쪽에 띄운다
  const tipLeft = hover !== null && x(hover) > W / 2;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="일별 추이 그래프"
        className="touch-none"
        onPointerMove={handleMove}
        onPointerDown={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(max * t)}
              y2={y(max * t)}
              className="stroke-bg-tertiary"
              strokeWidth={1}
            />
            <text
              x={pad.l - 6}
              y={y(max * t) + 3}
              textAnchor="end"
              className="fill-text-muted"
              fontSize={10}
            >
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        {lines.map((l) => (
          <path
            key={l.key}
            d={pathFor(l.key)}
            fill="none"
            className={l.stroke}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}
        {[0, rows.length - 1].map(
          (i) =>
            rows[i] && (
              <text
                key={i}
                x={x(i)}
                y={H - 5}
                textAnchor={i === 0 ? "start" : "end"}
                className="fill-text-muted"
                fontSize={10}
              >
                {rows[i].date.slice(5, 10)}
              </text>
            ),
        )}
        {/* 가리키는 날의 세로 기준선과 각 선의 점 */}
        {hovered && hover !== null && (
          <g pointerEvents="none">
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.t}
              y2={pad.t + innerH}
              className="stroke-text-muted"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {lines.map((l) => {
              const v = hovered[l.key] as number | null;
              if (v === null) return null;
              return (
                <circle
                  key={l.key}
                  cx={x(hover)}
                  cy={y(v)}
                  r={3.5}
                  className={`${l.stroke} fill-bg-primary`}
                  strokeWidth={2}
                />
              );
            })}
          </g>
        )}
        {/* 그래프 전체를 덮는 투명 판 — 선 사이 빈 곳에서도 마우스를 받는다 */}
        <rect
          x={pad.l}
          y={pad.t}
          width={innerW}
          height={innerH}
          fill="transparent"
        />
      </svg>
      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-lg border border-bg-elevated bg-bg-primary px-3 py-2 text-xs shadow-xl"
          style={
            tipLeft ? { right: W - x(hover) + 10 } : { left: x(hover) + 10 }
          }
        >
          <p className="mb-1 font-semibold text-text-primary">
            {hovered.date.slice(0, 10)}
          </p>
          {lines.map((l) => {
            const v = hovered[l.key] as number | null;
            return (
              <p
                key={l.key}
                className="flex items-center justify-between gap-3 py-0.5"
              >
                <span className="flex items-center gap-1.5 text-text-muted">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${l.dot}`}
                  />
                  {l.label}
                </span>
                <span className="font-medium tabular-nums text-text-primary">
                  {v === null ? "기록 없음" : v.toLocaleString()}
                </span>
              </p>
            );
          })}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-secondary">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${l.dot}`} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 공통(유저) 추이에 그리는 선 */
export const USER_LINES: Line[] = [
  {
    key: "active1d",
    label: "일간 활성",
    stroke: "stroke-accent-primary",
    dot: "bg-accent-primary",
  },
  {
    key: "active7d",
    label: "주간 활성",
    stroke: "stroke-text-secondary",
    dot: "bg-text-secondary",
  },
  {
    key: "active30d",
    label: "월간 활성",
    stroke: "stroke-text-muted",
    dot: "bg-text-muted",
  },
];

/** 게임별 추이에 그리는 선 */
export function gameLines(game: GameTitle): Line[] {
  return [
    {
      key: "roomsEnded",
      label: "끝난 방",
      stroke: "stroke-text-muted",
      dot: "bg-text-muted",
    },
    {
      key: "roomsStarted",
      label: "시작한 방",
      stroke: "stroke-accent-primary",
      dot: "bg-accent-primary",
    },
    {
      key: "records",
      label: game === "PUBG" ? "스크림" : "내전 기록",
      stroke: "stroke-text-secondary",
      dot: "bg-text-secondary",
    },
  ];
}

/**
 * 추이 카드. `game` 이 없으면 공통(유저 활성·가입), 있으면 그 게임의 방·기록.
 * 일별 기록(rows)과 기간(days)은 통계 탭이 받아서 넘긴다 — 같은 기록으로 위의 요약 숫자도 계산한다.
 */
export function TrendCards({
  game,
  days,
  rows,
  failed,
}: {
  game: GameTitle | null;
  days: number;
  rows: AdminDailyStat[] | null;
  failed: boolean;
}) {
  // 코호트·가입 경로는 공통(게임 없음)일 때만
  const cohortQuery = useQuery({
    queryKey: ["admin-cohort-survival", 8],
    queryFn: () => adminApi.getCohortSurvival(8) as Promise<AdminCohort[]>,
    enabled: !game,
  });
  const sourcesQuery = useQuery({
    queryKey: ["admin-signup-sources", days],
    queryFn: () =>
      adminApi.getSignupSources(days) as Promise<AdminSignupSource[]>,
    enabled: !game,
  });
  const cohorts = cohortQuery.data ?? null;
  const sources = sourcesQuery.data ?? null;

  const lines = game ? gameLines(game) : USER_LINES;

  const hasData =
    rows?.some((r) => lines.some((l) => r[l.key] !== null)) ?? false;
  const activeStarted = rows?.some((r) => r.active1d !== null) ?? false;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-accent-primary" />
              {game ? "일별 추이" : "활성 유저 추이"}
            </CardTitle>
            <span className="text-xs text-text-muted">
              최근 {days}일 · 그래프에 마우스를 올리면 그날 수치
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {failed && (
            <p className="text-sm text-text-tertiary">
              추이를 불러오지 못했습니다.
            </p>
          )}
          {!rows && !failed && (
            <p className="text-sm text-text-tertiary">불러오는 중…</p>
          )}
          {rows && !hasData && (
            <p className="text-sm text-text-tertiary">
              아직 쌓인 기록이 없습니다. 매일 00:10(KST)에 전날 값이 기록됩니다.
            </p>
          )}
          {rows && hasData && <LineChart rows={rows} lines={lines} />}
          {rows && hasData && !game && !activeStarted && (
            <p className="mt-2 text-[11px] text-text-muted">
              활성 유저는 과거를 복원할 수 없어 기록을 시작한 날부터 그려집니다.
            </p>
          )}
        </CardContent>
      </Card>

      {!game && sources && sources.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              유입 경로별 가입 ({days}일)
            </CardTitle>
            <p className="text-[11px] text-text-muted">
              연동 = 라이엇·PUBG 계정을 연결한 가입자, 내전 완주 = 롤 내전을
              끝까지 친 가입자(배그는 유저 단위로 셀 수 없음). 경로 없음은 기능
              도입 이전 가입자이거나 쿠키를 막은 사람입니다.
            </p>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead className="text-text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">경로</th>
                  <th className="text-right font-medium">가입</th>
                  <th className="text-right font-medium">연동</th>
                  <th className="text-right font-medium">내전 완주</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-text-secondary">
                {sources.map((s) => (
                  <tr key={s.source ?? "__none__"}>
                    <td className="py-0.5 text-text-primary">
                      {s.source ?? "경로 없음"}
                    </td>
                    <td className="text-right">{s.signups}</td>
                    <td className="text-right">
                      {s.linked}
                      <span className="ml-1 text-text-muted">
                        ({Math.round((s.linked / s.signups) * 100)}%)
                      </span>
                    </td>
                    <td className="text-right">
                      {s.played}
                      <span className="ml-1 text-text-muted">
                        ({Math.round((s.played / s.signups) * 100)}%)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {!game && cohorts && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              가입 주차별 현재 활성 비율
            </CardTitle>
            <p className="text-[11px] text-text-muted">
              오늘 기준 최근 7일 안에 접속한 비율입니다. 과거 접속 이력은 없어서
              같은 나이의 코호트끼리 비교할 때 의미가 있습니다.
            </p>
          </CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead className="text-text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">
                    가입 주(월요일)
                  </th>
                  <th className="text-right font-medium">가입</th>
                  <th className="text-right font-medium">지금 활성</th>
                  <th className="text-right font-medium">비율</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-text-secondary">
                {cohorts.map((c) => (
                  <tr key={c.weekStart}>
                    <td className="py-0.5">{c.weekStart.slice(0, 10)}</td>
                    <td className="text-right">{c.signups}</td>
                    <td className="text-right">{c.activeNow}</td>
                    <td className="text-right font-semibold text-text-primary">
                      {c.signups === 0
                        ? "-"
                        : `${Math.round((c.activeNow / c.signups) * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
