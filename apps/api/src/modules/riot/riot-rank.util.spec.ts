import {
  getPeakTierUpdate,
  isHigherTier,
  toStoredPeakTier,
} from "./riot-rank.util";

describe("riot-rank utilities", () => {
  it("promotes a peak record when the same tier reaches a higher division", () => {
    expect(isHigherTier("DIAMOND", "I", "DIAMOND", "II")).toBe(true);
    expect(getPeakTierUpdate("DIAMOND", "I", "DIAMOND", "II")).toEqual({
      peakTier: "DIAMOND",
      peakRank: "I",
    });
  });

  it("preserves a manually entered peak when the synced tier is lower", () => {
    expect(getPeakTierUpdate("EMERALD", "I", "DIAMOND", "IV")).toEqual({});
  });

  it("stores apex tiers without a division", () => {
    expect(toStoredPeakTier("MASTER", "I")).toEqual({
      peakTier: "MASTER",
      peakRank: "",
    });
  });

  it("normalizes a legacy apex peak while preserving its higher tier", () => {
    expect(getPeakTierUpdate("DIAMOND", "I", "MASTER", "I")).toEqual({
      peakTier: "MASTER",
      peakRank: "",
    });
  });

  it("does not create an unranked peak and removes a legacy one", () => {
    expect(getPeakTierUpdate("UNRANKED", "", null, null)).toEqual({});
    expect(getPeakTierUpdate("UNRANKED", "", "UNRANKED", "")).toEqual({
      peakTier: null,
      peakRank: null,
    });
  });
});
