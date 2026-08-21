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

  it("솔랭 라인별 전적이 있으면 라인마다 점수가 갈린다", () => {
    // 큐 전체 승률(soloWins/soloLosses)은 라인 정보가 없어 다섯 라인이 같은 값을
    // 받는다. 라인별 전적이 들어오면 잘하는 라인과 못하는 라인이 벌어져야 한다.
    const input = {
      currentTier: { tier: "PLATINUM", rank: "IV", lp: 0 },
      soloWins: 100,
      soloLosses: 100,
      rankedRoleRecords: [
        { role: Role.MID, totalGames: 80, wins: 52, losses: 28 },
        { role: Role.SUPPORT, totalGames: 80, wins: 28, losses: 52 },
      ],
    };

    const mid = calculatePlayerRoleBalanceScore(input, Role.MID);
    const support = calculatePlayerRoleBalanceScore(input, Role.SUPPORT);
    const untouched = calculatePlayerRoleBalanceScore(input, Role.TOP);

    expect(mid.score).toBeGreaterThan(support.score);
    // 전적이 없는 라인은 큐 전체 승률(50%)만 남아 보너스가 0에 가깝다.
    expect(untouched.rankedRoleGames).toBe(0);
    expect(untouched.rankedRoleWeight).toBe(0);
    expect(mid.rankedRoleWeight).toBeGreaterThan(
      support.rankedRoleWeight * 0.9,
    );
  });

  it("솔랭 라인 판수도 라인 티어 신뢰도로 센다", () => {
    const common = {
      currentTier: { tier: "GOLD", rank: "IV", lp: 0 },
      roleTiers: [{ role: Role.JUNGLE, tier: "DIAMOND", rank: "IV", lp: 0 }],
    };

    // 내전 라인 판수가 없어도 솔랭에서 그 라인을 많이 뛰었으면 라인 티어를 믿는다.
    const withRankedGames = calculatePlayerRoleBalanceScore(
      {
        ...common,
        rankedRoleRecords: [
          { role: Role.JUNGLE, totalGames: 40, wins: 20, losses: 20 },
        ],
      },
      Role.JUNGLE,
    );
    const withoutAnyGames = calculatePlayerRoleBalanceScore(
      common,
      Role.JUNGLE,
    );

    expect(withRankedGames.roleTierWeight).toBeGreaterThan(
      withoutAnyGames.roleTierWeight,
    );
    expect(withRankedGames.roleTierWeight).toBeCloseTo(0.7, 5);
    expect(withRankedGames.score).toBeGreaterThan(withoutAnyGames.score);
  });

  it("라인 상대를 앞서면 그 라인 티어 점수가 올라간다", () => {
    const base = { currentTier: { tier: "GOLD", rank: "II", lp: 0 } };
    const ahead = calculatePlayerRoleBalanceScore(
      {
        ...base,
        laneEdges: [
          {
            role: Role.MID,
            games: 60,
            goldPerMin: 114.6,
            csPerMin: 1.64,
            damagePerMin: 414.7,
            visionPerMin: 0.38,
            netKills: 12.42,
          },
        ],
      },
      Role.MID,
    );
    const even = calculatePlayerRoleBalanceScore(base, Role.MID);

    // 모든 지표가 정확히 1 표준편차 앞서면 z = 1.
    expect(ahead.laneEdgeZ).toBeCloseTo(1, 5);
    // 60판이면 신뢰도 60/70 → 5점 * 1 * 0.857.
    expect(ahead.laneEdgeBonus).toBeCloseTo(4.29, 1);
    expect(ahead.score).toBeGreaterThan(even.score);
    expect(even.laneEdgeZ).toBeNull();
    expect(even.laneEdgeBonus).toBe(0);
  });

  it("라인 대결 판수가 적으면 보정을 0 쪽으로 수축시킨다", () => {
    const makeEdge = (games: number) => ({
      role: Role.TOP,
      games,
      goldPerMin: 127.2,
      csPerMin: 1.81,
      damagePerMin: 430.9,
      visionPerMin: 0.36,
      netKills: 12.05,
    });

    const few = calculatePlayerRoleBalanceScore(
      { currentTier: { tier: "GOLD" }, laneEdges: [makeEdge(2)] },
      Role.TOP,
    );
    const many = calculatePlayerRoleBalanceScore(
      { currentTier: { tier: "GOLD" }, laneEdges: [makeEdge(60)] },
      Role.TOP,
    );

    expect(few.laneEdgeZ).toBeCloseTo(many.laneEdgeZ ?? 0, 5);
    expect(few.laneEdgeBonus).toBeLessThan(many.laneEdgeBonus / 3);
  });

  it("서포터는 서포터끼리의 자로 잰다", () => {
    // 서포터의 골드 편차는 다른 라인의 절반도 안 된다. 같은 자를 쓰면
    // 서포터는 늘 뒤처지는 것으로 나온다.
    const supportEdge = {
      games: 40,
      goldPerMin: 68.3,
      csPerMin: 0.73,
      damagePerMin: 293.3,
      visionPerMin: 0.75,
      netKills: 13.91,
    };
    const support = calculatePlayerRoleBalanceScore(
      {
        currentTier: { tier: "GOLD" },
        laneEdges: [{ role: Role.SUPPORT, ...supportEdge }],
      },
      Role.SUPPORT,
    );

    // 서포터 기준으로는 정확히 1 표준편차 우위다.
    expect(support.laneEdgeZ).toBeCloseTo(1, 5);
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
