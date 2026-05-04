/**
 * Lab 대시보드 React Query 쿼리 키 팩토리 및 응답 타입 정의
 *
 * 모든 Lab API 쿼리 키와 응답 타입을 여기서 중앙 관리하여
 * 캐시 무효화·prefetch·타입 안전성을 일관되게 처리한다.
 */

import { queryOptions } from "@tanstack/react-query";
import { statsApi, riotApi } from "@/lib/api-client";
import type { LabPeriod } from "@/stores/lab-store";

export type LabDataSource = "custom" | "ranked-community" | "ranked-meta";

// ─── 응답 타입 정의 ────────────────────────────────────────────────────────────

export type LabOverview = {
  sample: {
    matchesWithStats: number;
    participantRows: number;
    playersInDataset: number;
    championsInDataset: number;
    itemSelections: number;
    recentMatches30d: number;
  };
  laneProfiles: Array<{
    position: string;
    games: number;
    winRate: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgDamage: number;
    avgGold: number;
  }>;
  championSignals: Array<{
    championId: number;
    championName: string;
    championNameKorean: string;
    games: number;
    winRate: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
  }>;
  itemTrends: Array<{
    itemId: number;
    picks: number;
    uniqueUsers: number;
  }>;
  masteryLeaders: Array<{
    userId: string;
    username: string;
    avatar: string | null;
    championId: number;
    championName: string;
    championNameKorean: string;
    games: number;
    winRate: number;
    avgKda: number;
    masteryScore: number;
  }>;
  seededChampionLeaders: Array<{
    puuid: string;
    gameName: string | null;
    tagLine: string | null;
    championId: number;
    championName: string;
    championNameKorean: string;
    games: number;
    winRate: number;
    avgKda: number;
    lastGameAt: string;
  }>;
};

export type MetaRadarResponse = {
  trending: Array<{
    championId: number;
    championName: string;
    championNameKorean: string;
    recentGames: number;
    recentWinRate: number;
    recentPickRate: number;
    prevPickRate: number;
    pickRateDelta: number;
  }>;
  tiers: Record<
    string,
    Array<{
      championId: number;
      championName: string;
      championNameKorean: string;
      games: number;
      winRate: number;
      pickRate: number;
      tier: "S" | "A" | "B" | "C" | "D";
      confidenceLevel: "low" | "moderate" | "high" | "insufficient";
    }>
  >;
  sample: {
    totalGames: number;
    totalPlayers: number;
    period: LabPeriod;
  };
};

export type PatchImpactResponse = {
  currentPatch: string | null;
  previousPatch: string | null;
  sample: {
    currentGames: number;
    previousGames: number;
    currentTeams: number;
    previousTeams: number;
  };
  buffed: Array<{
    championId: number;
    championNameKorean: string;
    deltaWinRate: number;
    currentWinRate: number;
  }>;
  nerfed: Array<{
    championId: number;
    championNameKorean: string;
    deltaWinRate: number;
    currentWinRate: number;
  }>;
  positionShifts: Array<{
    position: string;
    currentWinRate: number;
    prevWinRate: number;
    deltaWinRate: number;
    currentPickRate: number;
    prevPickRate: number;
    deltaPickRate: number;
    currentGames: number;
    prevGames: number;
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
  }>;
  compositionShifts: Array<{
    type: "TEAMFIGHT" | "SPLIT_PUSH" | "POKE" | "EARLY_AGGRO" | "TANK_LINE";
    label: string;
    currentWinRate: number;
    prevWinRate: number;
    deltaWinRate: number;
    currentPickRate: number;
    prevPickRate: number;
    deltaPickRate: number;
    currentGames: number;
    prevGames: number;
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
  }>;
  insufficient: boolean;
};

export type BanRatesResponse = {
  totalMatches: number;
  banStats: Array<{
    championId: number;
    banRate: number;
    banTeamWinRate: number;
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
  }>;
};

export type ChampionListResponse = {
  period: LabPeriod;
  position: string | null;
  includeLowSample: boolean;
  dataSource: LabDataSource;
  source: "snapshot" | "realtime";
  champions: Array<{
    championId: number;
    championName: string;
    championNameKorean: string;
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    pickRate: number;
    banRate: number;
    wilsonLower: number;
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
  }>;
};

