"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import type { ScrimLeaderboardRow } from "@nexus/types";

/**
 * 라운드별 누적 점수 추이.
 *
 * 누적 리더보드 표는 "지금 몇 점인가"를 답하지만 "어떻게 여기까지 왔는가"는
 * 못 보여준다. 3라운드에서 뒤집혔는지, 한 판을 말아먹고 못 따라잡은 건지가
 * 대회에서 가장 재미있는 지점인데 표에는 숫자만 남는다.
 *
 * 표가 정본이고 이 그림은 흐름을 읽는 용도다 — 정확한 값은 바로 아래 표와
 * 툴팁에 있다.
 */

/**
 * 팀 색.
 *
 * dataviz 스킬의 검증된 카테고리 팔레트(다크 단계)이고, 이 화면의 표면
 * (`bg-bg-secondary`)에 대고 실제로 돌려서 통과시킨 값이다 —
 * 배그 테마 #141414 기준 명도대·채도·CVD 분리·대비 전부 PASS.
 * (`/pubg/*` 는 `.game-pubg` 가 라이트·다크 무관하게 토큰을 덮어 표면이
 * 하나다. 롤 다크 #1a1a1a 도 사실상 같은 자리라 한 벌로 충분하다.)
 * 표면색을 바꾸면 이 검증부터 다시 돌려야 한다.
 *
 * **순서를 섞거나 색을 더 만들지 않는다.** 인접 쌍 기준으로 검증한
 * 배열이라 순서가 곧 안전성이다.
 */
const SERIES_COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

/** 색을 줄 수 있는 팀 수. 넘으면 나머지는 배경 선으로 접는다. */
const MAX_COLORED = SERIES_COLORS.length;

/** 표면색 — 겹치는 마커에 두르는 링. 카드 배경과 같아야 파여 보인다. */
const SURFACE = "rgb(var(--color-bg-secondary))";

type Round = { id: string; roundNumber: number; status: string };

type Series = {
  key: string;
  name: string;
  /** 0라운드(0점)부터 시작하는 누적 점수 */
  cumulative: number[];
  color: string | null;
};

const PAD = { top: 16, right: 132, bottom: 28, left: 40 };
const W = 720;
const H = 300;

/**
 * 끝점 라벨에 들어갈 팀 이름 길이.
 *
 * 팀 이름이 `{유저명} 팀` 이라 길이를 예측할 수 없다. 그대로 두면 긴 이름이
 * 그림 밖으로 흘러 잘린다 — 잘린 글자는 없는 것보다 나쁘다. 정확한 이름은
 * 범례와 아래 표에 그대로 있으므로 여기서는 줄여도 잃는 게 없다.
 */
const MAX_LABEL_CHARS = 6;

const shortName = (name: string) =>
  name.length > MAX_LABEL_CHARS
    ? `${name.slice(0, MAX_LABEL_CHARS - 1)}…`
    : name;

