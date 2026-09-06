import {
  buildLadderDraw,
  buildRandomRungs,
  resolveLadderOrder,
  traceLadder,
  type LadderRung,
} from "@nexus/types";

/** 테스트용 결정적 난수 — 같은 사다리를 재현할 수 있어야 한다. */
function seededRandom(seed: number) {
  let state = seed;
  return (maxExclusive: number) => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return Math.floor((state / 4294967296) * maxExclusive);
  };
}

describe("사다리 타기", () => {
  it("가로줄이 없으면 제자리로 내려온다", () => {
    expect(traceLadder([], 4, 10)).toEqual([0, 1, 2, 3]);
  });

  it("가로줄 하나는 이웃 두 줄을 맞바꾼다", () => {
    const rungs: LadderRung[] = [{ row: 0, left: 1 }];
    expect(traceLadder(rungs, 4, 3)).toEqual([0, 2, 1, 3]);
  });

  it("같은 자리 가로줄 두 개는 서로 되돌린다", () => {
    const rungs: LadderRung[] = [
      { row: 0, left: 0 },
      { row: 1, left: 0 },
    ];
    expect(traceLadder(rungs, 3, 3)).toEqual([0, 1, 2]);
  });

  it("결과는 항상 순열이다 — 두 팀이 같은 칸에 도착하지 않는다", () => {
    const random = seededRandom(42);
    for (const columnCount of [2, 5, 8, 25]) {
      const rowCount = columnCount * 2;
      const rungs = buildRandomRungs(columnCount, rowCount, random);
      const trace = traceLadder(rungs, columnCount, rowCount);
      expect(new Set(trace).size).toBe(columnCount);
      expect([...trace].sort((a, b) => a - b)).toEqual(
        Array.from({ length: columnCount }, (_, i) => i),
      );
    }
  });

  it("같은 행의 가로줄은 서로 닿지 않는다", () => {
    // 붙어 있으면 어느 쪽으로 가는지가 모호해진다.
    const random = seededRandom(7);
    const rungs = buildRandomRungs(10, 20, random);
    const byRow = new Map<number, number[]>();
    for (const rung of rungs) {
      byRow.set(rung.row, [...(byRow.get(rung.row) ?? []), rung.left]);
    }
    for (const lefts of byRow.values()) {
      const sorted = [...lefts].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("세로줄이 하나뿐이면 가로줄이 없다", () => {
    expect(buildRandomRungs(1, 10, seededRandom(1))).toEqual([]);
  });
});

describe("정해진 순서를 사다리로 표현", () => {
  const teams = ["A", "B", "C", "D", "E"];

  it("사다리를 타면 서버가 정한 순서가 그대로 나온다", () => {
    // 순서는 균등한 셔플이 정하고 사다리는 연출일 뿐이다.
    // 어긋나면 "사다리는 3번인데 실제로는 1번 픽"이 된다.
    const order = ["C", "A", "E", "B", "D"];
    const draw = buildLadderDraw(teams, order, seededRandom(99));
    expect(resolveLadderOrder(draw)).toEqual(order);
  });

  it("어떤 순서·어떤 난수를 줘도 결과가 맞는다", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const random = seededRandom(seed);
      const shuffled = [...teams].sort(() => random(3) - 1);
      const draw = buildLadderDraw(teams, shuffled, random);
      expect(resolveLadderOrder(draw)).toEqual(shuffled);
    }
  });

  it("25팀 배틀로얄에서도 맞는다", () => {
    const many = Array.from({ length: 25 }, (_, i) => `T${i}`);
    const order = [...many].reverse();
    const draw = buildLadderDraw(many, order, seededRandom(5));
    expect(resolveLadderOrder(draw)).toEqual(order);
    // 팀이 많아도 화면에 들어가도록 행 수에 상한을 둔다.
    expect(draw.rowCount).toBeLessThanOrEqual(24);
  });

  it("2팀이어도 사다리가 성립한다", () => {
    const draw = buildLadderDraw(["A", "B"], ["B", "A"], seededRandom(3));
    expect(resolveLadderOrder(draw)).toEqual(["B", "A"]);
    // 세로줄이 둘뿐이어도 화면이 비지 않을 만큼 행이 있어야 한다.
    expect(draw.rowCount).toBeGreaterThanOrEqual(6);
  });

  it("아래 칸은 0부터 N-1 까지 한 번씩 쓰인다", () => {
    const draw = buildLadderDraw(
      teams,
      ["E", "D", "C", "B", "A"],
      seededRandom(11),
    );
    expect([...draw.bottom].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});
