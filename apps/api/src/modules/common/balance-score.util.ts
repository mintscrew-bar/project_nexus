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

/**
 * 라인 대결 지표의 라인별 표준편차 (우리 DB 솔로랭크 라인 대결 191,613쌍 실측, 2026-08).
 *
 * 서포터의 골드·CS 편차는 다른 라인의 절반도 안 되므로, 라인마다 다른 자로
 * 재야 "서포터는 다 못한다"는 결론이 나오지 않는다. 값은 메타에 따라 조금씩
 * 움직이지만 밸런스 점수 규모에 영향을 줄 만큼은 아니라 상수로 둔다.
 */
const LANE_METRIC_DEVIATIONS: Record<
  string,
  {
    goldPerMin: number;
    csPerMin: number;
    damagePerMin: number;
    visionPerMin: number;
    netKills: number;
  }
> = {
  TOP: {
    goldPerMin: 127.2,
    csPerMin: 1.81,
    damagePerMin: 430.9,
    visionPerMin: 0.36,
    netKills: 12.05,
  },
  JUNGLE: {
    goldPerMin: 122.1,
    csPerMin: 1.79,
    damagePerMin: 376.8,
    visionPerMin: 0.48,
    netKills: 13.08,
  },
  MID: {
    goldPerMin: 114.6,
    csPerMin: 1.64,
    damagePerMin: 414.7,
    visionPerMin: 0.38,
    netKills: 12.42,
  },
  ADC: {
    goldPerMin: 147.9,
    csPerMin: 1.57,
    damagePerMin: 495.7,
    visionPerMin: 0.37,
    netKills: 13.66,
  },
  SUPPORT: {
    goldPerMin: 68.3,
    csPerMin: 0.73,
    damagePerMin: 293.3,
    visionPerMin: 0.75,
    netKills: 13.91,
  },
};

/**
 * 라인 우위 1 표준편차를 티어 점수 몇 점으로 볼지.
 *
 * 실측(홀수 경기 지표로 짝수 경기 승률 예측)에서 지표 상·하위 구간의 승률이
 * 55.3% 대 44.8% 로 갈렸다. 티어 한 단계(4~6점) 안팎으로 보는 게 맞다.
 */
const LANE_EDGE_TIER_POINTS = 5;

/** 라인 우위 보정의 상·하한 — 표본이 튀어도 티어 한 단계 조금 넘게만 움직인다 */
const LANE_EDGE_MAX_POINTS = 6;

/** 라인 우위를 믿기 시작하는 판수 기준 (10판이면 절반만 반영) */
const LANE_EDGE_PRIOR_GAMES = 10;

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
  /**
   * 라인 대결 지표(솔로랭크 라인 상대 대비 차이의 평균).
   *
   * 라인별 티어는 본인이 직접 등록해야 하는데 실제 등록률이 2%(341계정 중 7)라,
   * 티어 점수는 다섯 라인이 늘 같은 값이었다. 같은 경기·같은 라인·반대 팀이라는
   * 대조군이 티어를 자동으로 통제해 주므로, 이 차이로 라인 실력을 추정한다.
   */
  laneEdges?: BalanceLaneEdgeInput[] | null;
}

/** 라인 상대 대비 지표 차이의 평균 (분당 기준, netKills 만 경기당) */
export interface BalanceLaneEdgeInput {
  role: Role;
  games: number;
  goldPerMin: number;
  csPerMin: number;
  damagePerMin: number;
  visionPerMin: number;
  netKills: number;
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
  /** 라인 상대 대비 우위 (표준편차 단위). 대결 표본이 없으면 null */
  laneEdgeZ: number | null;
  /** 라인 우위로 티어 점수에 더해진 값 */
  laneEdgeBonus: number;
  /** 라인 우위 계산에 쓴 대결 판수 */
  laneEdgeGames: number;
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

  // ── 라인 우위 보정 ──
  // 같은 경기·같은 라인·반대 팀 상대와의 지표 차이를 라인별 표준편차로 나눠
  // 평균한다. 지표가 서로 겹치므로(골드가 높으면 데미지도 높다) 합이 아니라
  // 평균을 쓴다 — 한 방향으로 과장되는 걸 막는다.
  const laneEdge = input.laneEdges?.find((entry) => entry.role === role);
  const laneDeviation = LANE_METRIC_DEVIATIONS[role];
  const laneEdgeGames = normalizedCount(laneEdge?.games);
  const laneEdgeZ =
    laneEdge && laneDeviation && laneEdgeGames > 0
      ? (laneEdge.goldPerMin / laneDeviation.goldPerMin +
          laneEdge.csPerMin / laneDeviation.csPerMin +
          laneEdge.damagePerMin / laneDeviation.damagePerMin +
          laneEdge.visionPerMin / laneDeviation.visionPerMin +
          laneEdge.netKills / laneDeviation.netKills) /
        5
      : null;

  // 판수가 적으면 0 쪽으로 수축시킨다 (10판이면 절반).
  const laneEdgeConfidence =
    laneEdgeGames / (laneEdgeGames + LANE_EDGE_PRIOR_GAMES);
  const laneEdgeOffset =
    laneEdgeZ === null
      ? 0
      : clamp(
          laneEdgeZ * LANE_EDGE_TIER_POINTS * laneEdgeConfidence,
          -LANE_EDGE_MAX_POINTS,
          LANE_EDGE_MAX_POINTS,
        );
  // 본인이 등록한 라인 티어가 있으면 그만큼은 이미 반영된 것으로 보고, 그
  // 나머지 몫만 추정치로 채운다.
  const laneEdgeBonus = roleTierScore
    ? laneEdgeOffset * (1 - roleTierWeight)
    : laneEdgeOffset;

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
      Math.max(
        0,
        tierScore +
          laneEdgeBonus +
          peakBonus +
          soloWinRateBonus +
          nexusWinRateBonus,
      ),
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
    laneEdgeZ,
    laneEdgeBonus,
    laneEdgeGames,
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
