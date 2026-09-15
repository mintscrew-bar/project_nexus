"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { traceLadder, type LadderDraw } from "@nexus/types";

/** 세로줄 간격의 하한. 이보다 좁아지면 가로 스크롤로 넘긴다. */
const MIN_GAP = 40;
/**
 * 세로줄 간격의 상한.
 *
 * 컨테이너를 채우되 무한정 벌리지는 않는다. 2팀에서 간격이 500px 를 넘자
 * 가로줄이 세로 간격의 열 배가 되어, 사다리가 아니라 배선도처럼 보였다.
 */
const MAX_GAP = 200;
/**
 * 사다리 전체 높이의 목표치.
 *
 * 행 높이를 고정하면 팀 수에 따라(행 수가 10~20) 높이가 두 배로 출렁인다.
 * 높이를 먼저 정하고 행 높이를 역산하면 몇 팀이든 같은 덩치로 보인다.
 */
const TARGET_HEIGHT = 340;
const TOP_PAD = 10;
/** 양옆 여백 — 세로줄이 패널 모서리에 붙지 않게 */
const SIDE_PAD = 24;

/** 한 팀이 사다리를 타고 내려가는 데 걸리는 시간 */
const TRACE_MS = 900;
/** 팀 수가 많을수록 자동 공개를 빠르게 해 25팀 연출이 1분 넘게 늘어지지 않게 한다. */
function autoRevealDelay(columnCount: number) {
  if (columnCount <= 4) return 2600;
  if (columnCount <= 8) return 1400;
  return 450;
}

interface TeamLabel {
  id: string;
  name: string;
  color?: string | null;
}

/**
 * 픽 순서 추첨 사다리.
 *
 * **순서는 서버가 이미 정했다.** 이 화면은 그 결과가 나오도록 구성된 사다리를
 * 그대로 그릴 뿐이라, 여기서 다시 뽑거나 흔들지 않는다. 누가 언제 눌러도
 * 같은 결과가 나온다 — 사다리 모양과 도착 칸이 서버에서 함께 왔기 때문이다.
 *
 * **사다리타기처럼 눌러서 탄다.** 전에는 전부 자동으로 순서대로 공개해서
 * 그냥 재생되는 영상에 가까웠다. 자기 팀 줄을 눌러 직접 타고 내려가는 쪽이
 * 추첨을 보는 맛이 있다. 다만 아무도 안 눌러도 드래프트는 진행돼야 하므로,
 * 잠깐 기다렸다가 남은 줄을 알아서 공개한다.
 *
 * **폭은 컨테이너를 채운다.** 세로줄 간격이 56px 로 고정이던 때는 2팀 사다리가
 * 112px 짜리 조각으로 패널 한가운데 떠 있었고, 25팀은 1400px 라 가로로
 * 스크롤해야 했다. 간격을 컨테이너에서 역산하면 양쪽 다 자연스럽다.
 */
