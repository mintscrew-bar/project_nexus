export const RANKED_TIERS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
] as const;

export const RANKED_DIVISIONS = ["IV", "III", "II", "I"] as const;

const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

const TIER_POINTS: Record<string, number> = {
  CHALLENGER: 2800,
  GRANDMASTER: 2600,
  MASTER: 2400,
  DIAMOND: 2000,
  EMERALD: 1600,
  PLATINUM: 1200,
  GOLD: 800,
  SILVER: 400,
  BRONZE: 200,
  IRON: 100,
  UNRANKED: 0,
};

const DIVISION_POINTS: Record<string, number> = {
  I: 75,
  II: 50,
  III: 25,
  IV: 0,
};

export function isApexTier(tier: string): boolean {
  return APEX_TIERS.has(tier.toUpperCase());
}

export function toStoredPeakTier(tier: string, rank?: string | null) {
  const peakTier = (tier || "UNRANKED").toUpperCase();
  return {
    peakTier,
    peakRank: isApexTier(peakTier) ? "" : (rank || "").toUpperCase(),
  };
}

function tierPoints(tier: string, rank?: string | null): number {
  const stored = toStoredPeakTier(tier, rank);
  return (
    (TIER_POINTS[stored.peakTier] || 0) +
    (DIVISION_POINTS[stored.peakRank] || 0)
  );
}

export function isHigherTier(
  tier: string,
  rank: string,
  peakTier: string | null,
  peakRank: string | null,
): boolean {
  if (!peakTier) return true;
  return tierPoints(tier, rank) > tierPoints(peakTier, peakRank);
}

export function getPeakTierUpdate(
  tier: string,
  rank: string,
  peakTier: string | null,
  peakRank: string | null,
):
  | { peakTier: string | null; peakRank: string | null }
  | Record<string, never> {
  const normalizedTier = (tier || "UNRANKED").toUpperCase();
  if (
    normalizedTier !== "UNRANKED" &&
    isHigherTier(tier, rank, peakTier, peakRank)
  ) {
    return toStoredPeakTier(tier, rank);
  }

  if (peakTier) {
    if (peakTier.toUpperCase() === "UNRANKED") {
      return { peakTier: null, peakRank: null };
    }

    const normalizedPeak = toStoredPeakTier(peakTier, peakRank);
    if (
      normalizedPeak.peakTier !== peakTier ||
      normalizedPeak.peakRank !== (peakRank || "")
    ) {
      return normalizedPeak;
    }
  }

  return {};
}
