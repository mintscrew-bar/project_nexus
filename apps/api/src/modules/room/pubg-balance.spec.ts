/**
 * 배그 자동 밸런스는 라인 개념이 없어 "팀 합계만 고르게" 가 전부다.
 * 뱀 순서(1-2-3-4-4-3-2-1)로 나눠 담으면 팀 수가 많아도 합계가 벌어지지 않는다.
 * room.service 의 분배 로직과 같은 규칙을 여기서 검증한다.
 */
function snakeDistribute(scores: number[], teamCount: number): number[][] {
  const sorted = [...scores].sort((a, b) => b - a);
  const teams: number[][] = Array.from({ length: teamCount }, () => []);
  sorted.forEach((score, index) => {
    const round = Math.floor(index / teamCount);
    const offset = index % teamCount;
    teams[round % 2 === 0 ? offset : teamCount - 1 - offset].push(score);
  });
  return teams;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("배그 뱀 순서 분배", () => {
  it("4인 4팀 — 팀 합계 격차가 좁다", () => {
    const scores = Array.from({ length: 16 }, (_, i) => 100 - i * 5);
    const teams = snakeDistribute(scores, 4);

    expect(teams).toHaveLength(4);
    teams.forEach((team) => expect(team).toHaveLength(4));

    const totals = teams.map(sum);
    // 한 방향으로만 돌리면 1번 팀에 상위권이 몰려 격차가 크게 벌어진다.
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(10);
  });

  it("16팀 64명에서도 합계가 벌어지지 않는다", () => {
    const scores = Array.from({ length: 64 }, (_, i) => 100 - i);
    const totals = snakeDistribute(scores, 16).map(sum);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(16);
  });

  it("킬내기 2팀 8명", () => {
    const teams = snakeDistribute([90, 85, 80, 75, 70, 65, 60, 55], 2);
    expect(teams.map((t) => t.length)).toEqual([4, 4]);
    const totals = teams.map(sum);
    expect(Math.abs(totals[0] - totals[1])).toBeLessThanOrEqual(5);
  });

  it("같은 점수만 있으면 완전히 균등하다", () => {
    const totals = snakeDistribute(Array(16).fill(50), 4).map(sum);
    expect(new Set(totals).size).toBe(1);
  });
});