export type SynergyResponse = {
  period: LabPeriod;
  championId: number | null;
  dataSource: "custom" | "ranked-community" | "all";
  source: "snapshot" | "realtime";
  summary: {
    totalPairs: number;
    minGames: number;
  };
  rows: Array<{
    champ1Id: number;
    champ2Id: number;
    champ1NameKorean: string;
    champ2NameKorean: string;
    positions: string[];
    games: number;
    wins: number;
    winRate: number;
    wilsonLower: number;
    expectedWinRate: number;
    deltaWinRate: number;
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
    badges: Array<"시너지 효과 있음" | "표본 충분" | "주의 표본">;
  }>;
};

export type CounterResponse = {
  period: LabPeriod;
  championId: number | null;
  vsChampionId: number | null;
  position: string | null;
  source: "snapshot" | "realtime";
  rows: Array<{
    champId: number;
    vsChampId: number;
    champNameKorean: string;
    vsChampNameKorean: string;
    position: string | null;
    games: number;
    wins: number;
    winRate: number;
    wilsonLower: number;
    wilsonUpper: number;
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
    verdict: "favorable" | "unfavorable" | "even";
  }>;
};

export type CompositionsResponse = {
  period: LabPeriod;
  dataSource: "custom" | "ranked-community" | "all";
  source: "realtime";
  totalTeams: number;
  topTypes: Array<{
    type: "TEAMFIGHT" | "SPLIT_PUSH" | "POKE" | "EARLY_AGGRO" | "TANK_LINE" | "SCALING_CARRY";
    label: string;
    description: string;
    games: number;
    wins: number;
    winRate: number;
    wilsonLower: number;
    pickRate: number;
    avgScore: number;
    avgGameDurationSec: number;
    exampleChampions: Array<{ championId: number; championNameKorean: string; games: number }>;
    reasons: string[];
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
  }>;
  rows: Array<{
    type: "TEAMFIGHT" | "SPLIT_PUSH" | "POKE" | "EARLY_AGGRO" | "TANK_LINE" | "SCALING_CARRY";
    label: string;
    description: string;
    games: number;
    wins: number;
    winRate: number;
    wilsonLower: number;
    pickRate: number;
    avgScore: number;
    avgGameDurationSec: number;
    exampleChampions: Array<{ championId: number; championNameKorean: string; games: number }>;
    reasons: string[];
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
  }>;
  caveat: string;
};

