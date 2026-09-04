import {
  DEFAULT_PUBG_POINT_RULE,
  KILL_ONLY_POINT_RULE,
  calculateScrimPoints,
  isValidPointRule,
  sortScrimLeaderboard,
  type ScrimLeaderboardRow,
} from "@nexus/types";

describe("스크림 포인트 환산", () => {
  it("표준표 — 1위 10점 + 킬 1점", () => {
    expect(calculateScrimPoints(1, 8, DEFAULT_PUBG_POINT_RULE)).toBe(18);
    expect(calculateScrimPoints(2, 3, DEFAULT_PUBG_POINT_RULE)).toBe(9);
  });

  it("표에 없는 등수는 순위 점수 0 — 킬만 남는다", () => {
    // 표준표는 8위까지다. 16팀 매치에서 9위 아래를 억지로 채우지 않는다.
    expect(calculateScrimPoints(9, 2, DEFAULT_PUBG_POINT_RULE)).toBe(2);
    expect(calculateScrimPoints(16, 0, DEFAULT_PUBG_POINT_RULE)).toBe(0);
  });

  it("킬만 세는 표는 순위를 무시한다", () => {
    expect(calculateScrimPoints(1, 5, KILL_ONLY_POINT_RULE)).toBe(5);
    expect(calculateScrimPoints(16, 5, KILL_ONLY_POINT_RULE)).toBe(5);
  });

  it("잘못된 순위는 순위 점수를 주지 않는다", () => {
    expect(calculateScrimPoints(0, 3, DEFAULT_PUBG_POINT_RULE)).toBe(3);
    expect(calculateScrimPoints(-1, 0, DEFAULT_PUBG_POINT_RULE)).toBe(0);
  });
});

describe("포인트 규칙표 검증", () => {
  it("기본 프리셋은 통과한다", () => {
    expect(isValidPointRule(DEFAULT_PUBG_POINT_RULE)).toBe(true);
    expect(isValidPointRule(KILL_ONLY_POINT_RULE)).toBe(true);
  });

  it("모양이 깨진 값은 거른다", () => {
    expect(isValidPointRule(null)).toBe(false);
    expect(isValidPointRule({ killPoints: 1 })).toBe(false);
    expect(isValidPointRule({ placementPoints: [10], killPoints: "1" })).toBe(
      false,
    );
    // 음수 포인트는 합계를 뒤집는다.
    expect(isValidPointRule({ placementPoints: [-1], killPoints: 1 })).toBe(
      false,
    );
    // 표가 지나치게 길면 입력 실수다.
    expect(
      isValidPointRule({ placementPoints: Array(101).fill(1), killPoints: 1 }),
    ).toBe(false);
  });
});

describe("누적 리더보드 정렬", () => {
  const row = (over: Partial<ScrimLeaderboardRow>): ScrimLeaderboardRow => ({
    teamId: over.teamName ?? "t",
    teamName: "팀",
    roundPoints: [],
    totalPoints: 0,
    totalKills: 0,
    placementSum: 0,
    bestPlacement: null,
    wins: 0,
    ...over,
  });

  it("총점이 높은 팀이 위로", () => {
    const sorted = sortScrimLeaderboard([
      row({ teamName: "A", totalPoints: 10 }),
      row({ teamName: "B", totalPoints: 25 }),
    ]);
    expect(sorted.map((r) => r.teamName)).toEqual(["B", "A"]);
  });

  it("동점이면 총 킬로 가른다", () => {
    const sorted = sortScrimLeaderboard([
      row({ teamName: "A", totalPoints: 20, totalKills: 5 }),
      row({ teamName: "B", totalPoints: 20, totalKills: 12 }),
    ]);
    expect(sorted[0].teamName).toBe("B");
  });

  it("총점·킬까지 같으면 최고 순위가 좋은 팀이 위로", () => {
    const sorted = sortScrimLeaderboard([
      row({ teamName: "A", totalPoints: 20, totalKills: 5, bestPlacement: 4 }),
      row({ teamName: "B", totalPoints: 20, totalKills: 5, bestPlacement: 1 }),
    ]);
    expect(sorted[0].teamName).toBe("B");
  });

  it("결과가 없는 팀은 아래로 내려가되 사라지지는 않는다", () => {
    const sorted = sortScrimLeaderboard([
      row({ teamName: "결과없음", bestPlacement: null }),
      row({ teamName: "A", totalPoints: 5, bestPlacement: 3 }),
    ]);
    expect(sorted.map((r) => r.teamName)).toEqual(["A", "결과없음"]);
    expect(sorted).toHaveLength(2);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const rows = [
      row({ teamName: "A", totalPoints: 1 }),
      row({ teamName: "B", totalPoints: 2 }),
    ];
    sortScrimLeaderboard(rows);
    expect(rows.map((r) => r.teamName)).toEqual(["A", "B"]);
  });
});
