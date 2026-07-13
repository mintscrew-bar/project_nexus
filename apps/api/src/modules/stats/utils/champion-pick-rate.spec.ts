import { calculateChampionPickRate } from "./champion-pick-rate";

describe("calculateChampionPickRate", () => {
  it("uses all ten champion slots for unfiltered statistics", () => {
    expect(calculateChampionPickRate(10, 10, null)).toBe(0.1);
  });

  it("uses both teams' slots for position statistics", () => {
    expect(calculateChampionPickRate(10, 10, "TOP")).toBe(0.5);
  });

  it("returns zero when there are no matches", () => {
    expect(calculateChampionPickRate(10, 0, "MID")).toBe(0);
  });
});