export type AuctionEfficiencyResponse = {
  period: LabPeriod;
  source: "realtime";
  sampleSize: { users: number; games: number };
  moneyball: {
    baselineIndex: number;
    indexStdDev: number;
    minGamesForTrend: number;
    minGamesForRole: number;
    calibration: {
      quarter: string;
      mode: "quarter" | "fallback";
      sampleUsers: number;
      pricedUsers: number;
      priorGames: number;
      scale: number;
      observedIqr: number | null;
      targetIqr: number;
    };
  };
  regression: { beta0: number; beta1: number; residualStdDev: number };
  buckets: Array<{
    label: string;
    minPrice: number;
    maxPrice: number | null;
    games: number;
    users: number;
    avgKda: number;
    avgDamageShare: number;
    winRate: number;
    avgPerformance: number;
  }>;
  scatter: Array<{
    userId: string;
    username: string;
    soldPrice: number;
    performance: number;
    expectedPerformance: number;
    efficiency: number;
    moneyballIndex: number;
    reliability: number;
    recentTrendDelta: number;
    recentTrendPercent: number | null;
    recentGames: number;
    previousGames: number;
    trendConfidence: "insufficient" | "low" | "moderate" | "high";
  }>;
  efficiencyTop: Array<{
    userId: string;
    username: string;
    soldPrice: number;
    performance: number;
    expectedPerformance: number;
    efficiency: number;
    games: number;
    winRate: number;
    avgKda: number;
    avgDamageShare: number;
    moneyballIndex: number;
    reliability: number;
    recentTrendDelta: number;
    recentTrendPercent: number | null;
    recentGames: number;
    previousGames: number;
    trendConfidence: "insufficient" | "low" | "moderate" | "high";
  }>;
  overpricedTop: Array<{
    userId: string;
    username: string;
    soldPrice: number;
    performance: number;
    expectedPerformance: number;
    efficiency: number;
    games: number;
    winRate: number;
    avgKda: number;
    avgDamageShare: number;
    moneyballIndex: number;
    reliability: number;
    recentTrendDelta: number;
    recentTrendPercent: number | null;
    recentGames: number;
    previousGames: number;
    trendConfidence: "insufficient" | "low" | "moderate" | "high";
  }>;
  trendingTop: Array<{
    userId: string;
    username: string;
    soldPrice: number;
    performance: number;
    expectedPerformance: number;
    efficiency: number;
    games: number;
    winRate: number;
    avgKda: number;
    avgDamageShare: number;
    moneyballIndex: number;
    reliability: number;
    recentTrendDelta: number;
    recentTrendPercent: number | null;
    recentGames: number;
    previousGames: number;
    trendConfidence: "insufficient" | "low" | "moderate" | "high";
  }>;
  moneyballTop: Array<{
    userId: string;
    username: string;
    soldPrice: number;
    performance: number;
    expectedPerformance: number;
    efficiency: number;
    games: number;
    winRate: number;
    avgKda: number;
    avgDamageShare: number;
    moneyballIndex: number;
    reliability: number;
    recentTrendDelta: number;
    recentTrendPercent: number | null;
    recentGames: number;
    previousGames: number;
    trendConfidence: "insufficient" | "low" | "moderate" | "high";
  }>;
  bubbleRiskTop: Array<{
    userId: string;
    username: string;
    soldPrice: number;
    performance: number;
    expectedPerformance: number;
    efficiency: number;
    games: number;
    winRate: number;
    avgKda: number;
    avgDamageShare: number;
    moneyballIndex: number;
    recentTrendDelta: number;
    recentTrendPercent: number | null;
    recentGames: number;
    previousGames: number;
  }>;
  roleForm: {
    users: Array<{
      userId: string;
      username: string;
      totalGames: number;
      activeRoles: number;
      primaryPosition: string | null;
      primaryGames: number;
      versatilityScore: number;
      confidence: "insufficient" | "low" | "moderate" | "high";
      offRolePenalty: {
        winRateDelta: number;
        deathRateDelta: number;
        performanceDelta: number;
      } | null;
      positions: Array<{
        position: string;
        games: number;
        winRate: number;
        avgKda: number;
        avgDeaths: number;
        avgDamageShare: number;
        avgPerformance: number;
      }>;
    }>;
    versatilityTop: Array<{
      userId: string;
      username: string;
      totalGames: number;
      activeRoles: number;
      primaryPosition: string | null;
      primaryGames: number;
      versatilityScore: number;
      confidence: "insufficient" | "low" | "moderate" | "high";
      offRolePenalty: {
        winRateDelta: number;
        deathRateDelta: number;
        performanceDelta: number;
      } | null;
      positions: Array<{
        position: string;
        games: number;
        winRate: number;
        avgKda: number;
        avgDeaths: number;
        avgDamageShare: number;
        avgPerformance: number;
      }>;
    }>;
    offRoleRiskTop: Array<{
      userId: string;
      username: string;
      totalGames: number;
      activeRoles: number;
      primaryPosition: string | null;
      primaryGames: number;
      versatilityScore: number;
      confidence: "insufficient" | "low" | "moderate" | "high";
      offRolePenalty: {
        winRateDelta: number;
        deathRateDelta: number;
        performanceDelta: number;
      } | null;
      positions: Array<{
        position: string;
        games: number;
        winRate: number;
        avgKda: number;
        avgDeaths: number;
        avgDamageShare: number;
        avgPerformance: number;
      }>;
    }>;
  };
  unsoldSummary: { users: number; games: number; winRate: number; avgPerformance: number };
};

export type ChampionDetailResponse = {
  championId: number;
  championName: string;
  championNameKorean: string;
  dataSource: LabDataSource;
  period: LabPeriod;
  totals: { games: number; wins: number; winRate: number };
  winrateTrend: Array<{ weekStart: string; games: number; wins: number; winRate: number }>;
  trendInsufficient: boolean;
  patchTrend: Array<{ patch: string; games: number; wins: number; winRate: number }>;
  patchItemTrend: Array<{
    patch: string;
    topItems: Array<{ itemId: number; picks: number; pickRate: number }>;
  }>;
  positions: Array<{
    position: string;
    games: number;
    wins: number;
    winRate: number;
    pickRateWithinChampion: number;
    wilsonLower: number;
    confidenceLevel: "low" | "moderate" | "high" | "insufficient";
  }>;
  topBuilds: Array<{
    coreItems: number[];
    boots: number | null;
    summonerSpellIds: [number, number];
    primaryStyle: number;
    subStyle: number;
    keystonePerk: number;
    games: number;
    wins: number;
    winRate: number;
    wilsonLower: number;
  }>;
  topItemCombos: Array<{
    itemIds: [number, number];
    games: number;
    wins: number;
    winRate: number;
    wilsonLower: number;
  }>;
  topRuneCombos: Array<{
    primaryStyle: number;
    primarySelections: number[];
    subStyle: number;
    subSelections: number[];
    keystonePerk: number;
    games: number;
    wins: number;
    winRate: number;
    wilsonLower: number;
  }>;
};

