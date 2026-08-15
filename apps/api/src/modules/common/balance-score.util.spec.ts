import { Role } from "@nexus/database";
import {
  calculateBalanceTierPoints,
  calculatePlayerRoleBalanceScore,
} from "./balance-score.util";

describe("balance-score.util", () => {
  it("축소된 티어와 소수점 LP를 계산한다", () => {
    expect(
      calculateBalanceTierPoints({ tier: "GOLD", rank: "II", lp: 50 }),
    ).toBe(24.5);
    expect(
      calculateBalanceTierPoints({ tier: "CHALLENGER", rank: "", lp: 1500 }),
    ).toBe(81);
  });

  it("마스터 이상도 LP 상한 없이 계산한다", () => {
    expect(
      calculateBalanceTierPoints({ tier: "MASTER", rank: "", lp: 800 }),
    ).toBe(54);
    expect(
      calculateBalanceTierPoints({
        tier: "GRANDMASTER",
        rank: "",
        lp: 1200,
      }),
    ).toBe(68);
  });

  it("판수 자체가 아니라 보정 승률로 점수를 올리거나 내린다", () => {
    const common = {
      currentTier: { tier: "PLATINUM", rank: "IV", lp: 0 },
      overallRecord: { totalGames: 100, wins: 50, losses: 50 },
    };
    const winning = calculatePlayerRoleBalanceScore(
      {
        ...common,
        soloWins: 70,
        soloLosses: 30,
        overallRecord: { totalGames: 100, wins: 70, losses: 30 },
      },
      Role.MID,
    );
    const losing = calculatePlayerRoleBalanceScore(
      {
        ...common,
        soloWins: 40,
        soloLosses: 60,
        overallRecord: { totalGames: 100, wins: 40, losses: 60 },
      },
      Role.MID,
    );

    expect(winning.score).toBeGreaterThan(27);
    expect(losing.score).toBeLessThan(27);
  });

  it("라인 판수가 쌓이면 해당 라인 티어와 승률 비중이 커진다", () => {
    const withoutRoleGames = calculatePlayerRoleBalanceScore(
      {
        currentTier: { tier: "PLATINUM", rank: "IV", lp: 0 },
        roleTiers: [{ role: Role.TOP, tier: "DIAMOND", rank: "IV", lp: 0 }],
        overallRecord: { totalGames: 20, wins: 10, losses: 10 },
        roleRecords: [{ role: Role.TOP, totalGames: 0, wins: 0, losses: 0 }],
      },
      Role.TOP,
    );
    const withRoleGames = calculatePlayerRoleBalanceScore(
      {
        currentTier: { tier: "PLATINUM", rank: "IV", lp: 0 },
        roleTiers: [{ role: Role.TOP, tier: "DIAMOND", rank: "IV", lp: 0 }],
        overallRecord: { totalGames: 40, wins: 20, losses: 20 },
        roleRecords: [{ role: Role.TOP, totalGames: 20, wins: 14, losses: 6 }],
      },
      Role.TOP,
    );

    expect(withoutRoleGames.roleTierWeight).toBe(0.4);
    expect(withRoleGames.roleTierWeight).toBeCloseTo(0.7);
    expect(withRoleGames.score).toBeGreaterThan(withoutRoleGames.score);
  });

  it("최종 개인 점수에 상한을 두지 않는다", () => {
    const result = calculatePlayerRoleBalanceScore(
      {
        currentTier: { tier: "CHALLENGER", rank: "", lp: 2000 },
        peakTier: { tier: "CHALLENGER", rank: "", lp: 2000 },
        soloWins: 100,
        soloLosses: 0,
        overallRecord: { totalGames: 100, wins: 100, losses: 0 },
      },
      Role.JUNGLE,
    );

    expect(result.score).toBeGreaterThan(70);
  });
});
