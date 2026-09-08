import { calculateNexusScore, calculateNexusTier } from "./pubg-score.util";

describe("NEXUS 편성 점수", () => {
  const full = {
    combatScore: 80,
    iglScore: 60,
    teamplayScore: 70,
    consistencyScore: 50,
    experienceScore: 40,
  };

  it("가중 평균을 반올림한다", () => {
    // 80*.35 + 60*.25 + 70*.2 + 50*.1 + 40*.1 = 28 + 15 + 14 + 5 + 4 = 66
    expect(calculateNexusScore(full)).toBe(66);
  });

  it("만점·0점이 범위를 넘지 않는다", () => {
    expect(
      calculateNexusScore({
        combatScore: 100,
        iglScore: 100,
        teamplayScore: 100,
        consistencyScore: 100,
        experienceScore: 100,
      }),
    ).toBe(100);
    expect(
      calculateNexusScore({
        combatScore: 0,
        iglScore: 0,
        teamplayScore: 0,
        consistencyScore: 0,
        experienceScore: 0,
      }),
    ).toBe(0);
  });

  it("항목이 하나라도 비면 점수를 내지 않는다", () => {
    // 빈 값을 0으로 치면 등급이 조용히 내려간다. 데이터 부족과 낮은 점수는 다르다.
    expect(calculateNexusScore({ ...full, iglScore: null })).toBeNull();
    expect(
      calculateNexusScore({ ...full, experienceScore: undefined }),
    ).toBeNull();
  });

  it("등급 경계", () => {
    expect(calculateNexusTier(85)).toBe("1");
    expect(calculateNexusTier(84)).toBe("2");
    expect(calculateNexusTier(70)).toBe("2");
    expect(calculateNexusTier(69)).toBe("3");
    expect(calculateNexusTier(55)).toBe("3");
    expect(calculateNexusTier(40)).toBe("4");
    expect(calculateNexusTier(39)).toBe("5");
  });

  it("점수가 없으면 등급도 없다 — 5티어가 아니다", () => {
    expect(calculateNexusTier(null)).toBeNull();
  });
});