/** 축 눈금을 깔끔한 수로 올린다. 1·2·5 계열만 쓴다. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= base * step) return base * step;
  }
  return base * 10;
}

export function ScrimProgressChart({
  rounds,
  leaderboard,
}: {
  rounds: Round[];
  leaderboard: ScrimLeaderboardRow[];
}) {
  // 마우스가 가리키는 라운드. null 이면 안 가리키는 중.
  const [hover, setHover] = useState<number | null>(null);

  const { series, labels, maxY, hiddenCount } = useMemo(() => {
    // 결과가 들어간 라운드만 그린다. 예정만 잡힌 라운드까지 그리면 모든 선이
    // 오른쪽에서 평평해져 "다 같이 멈췄다"로 읽힌다.
    const done = rounds
      .map((round, index) => ({ round, index }))
      .filter(({ round }) => round.status === "COMPLETED");

    // 색은 팀 정체성을 따라간다 — 순위가 바뀌어도 같은 팀은 같은 색이다.
    // 팀 수가 팔레트를 넘으면 색을 만들어내지 않고 접는다(스킬 규칙).
    const stableOrder = [...leaderboard]
      .map((row) => row.teamId ?? row.teamName)
      .sort();
    const overflow = leaderboard.length > MAX_COLORED;

    const built: Series[] = leaderboard.map((row, rank) => {
      let acc = 0;
      const cumulative = [0];
      for (const { index } of done) {
        acc += row.roundPoints[index] ?? 0;
        cumulative.push(acc);
      }
      // 팀이 팔레트보다 많으면 상위 8팀만 색을 갖는다. 그 경우에만 순위를
      // 쓰는데, 25팀을 다 칠하면 어느 선이 누구인지 아무도 못 읽는다.
      const slot = overflow ? rank : stableOrder.indexOf(row.teamId ?? row.teamName);
      return {
        key: row.teamId ?? row.teamName,
        name: row.teamName,
        cumulative,
        color: slot < MAX_COLORED ? SERIES_COLORS[slot] : null,
      };
    });

    return {
      series: built,
      labels: ["시작", ...done.map(({ round }) => `${round.roundNumber}R`)],
      maxY: niceCeil(
        Math.max(1, ...built.map((s) => s.cumulative[s.cumulative.length - 1])),
      ),
      hiddenCount: built.filter((s) => !s.color).length,
    };
  }, [rounds, leaderboard]);

  // 점 하나로는 추이가 아니다. 첫 판이 끝나기 전에는 표만 보여준다.
  if (labels.length < 3) return null;

  const steps = labels.length - 1;
  const x = (i: number) => PAD.left + (i / steps) * (W - PAD.left - PAD.right);
  const y = (v: number) =>
    H - PAD.bottom - (v / maxY) * (H - PAD.top - PAD.bottom);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxY * t));
  // 끝점 라벨은 상위 3팀만. 전부 붙이면 오른쪽에서 글자가 엉킨다.
  const labelled = new Set(series.slice(0, 3).map((s) => s.key));

  return (
    <Card>
      <CardHeader>
        <CardTitle>라운드별 누적 점수</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[560px] touch-none"
            role="img"
            aria-label={`라운드별 누적 점수 추이. ${series.length}팀, ${steps}라운드. 정확한 값은 아래 누적 리더보드 표에 있습니다.`}
            onPointerLeave={() => setHover(null)}
            onPointerMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              // 화면 좌표를 viewBox 좌표로 되돌린 뒤 가장 가까운 라운드를 잡는다.
              const vx = ((event.clientX - box.left) / box.width) * W;
              const ratio = (vx - PAD.left) / (W - PAD.left - PAD.right);
              setHover(Math.max(0, Math.min(steps, Math.round(ratio * steps))));
            }}
          >
            {/* 격자는 뒤로 물러나 있어야 한다 — 1px 실선, 표면 한 단계 위 */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="rgb(var(--color-bg-tertiary))"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick) + 4}
                  textAnchor="end"
                  className="fill-text-muted"
                  fontSize={11}
                >
                  {tick}
                </text>
              </g>
            ))}

            {labels.map((label, i) => (
              <text
                key={label + i}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className={i === hover ? "fill-text-primary" : "fill-text-muted"}
                fontSize={11}
              >
                {label}
              </text>
            ))}

            {/* 가리키는 라운드를 세로선으로 집는다. 2px 선을 정조준할 필요가 없게 */}
            {hover !== null && (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="rgb(var(--color-text-muted))"
                strokeWidth={1}
              />
            )}

            {/* 색이 없는 팀부터 깔아 상위 팀 선이 위로 오게 한다 */}
            {[...series]
              .sort((a, b) => Number(!!a.color) - Number(!!b.color))
              .map((s) => (
                <polyline
                  key={s.key}
                  points={s.cumulative.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                  fill="none"
                  stroke={s.color ?? "rgb(var(--color-bg-elevated))"}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

            {series.map((s) => {
              const last = s.cumulative.length - 1;
              if (!s.color) return null;
              return (
                <g key={s.key}>
                  {/* 가리키는 지점의 값 — 링이 있어야 선과 겹쳐도 보인다 */}
                  {hover !== null && (
                    <circle
                      cx={x(hover)}
                      cy={y(s.cumulative[hover])}
                      r={4}
                      fill={s.color}
                      stroke={SURFACE}
                      strokeWidth={2}
                    />
                  )}
                  <circle
                    cx={x(last)}
                    cy={y(s.cumulative[last])}
                    r={4}
                    fill={s.color}
                    stroke={SURFACE}
                    strokeWidth={2}
                  />
                  {labelled.has(s.key) && (
                    <text
                      x={x(last) + 10}
                      y={y(s.cumulative[last]) + 4}
                      className="fill-text-secondary"
                      fontSize={11}
                    >
                      {shortName(s.name)} {s.cumulative[last]}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* 색만으로 팀을 가리지 않는다 — 범례가 정체성의 기본 통로다.
            가리키는 동안에는 범례가 그 라운드의 값 판독기를 겸한다. */}
        <p className="mt-3 text-xs text-text-tertiary">
          {hover !== null && hover > 0
            ? `${labels[hover]} 종료 시점 누적 점수`
            : "그래프 위를 지나가면 그 라운드까지의 누적 점수가 나옵니다."}
        </p>
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {series
            .filter((s) => s.color)
            .map((s) => (
              <li
                key={s.key}
                className="flex items-center gap-1.5 text-text-secondary"
              >
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{ background: s.color as string }}
                />
                {s.name}
                {hover !== null && (
                  <span className="font-semibold text-text-primary">
                    {s.cumulative[hover]}
                  </span>
                )}
              </li>
            ))}
          {hiddenCount > 0 && (
            <li className="flex items-center gap-1.5 text-text-muted">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded-full bg-bg-elevated"
              />
              그 외 {hiddenCount}팀
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
