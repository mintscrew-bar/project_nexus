export const CONFIDENCE_THRESHOLDS = {
  insufficient: 5,
  low: 15,
  moderate: 30,
  high: Infinity,
} as const;

export type ConfidenceLevel =
  | "insufficient"
  | "low"
  | "moderate"
  | "high";

export function wilsonLower(wins: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;

  const phat = wins / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = phat + z2 / (2 * total);
  const margin =
    z *
    Math.sqrt((phat * (1 - phat)) / total + z2 / (4 * total * total));

  return Math.max(0, (center - margin) / denominator);
}

export function wilsonUpper(wins: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;

  const phat = wins / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = phat + z2 / (2 * total);
  const margin =
    z *
    Math.sqrt((phat * (1 - phat)) / total + z2 / (4 * total * total));

  return Math.min(1, (center + margin) / denominator);
}

export function getConfidenceLevel(games: number): ConfidenceLevel {
  if (games < CONFIDENCE_THRESHOLDS.insufficient) return "insufficient";
  if (games < CONFIDENCE_THRESHOLDS.low) return "low";
  if (games < CONFIDENCE_THRESHOLDS.moderate) return "moderate";
  return "high";
}

export const TIER_BASE: Record<string, number> = {
  UNRANKED: 0,
  IRON: 0,
  BRONZE: 400,
  SILVER: 800,
  GOLD: 1200,
  PLATINUM: 1600,
  EMERALD: 2000,
  DIAMOND: 2400,
  MASTER: 2800,
  GRANDMASTER: 3200,
  CHALLENGER: 3600,
};

export const RANK_BONUS: Record<string, number> = {
  IV: 0,
  III: 100,
  II: 200,
  I: 300,
  "": 0,
};

const MASTER_PLUS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const RANK_ORDER: Record<string, number> = {
  IV: 0,
  III: 1,
  II: 2,
  I: 3,
  "": 0,
};

export function tierScore(tier: string, rank: string, lp = 0): number {
  const normalizedTier = (tier || "UNRANKED").toUpperCase();
  const normalizedRank = (rank || "").toUpperCase();
  const tierBase = TIER_BASE[normalizedTier] ?? 0;
  const rankBonus = MASTER_PLUS.has(normalizedTier)
    ? 0
    : (RANK_BONUS[normalizedRank] ?? 0);

  return tierBase + rankBonus + lp;
}

export function calculateTierScore(tier: string, rank: string, lp = 0): number {
  return tierScore(tier, rank, lp);
}

export function isTierAbove(
  tier: string,
  rank: string,
  minTier: string,
  minRank: string,
): boolean {
  const normalizedTier = (tier || "UNRANKED").toUpperCase();
  const normalizedRank = (rank || "").toUpperCase();
  const normalizedMinTier = (minTier || "UNRANKED").toUpperCase();
  const normalizedMinRank = (minRank || "").toUpperCase();

  const tierIndex = TIER_BASE[normalizedTier] ?? -1;
  const minTierIndex = TIER_BASE[normalizedMinTier] ?? -1;

  if (tierIndex !== minTierIndex) {
    return tierIndex > minTierIndex;
  }

  return (RANK_ORDER[normalizedRank] ?? -1) >= (RANK_ORDER[normalizedMinRank] ?? -1);
}
