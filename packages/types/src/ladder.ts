/**
 * 사다리타기 추첨.
 *
 * 픽 순서는 **서버의 암호학적 셔플이 정한다.** 사다리는 그 결과가 나오도록
 * 구성할 뿐이다 — 사다리 모양으로 순서를 뽑으면 가로줄 개수에 따라 분포가
 * 한쪽으로 쏠려 균등하지 않다. 균등한 셔플을 먼저 하고, 그 결과를 사다리
 * 아래 칸에 배치하는 순서로 간다.
 *
 * 클라이언트는 서버가 보낸 사다리를 그대로 그린다. 화면에서 다시 뽑으면
 * 사람마다 다른 결과를 보게 된다.
 */

/** 가로줄 하나. `left` 번 세로줄과 `left + 1` 번을 잇는다. */
export interface LadderRung {
  row: number;
  left: number;
}

export interface LadderDraw {
  /** 세로줄 위에 놓일 항목 (팀 ID 등). 표시 순서 그대로다. */
  columns: string[];
  rungs: LadderRung[];
  /** 사다리 아래 칸에 적힐 값. `bottom[k]` 은 k번 세로줄 바닥의 결과다. */
  bottom: number[];
  rowCount: number;
}

/**
 * 사다리를 타고 내려간 결과.
 *
 * `result[i]` = i번 세로줄에서 출발하면 도착하는 세로줄 번호.
 */
export function traceLadder(
  rungs: LadderRung[],
  columnCount: number,
  rowCount: number,
): number[] {
  // 행별로 가로줄을 모아 둔다. 한 행에 여러 개가 있을 수 있다.
  const byRow = new Map<number, number[]>();
  for (const rung of rungs) {
    const list = byRow.get(rung.row);
    if (list) list.push(rung.left);
    else byRow.set(rung.row, [rung.left]);
  }

  const result: number[] = [];
  for (let start = 0; start < columnCount; start++) {
    let column = start;
    for (let row = 0; row < rowCount; row++) {
      const lefts = byRow.get(row);
      if (!lefts) continue;
      // 같은 행의 가로줄은 서로 닿지 않으므로 순서와 무관하게 하나만 걸린다.
      if (lefts.includes(column)) column += 1;
      else if (lefts.includes(column - 1)) column -= 1;
    }
    result[start] = column;
  }
  return result;
}

/**
 * 가로줄이 겹치지 않는 무작위 사다리를 만든다.
 *
 * 같은 행에서 `left` 와 `left + 1` 에 동시에 가로줄이 있으면 어느 쪽으로
 * 가는지가 모호해진다. 한 칸 건너뛰며 놓아 그런 경우를 만들지 않는다.
 */
export function buildRandomRungs(
  columnCount: number,
  rowCount: number,
  randomBelow: (maxExclusive: number) => number,
): LadderRung[] {
  const rungs: LadderRung[] = [];
  if (columnCount < 2) return rungs;

  for (let row = 0; row < rowCount; row++) {
    let left = 0;
    while (left < columnCount - 1) {
      // 대략 절반 확률로 놓는다. 너무 촘촘하면 선이 뭉치고, 너무 성기면
      // 사다리를 타는 맛이 없다.
      if (randomBelow(2) === 0) {
        rungs.push({ row, left });
        left += 2; // 바로 옆에는 놓지 않는다
      } else {
        left += 1;
      }
    }
  }
  return rungs;
}

/**
 * 이미 정해진 순서를 사다리로 표현한다.
 *
 * @param columns   세로줄 위 항목 (표시 순서)
 * @param resultOrder 이 순서대로 뽑혀야 한다. `resultOrder[k]` 은 k번째 차례를
 *                    가져갈 항목이며 `columns` 의 원소여야 한다.
 */
export function buildLadderDraw(
  columns: string[],
  resultOrder: string[],
  randomBelow: (maxExclusive: number) => number,
): LadderDraw {
  const columnCount = columns.length;
  // 세로줄이 적으면 가로줄도 적어야 화면이 비지 않는다.
  const rowCount = Math.max(6, Math.min(24, columnCount * 2));
  const rungs = buildRandomRungs(columnCount, rowCount, randomBelow);
  const trace = traceLadder(rungs, columnCount, rowCount);

  // 사다리를 타고 도착한 칸에 "그 항목이 가져갈 차례"를 적는다.
  // 사다리 모양은 무작위지만 결과는 서버가 정한 순서 그대로다.
  const positionOf = new Map(resultOrder.map((id, index) => [id, index]));
  const bottom: number[] = new Array(columnCount).fill(0);
  columns.forEach((id, columnIndex) => {
    bottom[trace[columnIndex]] = positionOf.get(id) ?? 0;
  });

  return { columns, rungs, bottom, rowCount };
}

/**
 * 사다리가 실제로 그 순서를 만들어내는지 확인한다.
 *
 * 연출이 결과와 어긋나면 "사다리는 3번인데 실제로는 1번 픽"이 된다.
 * 서버가 내보내기 전에 이걸로 검증한다.
 */
export function resolveLadderOrder(draw: LadderDraw): string[] {
  const trace = traceLadder(draw.rungs, draw.columns.length, draw.rowCount);
  const order: string[] = new Array(draw.columns.length).fill("");
  draw.columns.forEach((id, columnIndex) => {
    order[draw.bottom[trace[columnIndex]]] = id;
  });
  return order;
}
