import {
  MIN_ROUNDS_FOR_BALANCE,
  PUBG_BALANCE_VERSION,
  calculateAutoBalanceScore,
} from "@nexus/types";

describe("PUBG 편성 점수 자동 산정", () => {
  it("근거가 하나도 없으면 점수를 내지 않는다", () => {
    // "데이터 부족"과 "낮은 점수"는 다르다. 0점으로 떨어뜨리면 안 된다.
    const result = calculateAutoBalanceScore({});
    expect(result.score).toBeNull();
    expect(result.basis).toEqual([]);
  });

  it("공식 랭크만 있어도 점수가 나온다", () => {
    const result = calculateAutoBalanceScore({ officialTier: "Diamond 3" });
    expect(result.score).toBe(74);
    expect(result.basis).toEqual(["OFFICIAL_RANK"]);
  });

  it("모르는 티어 문자열은 무시한다", () => {
    expect(calculateAutoBalanceScore({ officialTier: "Unranked" }).score).toBeNull();
  });

  it("표본이 적으면 내전 성적을 반영하지 않는다", () => {
    const result = calculateAutoBalanceScore({
      officialTier: "Gold",
      averageScrimRank: 1,
      averageTeamCount: 16,
      averageKillsPerRound: 12,
      roundsPlayed: MIN_ROUNDS_FOR_BALANCE - 1,
    });
    // 한두 판 잘한 사람이 최상위로 튀어 오르면 안 된다.
    expect(result.score).toBe(50);
    expect(result.basis).toEqual(["OFFICIAL_RANK"]);
    expect(result.lowSample).toBe(true);
  });

  it("표본이 충분하면 내전 성적이 들어간다", () => {
    const result = calculateAutoBalanceScore({
      officialTier: "Gold",
      averageScrimRank: 1,
      averageTeamCount: 16,
      averageKillsPerRound: 8,
      roundsPlayed: MIN_ROUNDS_FOR_BALANCE,
    });
    // 골드 50 × .4 + 1위(100) × .4 + 킬 만점(100) × .2 = 20 + 40 + 20 = 80
    expect(result.score).toBe(80);
    expect(result.basis).toEqual([
      "OFFICIAL_RANK",
      "SCRIM_RANK",
      "SCRIM_KILLS",
    ]);
    expect(result.lowSample).toBe(false);
  });

  it("순위는 팀 수를 감안한다 — 4팀 중 2위와 16팀 중 2위는 다르다", () => {
    const small = calculateAutoBalanceScore({
      averageScrimRank: 2,
      averageTeamCount: 4,
      roundsPlayed: 10,
    });
    const large = calculateAutoBalanceScore({
      averageScrimRank: 2,
      averageTeamCount: 16,
      roundsPlayed: 10,
    });
    expect(large.score!).toBeGreaterThan(small.score!);
  });

  it("킬은 상한을 둔다 — 한 판에 몰린 킬로 과대평가되지 않게", () => {
    const normal = calculateAutoBalanceScore({
      averageKillsPerRound: 8,
      roundsPlayed: 10,
    });
    const extreme = calculateAutoBalanceScore({
      averageKillsPerRound: 30,
      roundsPlayed: 10,
    });
    expect(normal.score).toBe(100);
    expect(extreme.score).toBe(100);
  });

  it("점수는 0~100 을 벗어나지 않는다", () => {
    const result = calculateAutoBalanceScore({
      officialTier: "Grandmaster",
      averageScrimRank: 1,
      averageTeamCount: 25,
      averageKillsPerRound: 40,
      roundsPlayed: 50,
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("산식 버전을 함께 돌려준다 — 바뀌면 저장된 점수를 다시 계산해야 한다", () => {
    expect(calculateAutoBalanceScore({ officialTier: "Gold" }).version).toBe(
      PUBG_BALANCE_VERSION,
    );
  });
});