export type ChampionMasteryResponse = {
  championId: number;
  championName: string;
  championNameKorean: string;
  dataSource: LabDataSource;
  appliedCriteria: {
    minTier: string;
    minRank: string;
    minGames: number;
    minWinRate: number;
    isRelaxed: boolean;
  };
  totalUniquePlayersOnChamp: number;
  qualifiedCount: number;
  insufficient: boolean;
  masteries: Array<{
    rank: number;
    userId: string;
    username: string;
    avatar: string | null;
    riotTier: string;
    riotRank: string;
    champGames: number;
    champWins: number;
    champWinRate: number;
    wilsonLower: number;
    avgKda: number;
    masteryScore: number;
    scoreBreakdown: { volume: number; skill: number; impact: number; recency: number };
    lastPlayedAt: string;
    nexusWinRate: number;
    nexusGlobalRank: number | null;
    avgSoldPrice: number | null;
    badges: Array<"커뮤니티 인증" | "고평가" | "기준 완화" | "양쪽 장인">;
  }>;
};

export type BalanceScoreResponse = {
  teamA: { avgPss: number; modelWinRate: number; adjustedWinRate: number };
  teamB: { avgPss: number; modelWinRate: number; adjustedWinRate: number };
  confidence: { level: "high" | "moderate" | "low"; message: string };
  similarMatches: { count: number; teamAWins: number; teamBWins: number; teamAWinRate: number };
  players: Array<{
    userId: string;
    username: string;
    team: "A" | "B";
    recentGames: number;
    pss: number;
    components: {
      baseWinrate: number;
      kdaFactor: number;
      damageFactor: number;
      nexusWinRateFactor: number;
    };
  }>;
  caveat: string;
};

export type BanRecommendResponse = {
  period: LabPeriod;
  mode: "global" | "byTeam";
  meta: {
    source: "custom" | "hybrid" | "ranked_only" | "none";
    customMetaCount: number;
    rankedMetaCount: number;
    externalSupplementedCount: number;
    rankedPeriod: "30d" | "current_patch" | null;
  };
  recommendations?: Array<{
    championId: number;
    championNameKorean: string;
    banScore: number;
    contributions: { userMastery: number; metaStrength: number; threatScore: number };
    reasons: string[];
  }>;
  byTeam?: {
    teamA: Array<{
      championId: number;
      championNameKorean: string;
      banScore: number;
      contributions: { userMastery: number; metaStrength: number; threatScore: number };
      reasons: string[];
    }>;
    teamB: Array<{
      championId: number;
      championNameKorean: string;
      banScore: number;
      contributions: { userMastery: number; metaStrength: number; threatScore: number };
      reasons: string[];
    }>;
  };
};

export type ItemData = { name: string; image?: { full?: string } };

// Task 37: 유저 간 직접 대전 상성
export type HeadToHeadResponse = {
  userAId: string;
  userBId: string;
  totalGames: number;
  userAWins: number;
  userBWins: number;
  userAWinRate: number;
  userBWinRate: number;
  confidence: "insufficient" | "low" | "moderate" | "high";
  positionBreakdown: Array<{
    userAPosition: string;
    userBPosition: string;
    games: number;
    userAWins: number;
    userAWinRate: number;
  }>;
  recentMatches: Array<{
    matchId: string;
    completedAt: string | null;
    userAChampionId: number;
    userAChampionName: string;
    userAPosition: string;
    userAKills: number;
    userADeaths: number;
    userAAssists: number;
    userAWin: boolean;
    userBChampionId: number;
    userBChampionName: string;
    userBPosition: string;
    userBKills: number;
    userBDeaths: number;
    userBAssists: number;
    userBWin: boolean;
  }>;
};

