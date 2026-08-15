import { Role } from "@nexus/database";

export const BALANCE_SCORE_VERSION = "2026-08-v1";

const TIER_POINTS: Record<string, number> = {
  UNRANKED: 10,
  IRON: 10,
  BRONZE: 14,
  SILVER: 18,
  GOLD: 22,
  PLATINUM: 27,
  EMERALD: 32,
  DIAMOND: 38,
  MASTER: 46,
  GRANDMASTER: 56,
  CHALLENGER: 66,
};

const RANK_POINTS: Record<string, number> = {
  IV: 0,
  III: 1,
  II: 2,
  I: 3,
  "": 0,
};

const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

export const BALANCE_ROLES: Role[] = [
  Role.TOP,
  Role.JUNGLE,
  Role.MID,
  Role.ADC,
  Role.SUPPORT,
];

export interface BalanceTierInput {
  tier?: string | null;
  rank?: string | null;
  lp?: number | null;
}

export interface BalanceRoleTierInput extends BalanceTierInput {
  role: Role;
}

export interface BalanceRecordInput {
  totalGames?: number | null;
  wins?: number | null;
  losses?: number | null;
}

export interface BalanceRoleRecordInput extends BalanceRecordInput {
  role: Role;
}

export interface PlayerBalanceScoreInput {
  currentTier?: BalanceTierInput | null;
  peakTier?: BalanceTierInput | null;
  roleTiers?: BalanceRoleTierInput[] | null;
  soloWins?: number | null;
  soloLosses?: number | null;
  overallRecord?: BalanceRecordInput | null;
  roleRecords?: BalanceRoleRecordInput[] | null;
}

export interface PlayerRoleBalanceScore {
  role: Role;
  score: number;
  tierScore: number;
  currentTierScore: number;
  roleTierScore: number | null;
  roleTierWeight: number;
  peakBonus: number;
  soloWinRateBonus: number;
  nexusWinRateBonus: number;
  soloGames: number;
  overallGames: number;
  roleGames: number;
  adjustedSoloWinRate: number;
  adjustedNexusWinRate: number;
  version: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function normalizedCount(value?: number | null): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

function recordGames(record?: BalanceRecordInput | null): number {
  if (!record) return 0;
  const wins = normalizedCount(record.wins);
  const losses = normalizedCount(record.losses);
  return Math.max(normalizedCount(record.totalGames), wins + losses);
}

function smoothedWinRate(
  wins: number,
  games: number,
  priorGames: number,
): number {
  return (wins + priorGames / 2) / (games + priorGames);
}

export function calculateBalanceTierPoints(
  input?: BalanceTierInput | null,
): number {
  const tier = (input?.tier || "UNRANKED").toUpperCase();
  const rank = (input?.rank || "").toUpperCase();
  const lp = Math.max(0, input?.lp ?? 0);
  const base = TIER_POINTS[tier] ?? TIER_POINTS.UNRANKED;
  const rankPoints = APEX_TIERS.has(tier) ? 0 : (RANK_POINTS[rank] ?? 0);

  return base + rankPoints + lp / 100;
}

export function calculatePlayerRoleBalanceScore(
  input: PlayerBalanceScoreInput,
  role: Role,
): PlayerRoleBalanceScore {
  const currentTierScore = calculateBalanceTierPoints(input.currentTier);
  const roleTier = input.roleTiers?.find((entry) => entry.role === role);
  const roleTierScore = roleTier ? calculateBalanceTierPoints(roleTier) : null;
  const roleRecord = input.roleRecords?.find((entry) => entry.role === role);
  const roleGames = recordGames(roleRecord);
  const roleTierWeight = roleTier ? 0.4 + Math.min(roleGames / 20, 1) * 0.3 : 0;
  const tierScore = roleTierScore
    ? roleTierScore * roleTierWeight + currentTierScore * (1 - roleTierWeight)
    : currentTierScore;

  const peakTierScore = input.peakTier
    ? calculateBalanceTierPoints(input.peakTier)
    : currentTierScore;
  const peakBonus = clamp((peakTierScore - currentTierScore) * 0.2, 0, 2);

  const soloWins = normalizedCount(input.soloWins);
  const soloLosses = normalizedCount(input.soloLosses);
  const soloGames = soloWins + soloLosses;
  const adjustedSoloWinRate = smoothedWinRate(soloWins, soloGames, 20);
  const soloWinRateBonus = clamp((adjustedSoloWinRate - 0.5) * 10, -2, 2);

  const overallWins = normalizedCount(input.overallRecord?.wins);
  const overallGames = recordGames(input.overallRecord);
  const adjustedOverallWinRate = smoothedWinRate(overallWins, overallGames, 20);
  const roleWins = normalizedCount(roleRecord?.wins);
  const adjustedRoleWinRate = smoothedWinRate(roleWins, roleGames, 10);
  const roleWinRateWeight = 0.7 * (roleGames / (roleGames + 20));
  const adjustedNexusWinRate =
    adjustedOverallWinRate * (1 - roleWinRateWeight) +
    adjustedRoleWinRate * roleWinRateWeight;
  const nexusWinRateBonus = clamp((adjustedNexusWinRate - 0.5) * 20, -4, 4);

  return {
    role,
    score: roundToOneDecimal(
      Math.max(0, tierScore + peakBonus + soloWinRateBonus + nexusWinRateBonus),
    ),
    tierScore,
    currentTierScore,
    roleTierScore,
    roleTierWeight,
    peakBonus,
    soloWinRateBonus,
    nexusWinRateBonus,
    soloGames,
    overallGames,
    roleGames,
    adjustedSoloWinRate,
    adjustedNexusWinRate,
    version: BALANCE_SCORE_VERSION,
  };
}

export function calculatePlayerBalanceScores(
  input: PlayerBalanceScoreInput,
): Record<Role, PlayerRoleBalanceScore> {
  return Object.fromEntries(
    BALANCE_ROLES.map((role) => [
      role,
      calculatePlayerRoleBalanceScore(input, role),
    ]),
  ) as Record<Role, PlayerRoleBalanceScore>;
}
