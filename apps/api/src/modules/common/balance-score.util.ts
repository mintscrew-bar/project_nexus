import { Role } from "@nexus/database";

export const BALANCE_SCORE_VERSION = "2026-08-v2";

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
  /**
   * 솔로랭크 라인별 전적(match_participants 집계).
   *
   * 리그 엔트리의 soloWins/soloLosses 는 큐 전체 합계라 라인 구분이 없어서,
   * 다섯 라인에 똑같은 값이 더해질 수밖에 없었다. 이 값이 라인별 차이를 만든다.
   */
  rankedRoleRecords?: BalanceRoleRecordInput[] | null;
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
  /** 이 라인의 솔로랭크 판수 */
  rankedRoleGames: number;
  /** 솔랭 승률에서 이 라인 승률이 차지한 비중 */
  rankedRoleWeight: number;
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
  const rankedRoleRecord = input.rankedRoleRecords?.find(
    (entry) => entry.role === role,
  );
  const rankedRoleGames = recordGames(rankedRoleRecord);

  // 등록한 라인 티어를 얼마나 믿을지는 "그 라인을 실제로 얼마나 뛰었나"로 정한다.
  // 내전만 세면 라인당 몇 판에 그쳐 가중치가 바닥에 붙어 있었다. 솔랭 라인 판수를
  // 함께 세면서 라인 티어가 제 몫을 하게 됐다.
  const roleEvidenceGames = roleGames + rankedRoleGames;
  const roleTierWeight = roleTier
    ? 0.4 + Math.min(roleEvidenceGames / 20, 1) * 0.3
    : 0;
  const tierScore = roleTierScore
    ? roleTierScore * roleTierWeight + currentTierScore * (1 - roleTierWeight)
    : currentTierScore;

  const peakTierScore = input.peakTier
    ? calculateBalanceTierPoints(input.peakTier)
    : currentTierScore;
  const peakBonus = clamp((peakTierScore - currentTierScore) * 0.2, 0, 2);

  // ── 솔로랭크 승률: 큐 전체 승률에 그 라인 승률을 섞는다 ──
  // 라인 판수가 쌓일수록 라인 승률이 지배한다(최대 70%). 판수가 없으면
  // 예전처럼 큐 전체 승률만 남아 다섯 라인이 같은 값을 받는다.
  const soloWins = normalizedCount(input.soloWins);
  const soloLosses = normalizedCount(input.soloLosses);
  const soloGames = soloWins + soloLosses;
  const adjustedSoloOverallWinRate = smoothedWinRate(soloWins, soloGames, 20);
  const rankedRoleWins = normalizedCount(rankedRoleRecord?.wins);
  const adjustedRankedRoleWinRate = smoothedWinRate(
    rankedRoleWins,
    rankedRoleGames,
    10,
  );
  const rankedRoleWeight = 0.7 * (rankedRoleGames / (rankedRoleGames + 20));
  const adjustedSoloWinRate =
    adjustedSoloOverallWinRate * (1 - rankedRoleWeight) +
    adjustedRankedRoleWinRate * rankedRoleWeight;
  const soloWinRateBonus = clamp((adjustedSoloWinRate - 0.5) * 10, -2.5, 2.5);

  const overallWins = normalizedCount(input.overallRecord?.wins);
  const overallGames = recordGames(input.overallRecord);
  const adjustedOverallWinRate = smoothedWinRate(overallWins, overallGames, 20);
  const roleWins = normalizedCount(roleRecord?.wins);
  const adjustedRoleWinRate = smoothedWinRate(roleWins, roleGames, 10);
  // 내전은 라인당 판수가 적게 쌓이므로 랭크(20)보다 낮은 기준을 쓴다.
  const roleWinRateWeight = 0.7 * (roleGames / (roleGames + 10));
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
    rankedRoleGames,
    rankedRoleWeight,
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