// Task 38: 시간대별/요일별 패턴 분석
export type PlayPatternsResponse = {
  heatmap: Array<{
    dayOfWeek: number;
    hour: number;
    games: number;
    wins: number;
    winRate: number;
  }>;
  byDayOfWeek: Array<{
    dayOfWeek: number;
    dayLabel: string;
    games: number;
    avgGamesPerWeek: number;
  }>;
  byHour: Array<{
    hour: number;
    games: number;
    avgGamesPerDay: number;
  }>;
  peakDayOfWeek: number;
  peakHour: number;
  totalGames: number;
  periodDays: number;
};

// Task 39: 외부 고티어 랭크 메타 챔피언 스냅샷
export type RankedSnapshotsResponse = {
  period: string;
  patchVersion: string | null;
  champions: Array<{
    championId: number;
    position: string | null;
    games: number;
    wins: number;
    winRate: number;
    avgKda: number;
    avgDamage: number;
    pickRate: number;
    wilsonLower: number;
    confidence: string;
  }>;
  computedAt: string | null;
};

// ─── 쿼리 키 팩토리 ────────────────────────────────────────────────────────────

export const labQueryKeys = {
  /** 전체 Lab 키 루트 (모든 Lab 캐시 일괄 무효화 시 사용) */
  all: () => ["lab"] as const,

  overview: () => ["lab", "overview"] as const,
  items: (locale: string) => ["lab", "items", locale] as const,

  metaRadar: (period: LabPeriod) => ["lab", "meta", "radar", period] as const,
  patchImpact: () => ["lab", "meta", "patch-impact"] as const,
  banRates: (period: LabPeriod) => ["lab", "meta", "ban-rates", period] as const,

  champions: (params: {
    period: LabPeriod;
    position?: string;
    includeLowSample?: boolean;
    source?: LabDataSource;
  }) => ["lab", "champions", params] as const,

  championDetail: (championId: number, period: LabPeriod, source: LabDataSource = "custom") =>
    ["lab", "champion", championId, "detail", period, source] as const,

  championMastery: (championId: number, source: LabDataSource = "custom") =>
    ["lab", "champion", championId, "mastery", source] as const,

  synergy: (params: { period: LabPeriod; championId?: number; limit?: number; source?: "custom" | "ranked-community" | "all" }) =>
    ["lab", "synergy", params] as const,

  counter: (params: {
    period: LabPeriod;
    championId?: number;
    vsChampionId?: number;
    position?: string;
    limit?: number;
  }) => ["lab", "counter", params] as const,

  compositions: (params: { period: LabPeriod; source?: "custom" | "ranked-community" | "all" }) =>
    ["lab", "compositions", params] as const,

  auctionEfficiency: (period: LabPeriod) =>
    ["lab", "oracle", "auction-efficiency", period] as const,

  headToHead: (userAId: string, userBId: string) =>
    ["lab", "oracle", "head-to-head", userAId, userBId] as const,

  playPatterns: (period: LabPeriod) =>
    ["lab", "meta", "play-patterns", period] as const,

  rankedSnapshots: (params: { period?: string; position?: string }) =>
    ["lab", "meta", "ranked-snapshots", params] as const,
} as const;

// ─── 쿼리 옵션 팩토리 ─────────────────────────────────────────────────────────

