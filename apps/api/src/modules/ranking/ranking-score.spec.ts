import { rankingScore } from "./ranking-score";

describe("rankingScore (보정 승률)", () => {
  it("판수가 적으면 50 쪽으로 당겨진다", () => {
    expect(rankingScore(1, 1)).toBe(58.3);
    expect(rankingScore(0, 1)).toBe(41.7);
  });

  it("많이 이긴 사람이 1판 전승보다 위다", () => {
    expect(rankingScore(6, 9)).toBeGreaterThan(rankingScore(1, 1));
  });

  it("많이 지기만 하면 판수가 많아도 아래다", () => {
    expect(rankingScore(5, 11)).toBeLessThan(rankingScore(1, 1));
  });

  it("기록이 없으면 50", () => {
    expect(rankingScore(0, 0)).toBe(50);
  });
});
