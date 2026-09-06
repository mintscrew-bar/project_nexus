"use client";

import { useEffect, useMemo, useState } from "react";
import { traceLadder, type LadderDraw } from "@nexus/types";

/** 세로줄 간격·행 높이. 팀이 많아도 화면에 들어가도록 좁게 잡는다. */
const COLUMN_GAP = 56;
const ROW_HEIGHT = 22;
const TOP_PAD = 8;

/** 한 팀이 사다리를 타고 내려가는 데 걸리는 시간 */
const TRACE_MS = 900;
/** 다음 팀이 출발하기까지의 간격 */
const STAGGER_MS = 260;

interface TeamLabel {
  id: string;
  name: string;
  color?: string | null;
}

/**
 * 픽 순서 추첨 사다리.
 *
 * **순서는 서버가 이미 정했다.** 이 화면은 그 결과가 나오도록 구성된 사다리를
 * 그대로 그려 보여줄 뿐이라, 여기서 다시 뽑거나 흔들지 않는다.
 * 팀마다 경로를 따라 내려가는 선을 순서대로 그린다.
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
  const [revealed, setRevealed] = useState(0);

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );

  // 각 세로줄이 도착하는 칸. 서버가 보낸 사다리를 그대로 따라간다.
  const trace = useMemo(
    () => traceLadder(draw.rungs, columnCount, draw.rowCount),
    [draw, columnCount],
  );

  useEffect(() => {
    if (revealed >= columnCount) {
      onFinished?.();
      return;
    }
    const timer = setTimeout(
      () => setRevealed((count) => count + 1),
      revealed === 0 ? 400 : STAGGER_MS,
    );
    return () => clearTimeout(timer);
  }, [revealed, columnCount, onFinished]);

  const width = Math.max(1, columnCount - 1) * COLUMN_GAP;
  const height = draw.rowCount * ROW_HEIGHT + TOP_PAD * 2;

  /** 한 팀이 지나가는 경로를 SVG path 로 만든다. */
  const pathFor = (startColumn: number) => {
    const byRow = new Map<number, number[]>();
    for (const rung of draw.rungs) {
      byRow.set(rung.row, [...(byRow.get(rung.row) ?? []), rung.left]);
    }
    let column = startColumn;
    let d = `M ${column * COLUMN_GAP} ${TOP_PAD}`;
    for (let row = 0; row < draw.rowCount; row++) {
      const y = TOP_PAD + (row + 1) * ROW_HEIGHT;
      const lefts = byRow.get(row);
      const next = lefts?.includes(column)
        ? column + 1
        : lefts?.includes(column - 1)
          ? column - 1
          : column;
      if (next !== column) {
        // 가로줄까지 내려간 뒤 옆으로 건너간다.
        d += ` L ${column * COLUMN_GAP} ${y} L ${next * COLUMN_GAP} ${y}`;
        column = next;
      } else {
        d += ` L ${column * COLUMN_GAP} ${y}`;
      }
    }
    return d;
  };

  return (
    <div className="overflow-x-auto">
      <div className="mx-auto w-fit">
        {/* 위: 팀 이름 */}
        <div
          className="flex"
          style={{ width: width + COLUMN_GAP, marginLeft: -COLUMN_GAP / 2 }}
        >
          {draw.columns.map((teamId) => {
            const team = teamById.get(teamId);
            return (
              <div
                key={teamId}
                className="truncate px-1 text-center text-[11px] font-bold text-text-primary"
                style={{ width: COLUMN_GAP }}
                title={team?.name ?? teamId}
              >
                {team?.name ?? "팀"}
              </div>
            );
          })}
        </div>

        <svg
          width={width + COLUMN_GAP}
          height={height}
          viewBox={`${-COLUMN_GAP / 2} 0 ${width + COLUMN_GAP} ${height}`}
          className="my-1"
        >
          {/* 세로줄 */}
          {draw.columns.map((_, index) => (
            <line
              key={`v-${index}`}
              x1={index * COLUMN_GAP}
              y1={TOP_PAD}
              x2={index * COLUMN_GAP}
              y2={height - TOP_PAD}
              className="stroke-bg-elevated"
              strokeWidth={2}
            />
          ))}
          {/* 가로줄 */}
          {draw.rungs.map((rung, index) => (
            <line
              key={`h-${index}`}
              x1={rung.left * COLUMN_GAP}
              y1={TOP_PAD + (rung.row + 1) * ROW_HEIGHT}
              x2={(rung.left + 1) * COLUMN_GAP}
              y2={TOP_PAD + (rung.row + 1) * ROW_HEIGHT}
              className="stroke-bg-elevated"
              strokeWidth={2}
            />
          ))}
          {/* 이미 공개된 팀의 경로 */}
          {draw.columns.slice(0, revealed).map((teamId, index) => {
            const team = teamById.get(teamId);
            return (
              <path
                key={`p-${teamId}`}
                d={pathFor(index)}
                fill="none"
                stroke={team?.color || "rgb(var(--color-accent-primary))"}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  // 선이 위에서 아래로 그려지는 것처럼 보이게 한다.
                  strokeDasharray: 4000,
                  strokeDashoffset: 0,
                  animation: `ladder-trace ${TRACE_MS}ms ease-out both`,
                }}
              />
            );
          })}
        </svg>

        {/* 아래: 픽 순서 */}
        <div
          className="flex"
          style={{ width: width + COLUMN_GAP, marginLeft: -COLUMN_GAP / 2 }}
        >
          {draw.bottom.map((position, columnIndex) => {
            // 이 칸에 도착하는 팀이 공개됐는지
            const arrivedFrom = trace.findIndex(
              (end) => end === columnIndex,
            );
            const shown = arrivedFrom >= 0 && arrivedFrom < revealed;
            return (
              <div
                key={`b-${columnIndex}`}
                className={`text-center text-[11px] font-black transition-colors ${
                  shown ? "text-accent-primary" : "text-text-muted"
                }`}
                style={{ width: COLUMN_GAP }}
              >
                {position + 1}번
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        @keyframes ladder-trace {
          from {
            stroke-dashoffset: 4000;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}