export const labQueryOptions = {
  overview: () =>
    queryOptions<LabOverview>({
      queryKey: labQueryKeys.overview(),
      queryFn: () => statsApi.getLabOverview() as Promise<LabOverview>,
      staleTime: 5 * 60 * 1000,
    }),

  items: (locale = "ko_KR") =>
    queryOptions<{ data: Record<string, ItemData> }>({
      queryKey: labQueryKeys.items(locale),
      queryFn: () =>
        riotApi.getItems(locale) as Promise<{ data: Record<string, ItemData> }>,
      staleTime: 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    }),

  metaRadar: (period: LabPeriod) =>
    queryOptions<MetaRadarResponse>({
      queryKey: labQueryKeys.metaRadar(period),
      queryFn: () => statsApi.getLabMetaRadar(period) as Promise<MetaRadarResponse>,
      staleTime: 60 * 60 * 1000,
    }),

  patchImpact: () =>
    queryOptions<PatchImpactResponse>({
      queryKey: labQueryKeys.patchImpact(),
      queryFn: () => statsApi.getLabPatchImpact() as Promise<PatchImpactResponse>,
      staleTime: 60 * 60 * 1000,
    }),

  banRates: (period: LabPeriod) =>
    queryOptions<BanRatesResponse>({
      queryKey: labQueryKeys.banRates(period),
      queryFn: () => statsApi.getLabBanRates(period) as Promise<BanRatesResponse>,
      staleTime: 60 * 60 * 1000,
    }),

  champions: (params: {
    period: LabPeriod;
    position?: string;
    includeLowSample?: boolean;
    source?: LabDataSource;
  }) =>
    queryOptions<ChampionListResponse>({
      queryKey: labQueryKeys.champions(params),
      queryFn: () =>
        statsApi.getLabChampions({
          period: params.period,
          position: params.position as "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | undefined,
          includeLowSample: params.includeLowSample,
          source: params.source,
        }) as Promise<ChampionListResponse>,
      staleTime: 30 * 60 * 1000,
    }),

  championDetail: (championId: number, period: LabPeriod, source: LabDataSource = "custom") =>
    queryOptions<ChampionDetailResponse>({
      queryKey: labQueryKeys.championDetail(championId, period, source),
      queryFn: () =>
        statsApi.getLabChampionDetail(championId, period, source) as Promise<ChampionDetailResponse>,
      staleTime: 30 * 60 * 1000,
      enabled: championId > 0,
    }),

  championMastery: (championId: number, source: LabDataSource = "custom") =>
    queryOptions<ChampionMasteryResponse>({
      queryKey: labQueryKeys.championMastery(championId, source),
      queryFn: () =>
        statsApi.getLabChampionMastery(championId, source) as Promise<ChampionMasteryResponse>,
      staleTime: 30 * 60 * 1000,
      enabled: championId > 0,
    }),

  synergy: (params: { period: LabPeriod; championId?: number; limit?: number; source?: "custom" | "ranked-community" | "all" }) =>
    queryOptions<SynergyResponse>({
      queryKey: labQueryKeys.synergy(params),
      queryFn: () => statsApi.getLabSynergy(params) as Promise<SynergyResponse>,
      staleTime: 30 * 60 * 1000,
    }),

  counter: (params: {
    period: LabPeriod;
    championId?: number;
    vsChampionId?: number;
    position?: string;
    limit?: number;
  }) =>
    queryOptions<CounterResponse>({
      queryKey: labQueryKeys.counter(params),
      queryFn: () => statsApi.getLabCounter(params) as Promise<CounterResponse>,
      staleTime: 30 * 60 * 1000,
    }),

  compositions: (params: { period: LabPeriod; source?: "custom" | "ranked-community" | "all" }) =>
    queryOptions<CompositionsResponse>({
      queryKey: labQueryKeys.compositions(params),
      queryFn: () => statsApi.getLabCompositions(params) as Promise<CompositionsResponse>,
      staleTime: 30 * 60 * 1000,
    }),

  auctionEfficiency: (period: LabPeriod) =>
    queryOptions<AuctionEfficiencyResponse>({
      queryKey: labQueryKeys.auctionEfficiency(period),
      queryFn: () =>
        statsApi.getLabAuctionEfficiency({ period }) as Promise<AuctionEfficiencyResponse>,
      staleTime: 30 * 60 * 1000,
    }),

  headToHead: (userAId: string, userBId: string) =>
    queryOptions<HeadToHeadResponse>({
      queryKey: labQueryKeys.headToHead(userAId, userBId),
      queryFn: () =>
        statsApi.getLabHeadToHead(userAId, userBId) as Promise<HeadToHeadResponse>,
      staleTime: 10 * 60 * 1000,
      enabled: Boolean(userAId) && Boolean(userBId) && userAId !== userBId,
    }),

  playPatterns: (period: LabPeriod) =>
    queryOptions<PlayPatternsResponse>({
      queryKey: labQueryKeys.playPatterns(period),
      queryFn: () =>
        statsApi.getLabPlayPatterns(period) as Promise<PlayPatternsResponse>,
      staleTime: 60 * 60 * 1000,
    }),

  rankedSnapshots: (params: { period?: "7d" | "30d" | "current_patch"; position?: string } = {}) =>
    queryOptions<RankedSnapshotsResponse>({
      queryKey: labQueryKeys.rankedSnapshots(params),
      queryFn: () =>
        statsApi.getLabRankedSnapshots(params) as Promise<RankedSnapshotsResponse>,
      staleTime: 60 * 60 * 1000,
    }),
} as const;