export function LadderDrawBoard({
  draw,
  teams,
  onFinished,
}: {
  draw: LadderDraw;
  teams: TeamLabel[];
  onFinished?: () => void;
}) {
  const columnCount = draw.columns.length;
  const [revealed, setRevealed] = useState<number[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const finishedRef = useRef(false);

  // 컨테이너 폭을 재서 세로줄 간격을 역산한다.
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setBoxWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setBoxWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  const gap = useMemo(() => {
    if (columnCount < 2) return MAX_GAP;
    const usable = Math.max(0, boxWidth - SIDE_PAD * 2);
    // 사다리가 차지하는 폭은 `(n-1) * gap` 이 아니라 `n * gap` 이다 — 양끝
    // 세로줄 바깥으로 가로 half-gap 씩 더 나간다(팀 이름 칸이 세로줄을
    // 가운데 두기 때문). 이걸 빼고 계산했다가 모든 팀 수에서 가로로 넘쳤다.
    // 컨테이너를 채우되, 팀이 많아 너무 좁아지면 하한에서 멈추고 스크롤한다.
    return Math.min(MAX_GAP, Math.max(MIN_GAP, usable / columnCount));
  }, [boxWidth, columnCount]);

  // 행 높이는 목표 높이에서 역산한다.
  const rowHeight = useMemo(
    () => Math.min(44, Math.max(16, TARGET_HEIGHT / draw.rowCount)),
    [draw.rowCount],
  );

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );

  // 팀 색이 겹치면 많은 팀의 경로가 같은 선처럼 보인다. 고유 색은 그대로
  // 존중하고, 중복된 색만 황금각 색상으로 분산해 25팀에서도 구분한다.
  const visualColors = useMemo(() => {
    const provided = draw.columns.map(
      (teamId) => teamById.get(teamId)?.color?.toLowerCase() || null,
    );
    const counts = new Map<string, number>();
    for (const color of provided) {
      if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    return provided.map((color, index) => {
      if (color && counts.get(color) === 1) return color;
      const hue = Math.round((212 + index * 137.508) % 360);
      return `hsl(${hue} 72% 60%)`;
    });
  }, [draw.columns, teamById]);

  // 각 세로줄이 도착하는 칸. 서버가 보낸 사다리를 그대로 따라간다.
  const trace = useMemo(
    () => traceLadder(draw.rungs, columnCount, draw.rowCount),
    [draw, columnCount],
  );

  const reveal = useCallback((index: number) => {
    setActiveIndex(index);
    setRevealed((list) => (list.includes(index) ? list : [...list, index]));
  }, []);

  // 아무도 안 누르면 한 줄씩 알아서 공개한다. 누르면 그 타이머는 다시 시작한다.
  useEffect(() => {
    if (revealed.length >= columnCount) return;
    const next = draw.columns.findIndex((_, i) => !revealed.includes(i));
    if (next < 0) return;
    const timer = setTimeout(() => reveal(next), autoRevealDelay(columnCount));
    return () => clearTimeout(timer);
  }, [revealed, columnCount, draw.columns, reveal]);

  // 전부 공개되면 한 번만 알린다.
  useEffect(() => {
    if (finishedRef.current || revealed.length < columnCount) return;
    finishedRef.current = true;
    onFinished?.();
  }, [revealed, columnCount, onFinished]);

  const width = Math.max(1, columnCount - 1) * gap;
  const height = draw.rowCount * rowHeight + TOP_PAD * 2;
  const allRevealed = revealed.length >= columnCount;
  const needsHorizontalScroll =
    boxWidth > 0 && columnCount * MIN_GAP + SIDE_PAD * 2 > boxWidth;

  /** 한 팀이 지나가는 경로를 SVG path 로 만든다. */
  const pathFor = (startColumn: number) => {
    const byRow = new Map<number, number[]>();
    for (const rung of draw.rungs) {
      byRow.set(rung.row, [...(byRow.get(rung.row) ?? []), rung.left]);
    }
    let column = startColumn;
    let d = `M ${column * gap} ${TOP_PAD}`;
    for (let row = 0; row < draw.rowCount; row++) {
      const y = TOP_PAD + (row + 1) * rowHeight;
      const lefts = byRow.get(row);
      const next = lefts?.includes(column)
        ? column + 1
        : lefts?.includes(column - 1)
          ? column - 1
          : column;
      if (next !== column) {
        // 가로줄까지 내려간 뒤 옆으로 건너간다.
        d += ` L ${column * gap} ${y} L ${next * gap} ${y}`;
        column = next;
      } else {
        d += ` L ${column * gap} ${y}`;
      }
    }
    return d;
  };

  /** 픽 순서대로 정렬한 결과. 전부 공개된 뒤 아래에 요약으로 보여준다. */
  const finalOrder = useMemo(() => {
    const byPosition: Array<{ position: number; teamId: string }> = [];
    draw.columns.forEach((teamId, columnIndex) => {
      byPosition.push({ position: draw.bottom[trace[columnIndex]], teamId });
    });
    return byPosition.sort((a, b) => a.position - b.position);
  }, [draw, trace]);

  return (
    <div ref={boxRef}>
      <div className="mb-2 flex min-h-6 items-center justify-between gap-3 px-1 text-[11px]">
        <p className="font-semibold text-text-secondary" aria-live="polite">
          <span className="text-accent-primary">{revealed.length}</span>
          <span className="text-text-muted"> / {columnCount}</span>
          <span className="ml-2 text-text-tertiary">
            {revealed.length === 0
              ? "팀을 눌러 경로를 확인하세요"
              : `${teamById.get(draw.columns[activeIndex ?? 0])?.name ?? "팀"} 경로 강조 중`}
          </span>
        </p>
        {needsHorizontalScroll && (
          <span className="shrink-0 text-text-muted">
            좌우로 밀어 전체 보기
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <div
          className="mx-auto"
          style={{
            width: columnCount * gap + SIDE_PAD * 2,
            paddingInline: SIDE_PAD,
          }}
        >
          {/* 위: 팀 이름. 눌러서 그 줄을 탄다. */}
          <div className="flex">
            {draw.columns.map((teamId, index) => {
              const team = teamById.get(teamId);
              const isOpen = revealed.includes(index);
              return (
                <button
                  key={teamId}
                  type="button"
                  onClick={() => reveal(index)}
                  title={team?.name ?? teamId}
                  aria-label={`${team?.name ?? "팀"} 줄 타기`}
                  aria-pressed={activeIndex === index}
                  className={`min-w-0 rounded-md px-1 py-1.5 text-center text-[11px] font-bold transition-colors ${
                    activeIndex === index && isOpen
                      ? "bg-bg-tertiary text-text-primary"
                      : isOpen
                        ? "text-text-primary"
                        : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                  }`}
                  style={{ width: gap }}
                >
                  <span
                    className="mx-auto mb-1 block h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: visualColors[index],
                      opacity: isOpen ? 1 : 0.45,
                    }}
                  />
                  <span className="block truncate">{team?.name ?? "팀"}</span>
                </button>
              );
            })}
          </div>

          <svg
            width={width + gap}
            height={height}
            viewBox={`${-gap / 2} 0 ${width + gap} ${height}`}
            className="my-1"
          >
            {/* 세로줄 */}
            {draw.columns.map((_, index) => (
              <line
                key={`v-${index}`}
                x1={index * gap}
                y1={TOP_PAD}
                x2={index * gap}
                y2={height - TOP_PAD}
                className="stroke-bg-elevated"
                strokeWidth={2}
              />
            ))}
            {/* 가로줄 */}
            {draw.rungs.map((rung, index) => (
              <line
                key={`h-${index}`}
                x1={rung.left * gap}
                y1={TOP_PAD + (rung.row + 1) * rowHeight}
                x2={(rung.left + 1) * gap}
                y2={TOP_PAD + (rung.row + 1) * rowHeight}
                className="stroke-bg-elevated"
                strokeWidth={2}
              />
            ))}
            {/* 공개된 팀의 경로. 누른 순서대로 그려진다. */}
            {revealed.map((columnIndex) => {
              const teamId = draw.columns[columnIndex];
              const isActive = activeIndex === columnIndex;
              return (
                <path
                  key={`p-${teamId}`}
                  d={pathFor(columnIndex)}
                  fill="none"
                  stroke={visualColors[columnIndex]}
                  strokeWidth={isActive ? 4 : 2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    // 선이 위에서 아래로 그려지는 것처럼 보이게 한다.
                    strokeDasharray: 4000,
                    strokeDashoffset: 0,
                    animation: `ladder-trace ${TRACE_MS}ms ease-out both`,
                    opacity: isActive ? 1 : allRevealed ? 0.24 : 0.34,
                    filter: isActive
                      ? `drop-shadow(0 0 5px ${visualColors[columnIndex]})`
                      : "none",
                    transition: "opacity 180ms ease, filter 180ms ease",
                  }}
                />
              );
            })}
          </svg>

          {/* 아래: 픽 순서 */}
          <div className="flex">
            {draw.bottom.map((position, columnIndex) => {
              // 이 칸에 도착하는 팀이 공개됐는지
              const arrivedFrom = trace.findIndex((end) => end === columnIndex);
              const shown = arrivedFrom >= 0 && revealed.includes(arrivedFrom);
              return (
                <div
                  key={`b-${columnIndex}`}
                  className="px-1 text-center"
                  style={{ width: gap }}
                >
                  <span
                    className={`inline-block rounded-md px-2 py-1 text-[11px] font-black tabular-nums transition-colors ${
                      shown
                        ? "bg-accent-primary text-accent-on"
                        : "bg-bg-tertiary text-text-muted"
                    }`}
                  >
                    {position + 1}번
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 다 타고 내려온 뒤의 결과. 사다리에서 눈으로 읽지 않아도 되게 한 줄로 적는다. */}
      {allRevealed && (
        <div className="mt-4 rounded-xl border border-bg-tertiary bg-bg-primary/45 p-3">
          <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-text-tertiary">
            최종 픽 순서
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {finalOrder.map(({ position, teamId }) => {
              const team = teamById.get(teamId);
              const columnIndex = draw.columns.indexOf(teamId);
              return (
                <button
                  type="button"
                  key={teamId}
                  onClick={() => reveal(columnIndex)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
                    activeIndex === columnIndex
                      ? "border-accent-primary/60 bg-accent-primary/10 text-text-primary"
                      : "border-bg-tertiary bg-bg-secondary text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span className="tabular-nums text-accent-primary">
                    {position + 1}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: visualColors[columnIndex],
                    }}
                  />
                  <span className="max-w-[10rem] truncate">
                    {team?.name ?? "팀"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes ladder-trace {
          from {
            stroke-dashoffset: 4000;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          path {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
