import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { DataDragonService } from "../riot/data-dragon.service";
import {
  wilsonLower,
  wilsonUpper,
  getConfidenceLevel,
  ConfidenceLevel,
  tierScore,
} from "@nexus/types";
import { getChampionKoreanName } from "@nexus/types";
import {
  aggregateCustomMatchStats,
  type MatchStatsSource,
} from "./utils/custom-match-aggregator";
import { normalizeRiotPosition } from "../match/position-normalizer";

// ─── Lab Redis 캐시 키 네임스페이스 ───

const LAB_CACHE_PREFIX = "lab:";
// ─── 타입 정의 ───

export interface LabChampionSnapshotRow {
  championId: number;
  position: string | null;
  games: number;
  wins: number;
  avgKda: number;
  avgDamage: number;
  avgGold: number;
  pickRate: number;
  banRate: number;
  wilsonLower: number;
  confidenceLevel: ConfidenceLevel;
}

export interface LabSynergySnapshotRow {
  champ1Id: number;
  champ2Id: number;
  games: number;
  wins: number;
  winRate: number;
  wilsonLower: number;
  confidenceLevel: ConfidenceLevel;
}

export interface LabCounterSnapshotRow {
  champId: number;
  vsChampId: number;
  position: string | null;
  games: number;
  wins: number;
  winRate: number;
  wilsonLower: number;
  confidenceLevel: ConfidenceLevel;
}

export interface LabChampionWinrateTrendPoint {
  // 주차 시작일 (UTC, ISO 8601). 주 단위 rolling — 일별 집계는 빈 날이 많아 차트가 들쭉날쭉함
  weekStart: string;
  games: number;
  wins: number;
  winRate: number;
}

export interface LabChampionPositionRow {
  position: string;
  games: number;
  wins: number;
  winRate: number;
  pickRateWithinChampion: number; // 해당 챔피언 전체 경기 대비 이 포지션 비중
  wilsonLower: number;
  confidenceLevel: ConfidenceLevel;
}

export interface LabChampionItemComboRow {
  itemIds: [number, number];
  games: number;
  wins: number;
  winRate: number;
  wilsonLower: number;
}

export interface LabChampionRuneComboRow {
  primaryStyle: number;
  subStyle: number;
  keystonePerk: number;
  games: number;
  wins: number;
  winRate: number;
  wilsonLower: number;
}

export interface LabChampionBuildRow {
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
}

export interface LabChampionPatchTrendPoint {
  patch: string; // "14.8" 형식
  games: number;
  wins: number;
  winRate: number;
}

export interface LabChampionPatchItemRow {
  patch: string;
  topItems: Array<{
    itemId: number;
    picks: number;
    pickRate: number; // picks / 해당 패치 총 게임 수
  }>;
}

export interface LabChampionDetailResponse {
  championId: number;
  championName: string;
  championNameKorean: string;
  dataSource: LabStatsDataSource;
  period: "30d" | "90d" | "all";
  totals: {
    games: number;
    wins: number;
    winRate: number;
  };
  winrateTrend: LabChampionWinrateTrendPoint[]; // 데이터 포인트 3개 미만이면 빈 배열
  trendInsufficient: boolean;
  patchTrend: LabChampionPatchTrendPoint[]; // 패치별 승률 추이
  patchItemTrend: LabChampionPatchItemRow[]; // 패치별 아이템 TOP 5
  positions: LabChampionPositionRow[];
  topBuilds: LabChampionBuildRow[]; // 최대 5, 타임라인 구매 순서 우선/없으면 최종 인벤토리 기반
  topItemCombos: LabChampionItemComboRow[]; // 최대 5
  topRuneCombos: LabChampionRuneComboRow[]; // 최대 3
}

export interface LabChampionMasteryCriteria {
  minTier: string;
  minRank: string;
  minGames: number;
  minWinRate: number;
  isRelaxed: boolean;
}

export type LabChampionMasteryBadge = "커뮤니티 인증" | "고평가" | "기준 완화";
export type LabChampionMasteryBadgeWithDerived =
  | LabChampionMasteryBadge
  | "양쪽 장인";

export interface LabChampionMasteryEntry {
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
  scoreBreakdown: {
    volume: number;
    skill: number;
    impact: number;
    recency: number;
  };
  lastPlayedAt: string;
  nexusWinRate: number;
  nexusGlobalRank: number | null;
  avgSoldPrice: number | null;
  badges: LabChampionMasteryBadgeWithDerived[];
}

export interface LabChampionMasteryResponse {
  championId: number;
  championName: string;
  championNameKorean: string;
  dataSource: LabStatsDataSource;
  appliedCriteria: LabChampionMasteryCriteria;
  totalUniquePlayersOnChamp: number;
  qualifiedCount: number;
  insufficient: boolean;
  masteries: LabChampionMasteryEntry[];
}

export interface LabSynergyRow {
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
  confidenceLevel: ConfidenceLevel;
  badges: Array<"시너지 효과 있음" | "표본 충분" | "주의 표본">;
}

export interface LabSynergyResponse {
  period: Period;
  championId: number | null;
  dataSource: MatchStatsSource;
  source: "snapshot" | "realtime";
  summary: {
    totalPairs: number;
    minGames: number;
  };
  rows: LabSynergyRow[];
}

export type LabCounterVerdict = "favorable" | "unfavorable" | "even";

export interface LabCounterRow {
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
  confidenceLevel: ConfidenceLevel;
  verdict: LabCounterVerdict;
}

export interface LabCounterResponse {
  period: Period;
  championId: number | null;
  vsChampionId: number | null;
  position: string | null;
  source: "snapshot" | "realtime";
  rows: LabCounterRow[];
}

export type LabCompositionType =
  | "TEAMFIGHT"
  | "SPLIT_PUSH"
  | "POKE"
  | "EARLY_AGGRO"
  | "TANK_LINE"
  | "SCALING_CARRY";

export interface LabCompositionRow {
  type: LabCompositionType;
  label: string;
  description: string;
  games: number;
  wins: number;
  winRate: number;
  wilsonLower: number;
  pickRate: number;
  avgScore: number;
  avgGameDurationSec: number;
  exampleChampions: Array<{
    championId: number;
    championNameKorean: string;
    games: number;
  }>;
  reasons: string[];
  confidenceLevel: ConfidenceLevel;
}

export interface LabCompositionsResponse {
  period: Period;
  dataSource: MatchStatsSource;
  source: "realtime";
  totalTeams: number;
  topTypes: LabCompositionRow[];
  rows: LabCompositionRow[];
  caveat: string;
}

export interface AuctionEfficiencyBucket {
  label: string;
  minPrice: number;
  maxPrice: number | null;
  games: number;
  users: number;
  avgKda: number;
  avgDamageShare: number;
  winRate: number;
  avgPerformance: number;
}

export interface AuctionEfficiencyPoint {
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
}

export interface AuctionEfficiencyLeader {
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
}

export interface AuctionRoleFormPosition {
  position: string;
  games: number;
  winRate: number;
  avgKda: number;
  avgDeaths: number;
  avgDamageShare: number;
  avgPerformance: number;
}

export interface AuctionRoleFormUser {
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
  positions: AuctionRoleFormPosition[];
}

export interface LabAuctionEfficiencyResponse {
  period: Period;
  source: "realtime";
  sampleSize: {
    users: number;
    games: number;
  };
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
  regression: {
    beta0: number;
    beta1: number;
    residualStdDev: number;
  };
  buckets: AuctionEfficiencyBucket[];
  scatter: AuctionEfficiencyPoint[];
  efficiencyTop: AuctionEfficiencyLeader[];
  overpricedTop: AuctionEfficiencyLeader[];
  trendingTop: AuctionEfficiencyLeader[];
  moneyballTop: AuctionEfficiencyLeader[];
  bubbleRiskTop: AuctionEfficiencyLeader[];
  roleForm: {
    users: AuctionRoleFormUser[];
    versatilityTop: AuctionRoleFormUser[];
    offRoleRiskTop: AuctionRoleFormUser[];
  };
  unsoldSummary: {
    users: number;
    games: number;
    winRate: number;
    avgPerformance: number;
  };
}

export type LabBalanceConfidence = "high" | "moderate" | "low";

export interface LabBalancePlayerScore {
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
}

export interface LabBalanceScoreResponse {
  teamA: {
    avgPss: number;
    modelWinRate: number;
    adjustedWinRate: number;
  };
  teamB: {
    avgPss: number;
    modelWinRate: number;
    adjustedWinRate: number;
  };
  confidence: {
    level: LabBalanceConfidence;
    message: string;
  };
  similarMatches: {
    count: number;
    teamAWins: number;
    teamBWins: number;
    teamAWinRate: number;
  };
  players: LabBalancePlayerScore[];
  caveat: string;
}

export interface LabBanRecommendationRow {
  championId: number;
  championNameKorean: string;
  banScore: number;
  contributions: {
    userMastery: number;
    metaStrength: number;
    threatScore: number;
  };
  reasons: string[];
}

export interface LabBanRecommendResponse {
  period: Period;
  mode: "global" | "byTeam";
  meta: {
    source: "custom" | "hybrid" | "ranked_only" | "none";
    customMetaCount: number;
    rankedMetaCount: number;
    externalSupplementedCount: number;
    rankedPeriod: "30d" | "current_patch" | null;
  };
  recommendations?: LabBanRecommendationRow[];
  byTeam?: {
    teamA: LabBanRecommendationRow[];
    teamB: LabBanRecommendationRow[];
  };
}

export interface LabChampionListRow {
  championId: number;
  championName: string;
  championNameKorean: string;
  position: string | null;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  pickRate: number;
  banRate: number;
  avgKda: number;
  avgDamage: number;
  avgGold: number;
  wilsonLower: number;
  confidenceLevel: ConfidenceLevel;
}

type Period = "30d" | "90d" | "all";
export type LabStatsDataSource = MatchStatsSource | "ranked-meta";
const PERIODS: Period[] = ["30d", "90d", "all"];
const POSITIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT", null] as const;

// 챔피언 스냅샷 집계 대상 소스 — 내전과 외부 ranked 매치를 분리해 따로 집계.
const SNAPSHOT_SOURCES: Array<Exclude<MatchStatsSource, "all">> = [
  "custom",
  "ranked-community",
];
export const LAB_STATS_DATA_SOURCES: LabStatsDataSource[] = [
  "custom",
  "ranked-community",
  "ranked-meta",
];

// ─── 최소 게임 수 임계값 ───

const MIN_GAMES_CHAMPION = 5;
const MIN_GAMES_SYNERGY = 3;
const MIN_GAMES_COUNTER = 3;
const MASTERY_TOP_LIMIT = 50;
const PATCH_IMPACT_MIN_SAMPLE_GAMES = 100;
const PATCH_IMPACT_MIN_CHAMPION_GAMES = 8;
const PATCH_IMPACT_MIN_SHIFT_DELTA = 0.5;
const BOOT_ITEM_IDS = new Set([
  1001, 3006, 3009, 3020, 3111, 3117, 3158, 3170, 3047, 3110, 2422,
]);

@Injectable()
export class LabStatsService {
  private readonly logger = new Logger(LabStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly dataDragon: DataDragonService,
  ) {}

  // ─── 캐시 헬퍼 ───

  private labCacheKey(suffix: string): string {
    return `${LAB_CACHE_PREFIX}${suffix}`;
  }

  /** 스냅샷 갱신 후 lab:* Redis 캐시 일괄 무효화 */
  async invalidateLabCache(): Promise<number> {
    return this.redis.deleteByPattern(`${LAB_CACHE_PREFIX}*`);
  }

  // ─── 기간 필터 헬퍼 ───

  private getPeriodFilter(period: Period): Date | null {
    if (period === "all") return null;
    const days = period === "30d" ? 30 : 90;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private getMatchSourceFilter(source: MatchStatsSource): Prisma.Sql {
    if (source === "custom") {
      return Prisma.sql`AND m."roomId" IS NOT NULL`;
    }
    if (source === "ranked-community") {
      return Prisma.sql`AND m."roomId" IS NULL AND m."riotMatchId" IS NOT NULL`;
    }
    return Prisma.empty;
  }

  // ─── 스냅샷 집계 (야간 cron에서 호출) ───

  /**
   * 챔피언 스냅샷 전체 재계산
   * period 3종 × 포지션 6종(5포지션 + 전체) = 18 조합
   */
  async computeChampionSnapshots(): Promise<number> {
    let totalUpserted = 0;

    // 현재 패치 버전 조회 (가장 최근 매치의 patchVersion) — 루프 밖에서 1회만
    const latestPatch = await this.prisma.match.findFirst({
      where: {
        completedAt: { not: null },
        patchVersion: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: { patchVersion: true },
    });
    const currentPatchVersion = latestPatch?.patchVersion ?? null;

    // source × period × position 매트릭스로 집계 — 내전과 외부 ranked를 별도 행으로 저장.
    for (const source of SNAPSHOT_SOURCES) {
      // SQL WHERE 분기 — aggregator의 buildSourceFilter와 동일한 의미여야 한다.
      const sourceFilterSql =
        source === "custom"
          ? Prisma.sql`AND m."roomId" IS NOT NULL`
          : Prisma.sql`AND m."roomId" IS NULL AND m."riotMatchId" IS NOT NULL`;

      let perSourceUpserted = 0;

      for (const period of PERIODS) {
        const periodFilter = this.getPeriodFilter(period);

        // 해당 기간/소스 전체 매치 수 계산 (픽률 분모)
        const totalMatchesResult = await this.prisma.$queryRaw<
          { count: bigint }[]
        >(Prisma.sql`
          SELECT COUNT(DISTINCT mp."matchId")::bigint AS count
          FROM "match_participants" mp
          INNER JOIN "matches" m ON m."id" = mp."matchId"
          WHERE m."completedAt" IS NOT NULL
            ${sourceFilterSql}
            ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        `);
        const totalMatches = Number(totalMatchesResult[0]?.count ?? 0);

        if (totalMatches === 0) {
          this.logger.log(
            `챔피언 스냅샷 [${source}/${period}]: 매치 없음, 건너뜀`,
          );
          continue;
        }

        // 밴 횟수 집계 (해당 source/기간) — 외부 ranked는 bans 데이터 없을 수 있어
        // 결과가 비어 있어도 정상.
        const banCountsResult = await this.prisma.$queryRaw<
          { championId: number; banCount: bigint }[]
        >(Prisma.sql`
          SELECT
            ban_id::int AS "championId",
            COUNT(*)::bigint AS "banCount"
          FROM (
            SELECT (jsonb_array_elements(mts."bans") ->> 'championId')::int AS ban_id
            FROM "match_team_stats" mts
            INNER JOIN "matches" m ON m."id" = mts."matchId"
            WHERE m."completedAt" IS NOT NULL
              ${sourceFilterSql}
              ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
          ) bans
          WHERE ban_id > 0
          GROUP BY ban_id
        `);
        const banCounts = new Map(
          banCountsResult.map((row) => [row.championId, Number(row.banCount)]),
        );

        for (const position of POSITIONS) {
          const rows = await aggregateCustomMatchStats(this.prisma, {
            period,
            position,
            groupBy: "champion",
            minGames: MIN_GAMES_CHAMPION,
            dateField: "completedAt",
            source,
          });

          for (const row of rows) {
            const games = row.games;
            const wins = row.wins;
            const pickRate =
              position === null
                ? games / (totalMatches * 10) // 전체: 매치당 10명
                : games / totalMatches; // 포지션별: 매치당 해당 포지션 1명
            const banCount = banCounts.get(row.championId) ?? 0;
            const banRate = banCount / totalMatches;
            const wl = wilsonLower(wins, games);

            await this.prisma.labChampionSnapshot.upsert({
              where: {
                source_period_patchVersion_championId_position: {
                  source,
                  period,
                  patchVersion: currentPatchVersion ?? "",
                  championId: row.championId,
                  position: position ?? "",
                },
              },
              create: {
                source,
                period,
                patchVersion: currentPatchVersion,
                championId: row.championId,
                position,
                games,
                wins,
                avgKda: row.avgKda,
                avgDamage: row.avgDamage,
                avgGold: row.avgGold,
                pickRate,
                banRate,
                wilsonLower: wl,
              },
              update: {
                games,
                wins,
                avgKda: row.avgKda,
                avgDamage: row.avgDamage,
                avgGold: row.avgGold,
                pickRate,
                banRate,
                wilsonLower: wl,
                computedAt: new Date(),
              },
            });

            totalUpserted++;
            perSourceUpserted++;
          }
        }
      }

      this.logger.log(
        `챔피언 스냅샷 [${source}] 완료: ${perSourceUpserted}건 upsert`,
      );
    }

    return totalUpserted;
  }

  /**
   * 시너지 스냅샷 전체 재계산
   * 같은 matchId + teamId인 participant 셀프 조인 (champ1Id < champ2Id 정규화)
   */
  async computeSynergySnapshots(): Promise<number> {
    let totalUpserted = 0;

    for (const period of PERIODS) {
      const periodFilter = this.getPeriodFilter(period);

      const rows = await this.prisma.$queryRaw<
        {
          champ1Id: number;
          champ2Id: number;
          games: bigint;
          wins: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          LEAST(a."championId", b."championId") AS "champ1Id",
          GREATEST(a."championId", b."championId") AS "champ2Id",
          COUNT(*)::bigint AS games,
          SUM(CASE WHEN a."win" THEN 1 ELSE 0 END)::bigint AS wins
        FROM "match_participants" a
        INNER JOIN "match_participants" b
          ON a."matchId" = b."matchId"
          AND (
            (a."teamId" IS NOT NULL AND b."teamId" IS NOT NULL AND a."teamId" = b."teamId")
            OR (a."teamId" IS NULL AND b."teamId" IS NULL AND a."win" = b."win")
          )
          AND a."id" < b."id"
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
          AND m."roomId" IS NOT NULL
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        GROUP BY 1, 2
        HAVING COUNT(*) >= ${MIN_GAMES_SYNERGY}
      `);

      for (const row of rows) {
        const games = Number(row.games);
        const wins = Number(row.wins);
        const winRate = games > 0 ? wins / games : 0;
        const wl = wilsonLower(wins, games);

        await this.prisma.labSynergySnapshot.upsert({
          where: {
            period_champ1Id_champ2Id: {
              period,
              champ1Id: row.champ1Id,
              champ2Id: row.champ2Id,
            },
          },
          create: {
            period,
            champ1Id: row.champ1Id,
            champ2Id: row.champ2Id,
            games,
            wins,
            winRate,
            wilsonLower: wl,
          },
          update: {
            games,
            wins,
            winRate,
            wilsonLower: wl,
            computedAt: new Date(),
          },
        });

        totalUpserted++;
      }

      this.logger.log(
        `시너지 스냅샷 [${period}] 완료: ${rows.length}건 upsert`,
      );
    }

    return totalUpserted;
  }

  /**
   * 카운터 스냅샷 전체 재계산
   * 다른 teamId인 participant 크로스 조인 (같은 포지션 + 전체)
   */
  async computeCounterSnapshots(): Promise<number> {
    let totalUpserted = 0;

    for (const period of PERIODS) {
      const periodFilter = this.getPeriodFilter(period);

      // 전체 포지션 카운터 (position = null)
      const allRows = await this.prisma.$queryRaw<
        {
          champId: number;
          vsChampId: number;
          games: bigint;
          wins: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          a."championId" AS "champId",
          b."championId" AS "vsChampId",
          COUNT(*)::bigint AS games,
          SUM(CASE WHEN a."win" THEN 1 ELSE 0 END)::bigint AS wins
        FROM "match_participants" a
        INNER JOIN "match_participants" b
          ON a."matchId" = b."matchId"
          AND (
            (a."teamId" IS NOT NULL AND b."teamId" IS NOT NULL AND a."teamId" <> b."teamId")
            OR (a."teamId" IS NULL AND b."teamId" IS NULL AND a."win" <> b."win")
          )
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
          AND m."roomId" IS NOT NULL
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        GROUP BY a."championId", b."championId"
        HAVING COUNT(*) >= ${MIN_GAMES_COUNTER}
      `);

      for (const row of allRows) {
        const games = Number(row.games);
        const wins = Number(row.wins);
        const winRate = games > 0 ? wins / games : 0;
        const wl = wilsonLower(wins, games);

        await this.prisma.labCounterSnapshot.upsert({
          where: {
            period_champId_vsChampId_position: {
              period,
              champId: row.champId,
              vsChampId: row.vsChampId,
              position: "",
            },
          },
          create: {
            period,
            champId: row.champId,
            vsChampId: row.vsChampId,
            position: null,
            games,
            wins,
            winRate,
            wilsonLower: wl,
          },
          update: {
            games,
            wins,
            winRate,
            wilsonLower: wl,
            computedAt: new Date(),
          },
        });

        totalUpserted++;
      }

      // 같은 포지션 맞라인 카운터
      const laneRows = await this.prisma.$queryRaw<
        {
          champId: number;
          vsChampId: number;
          position: string;
          games: bigint;
          wins: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          a."championId" AS "champId",
          b."championId" AS "vsChampId",
          a."position" AS position,
          COUNT(*)::bigint AS games,
          SUM(CASE WHEN a."win" THEN 1 ELSE 0 END)::bigint AS wins
        FROM "match_participants" a
        INNER JOIN "match_participants" b
          ON a."matchId" = b."matchId"
          AND (
            (a."teamId" IS NOT NULL AND b."teamId" IS NOT NULL AND a."teamId" <> b."teamId")
            OR (a."teamId" IS NULL AND b."teamId" IS NULL AND a."win" <> b."win")
          )
          AND a."position" = b."position"
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
          AND m."roomId" IS NOT NULL
          AND a."position" IS NOT NULL
          AND a."position" <> ''
          AND a."position" <> 'UNKNOWN'
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        GROUP BY a."championId", b."championId", a."position"
        HAVING COUNT(*) >= ${MIN_GAMES_COUNTER}
      `);

      for (const row of laneRows) {
        const games = Number(row.games);
        const wins = Number(row.wins);
        const winRate = games > 0 ? wins / games : 0;
        const wl = wilsonLower(wins, games);

        await this.prisma.labCounterSnapshot.upsert({
          where: {
            period_champId_vsChampId_position: {
              period,
              champId: row.champId,
              vsChampId: row.vsChampId,
              position: row.position,
            },
          },
          create: {
            period,
            champId: row.champId,
            vsChampId: row.vsChampId,
            position: row.position,
            games,
            wins,
            winRate,
            wilsonLower: wl,
          },
          update: {
            games,
            wins,
            winRate,
            wilsonLower: wl,
            computedAt: new Date(),
          },
        });

        totalUpserted++;
      }

      this.logger.log(
        `카운터 스냅샷 [${period}] 완료: 전체 ${allRows.length}건 + 맞라인 ${laneRows.length}건`,
      );
    }

    return totalUpserted;
  }

  /**
   * 전체 스냅샷 재계산 (Task 8 cron에서 호출)
   * 순서: 챔피언 → 시너지 → 카운터 → Redis 캐시 무효화
   */
  async recomputeAllSnapshots(): Promise<{
    champions: number;
    synergies: number;
    counters: number;
  }> {
    this.logger.log("Lab 스냅샷 전체 재계산 시작");

    let champions = 0;
    let synergies = 0;
    let counters = 0;

    try {
      champions = await this.computeChampionSnapshots();
    } catch (error) {
      this.logger.error("챔피언 스냅샷 계산 실패", error);
    }

    try {
      synergies = await this.computeSynergySnapshots();
    } catch (error) {
      this.logger.error("시너지 스냅샷 계산 실패", error);
    }

    try {
      counters = await this.computeCounterSnapshots();
    } catch (error) {
      this.logger.error("카운터 스냅샷 계산 실패", error);
    }

    // Redis lab:* 캐시 일괄 무효화
    const deletedKeys = await this.invalidateLabCache();
    this.logger.log(
      `Lab 스냅샷 전체 재계산 완료: 챔피언 ${champions}, 시너지 ${synergies}, 카운터 ${counters}, Redis 키 ${deletedKeys}개 삭제`,
    );

    return { champions, synergies, counters };
  }

  // ─── Phase 2: 메타 레이더 API ───

  /**
   * Task 9: 메타 레이더 개요
   * - 트렌딩 챔피언 TOP 5
   * - 포지션별 챔피언 티어 분류 (S/A/B/C/D)
   * - 데이터 샘플 현황
   */
  async getMetaRadar(period: Period = "30d"): Promise<{
    trending: any[];
    tiers: Record<string, any[]>;
    sample: { totalGames: number; totalPlayers: number; period: string };
  }> {
    // Redis 캐시 확인
    const cacheKey = this.labCacheKey(`meta:radar:${period}`);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 트렌딩 챔피언 (최근 7일 vs 8~21일 전 픽률 변화)
    const trending = await this.computeTrending();

    // 포지션별 티어 분류
    const tiers = await this.computePositionTiers(period);

    // 데이터 샘플 현황
    const periodFilter = this.getPeriodFilter(period);
    const sampleResult = await this.prisma.$queryRaw<
      { totalGames: bigint; totalPlayers: bigint }[]
    >(Prisma.sql`
      SELECT
        COUNT(DISTINCT mp."matchId")::bigint AS "totalGames",
        COUNT(DISTINCT mp."userId")::bigint AS "totalPlayers"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE m."completedAt" IS NOT NULL
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
    `);

    const result = {
      trending,
      tiers,
      sample: {
        totalGames: Number(sampleResult[0]?.totalGames ?? 0),
        totalPlayers: Number(sampleResult[0]?.totalPlayers ?? 0),
        period,
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 3600);
    return result;
  }

  private async computeTrending(): Promise<any[]> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twentyOneDaysAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

    // 최근 7일 + 8~21일 전 기간의 전체 게임 수 확인
    const [recentTotal, prevTotal] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT mp."matchId")::bigint AS count
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" >= ${sevenDaysAgo}
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT mp."matchId")::bigint AS count
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" >= ${twentyOneDaysAgo}
          AND m."completedAt" < ${eightDaysAgo}
      `),
    ]);

    const recentTotalGames = Number(recentTotal[0]?.count ?? 0);
    const prevTotalGames = Number(prevTotal[0]?.count ?? 0);

    // 데이터 부족 시 빈 배열
    if (recentTotalGames + prevTotalGames < 20) {
      return [];
    }

    const rows = await this.prisma.$queryRaw<
      {
        championId: number;
        championName: string;
        recentPicks: bigint;
        prevPicks: bigint;
        recentWins: bigint;
        recentGames: bigint;
      }[]
    >(Prisma.sql`
      WITH recent AS (
        SELECT mp."championId", mp."championName",
               COUNT(*)::bigint AS picks,
               SUM(CASE WHEN mp."win" THEN 1 ELSE 0 END)::bigint AS wins
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" >= ${sevenDaysAgo}
        GROUP BY mp."championId", mp."championName"
      ),
      prev AS (
        SELECT mp."championId",
               COUNT(*)::bigint AS picks
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" >= ${twentyOneDaysAgo}
          AND m."completedAt" < ${eightDaysAgo}
        GROUP BY mp."championId"
      )
      SELECT
        r."championId",
        r."championName",
        r.picks AS "recentPicks",
        COALESCE(p.picks, 0) AS "prevPicks",
        r.wins AS "recentWins",
        r.picks AS "recentGames"
      FROM recent r
      LEFT JOIN prev p ON r."championId" = p."championId"
      WHERE r.picks >= 3
    `);

    const recentTotalPicks = recentTotalGames * 10;
    const prevTotalPicks = prevTotalGames * 10 || 1;

    return rows
      .map((row) => {
        const recentPickRate =
          Number(row.recentPicks) / (recentTotalPicks || 1);
        const prevPickRate = Number(row.prevPicks) / prevTotalPicks;
        const pickRateDelta = recentPickRate - prevPickRate;
        const recentGames = Number(row.recentGames);
        const recentWins = Number(row.recentWins);

        return {
          championId: row.championId,
          championName: row.championName,
          championNameKorean: getChampionKoreanName(row.championName),
          recentGames,
          recentWinRate:
            recentGames > 0
              ? Math.round((recentWins / recentGames) * 1000) / 10
              : 0,
          recentPickRate: Math.round(recentPickRate * 10000) / 100,
          prevPickRate: Math.round(prevPickRate * 10000) / 100,
          pickRateDelta: Math.round(pickRateDelta * 10000) / 100,
        };
      })
      .filter((row) => row.pickRateDelta > 0)
      .sort((a, b) => b.pickRateDelta - a.pickRateDelta)
      .slice(0, 5);
  }

  private async computePositionTiers(
    period: Period,
  ): Promise<Record<string, any[]>> {
    const positionList = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
    const result: Record<string, any[]> = {};

    for (const position of positionList) {
      // 최신 배치 patchVersion 조회 — 동일 챔피언이 여러 패치버전으로 중복 노출되는 것 방지
      const latestRow = await this.prisma.labChampionSnapshot.findFirst({
        where: { source: "custom", period, position },
        orderBy: { computedAt: "desc" },
        select: { patchVersion: true },
      });

      if (!latestRow) {
        result[position] = [];
        continue;
      }

      // 스냅샷 우선 조회 — 메타 레이더는 내전 기준이 기본 (Step 4에서 source 파라미터화 예정).
      const snapshots = await this.prisma.labChampionSnapshot.findMany({
        where: {
          source: "custom",
          period,
          position,
          patchVersion: latestRow.patchVersion,
          games: { gte: MIN_GAMES_CHAMPION },
        },
        orderBy: { wilsonLower: "desc" },
      });

      if (snapshots.length === 0) {
        result[position] = [];
        continue;
      }

      // 챔피언 이름 조회
      const championIds = snapshots.map((s) => s.championId);
      const nameRows = await this.prisma.$queryRaw<
        { championId: number; championName: string }[]
      >(Prisma.sql`
        SELECT mp."championId", MIN(mp."championName") AS "championName"
        FROM "match_participants" mp
        WHERE mp."championId" IN (${Prisma.join(championIds)})
        GROUP BY mp."championId"
      `);
      const nameMap = new Map(nameRows.map((r) => [r.championId, r.championName]));

      // 정규화를 위한 min/max 계산
      const wilsonValues = snapshots.map((s) => s.wilsonLower);
      const pickValues = snapshots.map((s) => s.pickRate);
      const wMin = Math.min(...wilsonValues);
      const wMax = Math.max(...wilsonValues);
      const pMin = Math.min(...pickValues);
      const pMax = Math.max(...pickValues);
      const wRange = wMax - wMin || 1;
      const pRange = pMax - pMin || 1;

      // tier_score 계산
      const scored = snapshots.map((s) => {
        const wilsonNorm = (s.wilsonLower - wMin) / wRange;
        const pickNorm = (s.pickRate - pMin) / pRange;
        const tierScore = 0.6 * wilsonNorm + 0.4 * pickNorm;
        const championName = nameMap.get(s.championId) ?? String(s.championId);

        return {
          championId: s.championId,
          championName,
          championNameKorean: getChampionKoreanName(championName),
          games: s.games,
          wins: s.wins,
          winRate: s.games > 0 ? Math.round((s.wins / s.games) * 1000) / 10 : 0,
          pickRate: Math.round(s.pickRate * 10000) / 100,
          banRate: Math.round(s.banRate * 10000) / 100,
          wilsonLower: Math.round(s.wilsonLower * 10000) / 10000,
          tierScore: Math.round(tierScore * 10000) / 10000,
          confidenceLevel: getConfidenceLevel(s.games),
          tier: "", // 아래에서 할당
        };
      });

      // 상대 평가 기반 티어 분류
      scored.sort((a, b) => b.tierScore - a.tierScore);
      const total = scored.length;
      scored.forEach((s, i) => {
        const percentile = i / total;
        if (percentile < 0.1) s.tier = "S";
        else if (percentile < 0.3) s.tier = "A";
        else if (percentile < 0.6) s.tier = "B";
        else if (percentile < 0.85) s.tier = "C";
        else s.tier = "D";
      });

      result[position] = scored;
    }

    return result;
  }

  /**
   * Task 10: 패치 임팩트
   * patchVersion 기준 이전/이후 챔피언 승률 비교
   */
  async getPatchImpact(): Promise<{
    currentPatch: string | null;
    previousPatch: string | null;
    sample: {
      currentGames: number;
      previousGames: number;
      currentTeams: number;
      previousTeams: number;
    };
    buffed: any[];
    nerfed: any[];
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
      confidenceLevel: ConfidenceLevel;
    }>;
    compositionShifts: Array<{
      type: LabCompositionType;
      label: string;
      currentWinRate: number;
      prevWinRate: number;
      deltaWinRate: number;
      currentPickRate: number;
      prevPickRate: number;
      deltaPickRate: number;
      currentGames: number;
      prevGames: number;
      confidenceLevel: ConfidenceLevel;
    }>;
    insufficient: boolean;
  }> {
    const cacheKey = this.labCacheKey("meta:patch-impact");
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 최근 2개 패치 버전 조회
    const patches = await this.prisma.$queryRaw<{ patchVersion: string }[]>(
      Prisma.sql`
      WITH distinct_patches AS (
        SELECT
          "patchVersion",
          SPLIT_PART("patchVersion", '.', 1)::int AS "majorVersion",
          SPLIT_PART("patchVersion", '.', 2)::int AS "minorVersion"
        FROM "matches"
        WHERE "patchVersion" IS NOT NULL
          AND "completedAt" IS NOT NULL
        GROUP BY "patchVersion"
      )
      SELECT "patchVersion"
      FROM distinct_patches
      ORDER BY "majorVersion" DESC, "minorVersion" DESC
      LIMIT 2
    `,
    );

    if (patches.length < 2) {
      const result = {
        currentPatch: patches[0]?.patchVersion ?? null,
        previousPatch: null,
        sample: {
          currentGames: 0,
          previousGames: 0,
          currentTeams: 0,
          previousTeams: 0,
        },
        buffed: [],
        nerfed: [],
        positionShifts: [],
        compositionShifts: [],
        insufficient: true,
      };
      await this.redis.set(cacheKey, JSON.stringify(result), 3600);
      return result;
    }

    const currentPatch = patches[0].patchVersion;
    const previousPatch = patches[1].patchVersion;
    const championData = await this.dataDragon.getChampionData("ko_KR");
    const championNameKoById = new Map<number, string>();
    for (const champion of Object.values(championData.data)) {
      const championId = Number(champion.key);
      if (Number.isFinite(championId)) {
        championNameKoById.set(championId, champion.name);
      }
    }

    const rows = await this.prisma.$queryRaw<
      {
        championId: number;
        championName: string;
        currentWins: bigint;
        currentGames: bigint;
        prevWins: bigint;
        prevGames: bigint;
      }[]
    >(Prisma.sql`
      WITH current_patch AS (
        SELECT mp."championId", mp."championName",
               SUM(CASE WHEN mp."win" THEN 1 ELSE 0 END)::bigint AS wins,
               COUNT(*)::bigint AS games
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."patchVersion" = ${currentPatch}
        GROUP BY mp."championId", mp."championName"
        HAVING COUNT(*) >= ${PATCH_IMPACT_MIN_CHAMPION_GAMES}
      ),
      prev_patch AS (
        SELECT mp."championId",
               SUM(CASE WHEN mp."win" THEN 1 ELSE 0 END)::bigint AS wins,
               COUNT(*)::bigint AS games
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."patchVersion" = ${previousPatch}
        GROUP BY mp."championId"
        HAVING COUNT(*) >= ${PATCH_IMPACT_MIN_CHAMPION_GAMES}
      )
      SELECT
        c."championId",
        c."championName",
        c.wins AS "currentWins",
        c.games AS "currentGames",
        p.wins AS "prevWins",
        p.games AS "prevGames"
      FROM current_patch c
      INNER JOIN prev_patch p ON c."championId" = p."championId"
    `);

    const impacts = rows.map((row) => {
      const currentWinRate =
        Number(row.currentGames) > 0
          ? Number(row.currentWins) / Number(row.currentGames)
          : 0;
      const prevWinRate =
        Number(row.prevGames) > 0
          ? Number(row.prevWins) / Number(row.prevGames)
          : 0;
      const deltaWinRate = currentWinRate - prevWinRate;

      return {
        championId: row.championId,
        championName: row.championName,
        championNameKorean:
          championNameKoById.get(row.championId) ??
          getChampionKoreanName(row.championName),
        currentWinRate: Math.round(currentWinRate * 1000) / 10,
        prevWinRate: Math.round(prevWinRate * 1000) / 10,
        deltaWinRate: Math.round(deltaWinRate * 1000) / 10,
        currentGames: Number(row.currentGames),
        prevGames: Number(row.prevGames),
        confidenceLevel: getConfidenceLevel(
          Math.min(Number(row.currentGames), Number(row.prevGames)),
        ),
      };
    });

    impacts.sort((a, b) => b.deltaWinRate - a.deltaWinRate);

    const [patchCounts, positionRows, earlyAggroRows, teamRows] =
      await Promise.all([
        this.prisma.$queryRaw<
          { patchVersion: string; games: bigint; teams: bigint }[]
        >(Prisma.sql`
          SELECT
            m."patchVersion" AS "patchVersion",
            COUNT(DISTINCT m."id")::bigint AS "games",
            COUNT(DISTINCT CONCAT(m."id"::text, ':', COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))))::bigint AS "teams"
          FROM "matches" m
          INNER JOIN "match_participants" mp ON mp."matchId" = m."id"
          WHERE m."patchVersion" IN (${currentPatch}, ${previousPatch})
            AND m."completedAt" IS NOT NULL
          GROUP BY m."patchVersion"
        `),
        this.prisma.$queryRaw<
          {
            patchVersion: string;
            position: string;
            wins: bigint;
            games: bigint;
          }[]
        >(Prisma.sql`
          SELECT
            m."patchVersion" AS "patchVersion",
            mp."position" AS "position",
            COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins",
            COUNT(*)::bigint AS "games"
          FROM "match_participants" mp
          INNER JOIN "matches" m ON m."id" = mp."matchId"
          WHERE m."patchVersion" IN (${currentPatch}, ${previousPatch})
            AND m."completedAt" IS NOT NULL
            AND mp."position" IS NOT NULL
            AND mp."position" <> ''
            AND mp."position" <> 'UNKNOWN'
          GROUP BY m."patchVersion", mp."position"
        `),
        this.prisma.$queryRaw<
          { championId: number; games: bigint; wins: bigint }[]
        >(Prisma.sql`
          SELECT
            mp."championId" AS "championId",
            COUNT(*)::bigint AS "games",
            COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins"
          FROM "match_participants" mp
          INNER JOIN "matches" m ON m."id" = mp."matchId"
          WHERE m."patchVersion" IN (${currentPatch}, ${previousPatch})
            AND m."completedAt" IS NOT NULL
            AND m."gameDuration" IS NOT NULL
            AND m."gameDuration" < 1500
          GROUP BY mp."championId"
          HAVING COUNT(*) >= 5
        `),
        this.prisma.$queryRaw<
          {
            patchVersion: string;
            matchId: string;
            teamId: string;
            win: boolean;
            gameDurationSec: number | null;
            championIds: number[];
          }[]
        >(Prisma.sql`
          SELECT
            m."patchVersion" AS "patchVersion",
            mp."matchId" AS "matchId",
            COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text)) AS "teamId",
            BOOL_OR(mp."win") AS "win",
            MIN(m."gameDuration") AS "gameDurationSec",
            ARRAY_AGG(mp."championId")::int[] AS "championIds"
          FROM "match_participants" mp
          INNER JOIN "matches" m ON m."id" = mp."matchId"
          WHERE m."patchVersion" IN (${currentPatch}, ${previousPatch})
            AND m."completedAt" IS NOT NULL
          GROUP BY m."patchVersion", mp."matchId", COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
        `),
      ]);

    const patchCountMap = new Map(
      patchCounts.map((row) => [
        row.patchVersion,
        { games: Number(row.games), teams: Number(row.teams) },
      ]),
    );
    const currentGames = patchCountMap.get(currentPatch)?.games ?? 0;
    const previousGames = patchCountMap.get(previousPatch)?.games ?? 0;
    const currentTeams = patchCountMap.get(currentPatch)?.teams ?? 0;
    const previousTeams = patchCountMap.get(previousPatch)?.teams ?? 0;

    const positionMap = new Map<
      string,
      {
        currentGames: number;
        currentWins: number;
        prevGames: number;
        prevWins: number;
      }
    >();
    for (const row of positionRows) {
      const prev = positionMap.get(row.position) ?? {
        currentGames: 0,
        currentWins: 0,
        prevGames: 0,
        prevWins: 0,
      };
      if (row.patchVersion === currentPatch) {
        prev.currentGames = Number(row.games);
        prev.currentWins = Number(row.wins);
      } else if (row.patchVersion === previousPatch) {
        prev.prevGames = Number(row.games);
        prev.prevWins = Number(row.wins);
      }
      positionMap.set(row.position, prev);
    }
    const positionShifts = Array.from(positionMap.entries())
      .map(([position, agg]) => {
        const currentWinRate =
          agg.currentGames > 0 ? agg.currentWins / agg.currentGames : 0;
        const prevWinRate =
          agg.prevGames > 0 ? agg.prevWins / agg.prevGames : 0;
        const currentPickRate =
          currentGames > 0 ? agg.currentGames / (currentGames * 10) : 0;
        const prevPickRate =
          previousGames > 0 ? agg.prevGames / (previousGames * 10) : 0;
        return {
          position,
          currentWinRate: Math.round(currentWinRate * 1000) / 10,
          prevWinRate: Math.round(prevWinRate * 1000) / 10,
          deltaWinRate: Math.round((currentWinRate - prevWinRate) * 1000) / 10,
          currentPickRate: Math.round(currentPickRate * 10000) / 100,
          prevPickRate: Math.round(prevPickRate * 10000) / 100,
          deltaPickRate:
            Math.round((currentPickRate - prevPickRate) * 10000) / 100,
          currentGames: agg.currentGames,
          prevGames: agg.prevGames,
          confidenceLevel: getConfidenceLevel(
            Math.min(agg.currentGames, agg.prevGames),
          ),
        };
      })
      .filter((row) => row.currentGames >= 5 && row.prevGames >= 5)
      .filter(
        (row) =>
          Math.abs(row.deltaWinRate) >= PATCH_IMPACT_MIN_SHIFT_DELTA ||
          Math.abs(row.deltaPickRate) >= PATCH_IMPACT_MIN_SHIFT_DELTA,
      )
      .sort(
        (a, b) =>
          Math.abs(b.deltaWinRate) +
          Math.abs(b.deltaPickRate) * 0.3 -
          (Math.abs(a.deltaWinRate) + Math.abs(a.deltaPickRate) * 0.3),
      );

    const championTagsById = new Map<number, Set<string>>();
    for (const champion of Object.values(championData.data)) {
      const championId = Number(champion.key);
      if (!Number.isFinite(championId)) continue;
      const tags = Array.isArray((champion as { tags?: string[] }).tags)
        ? (champion as { tags?: string[] }).tags!
        : [];
      championTagsById.set(
        championId,
        new Set(tags.map((tag) => tag.toUpperCase())),
      );
    }
    const earlyAggroChampionSet = new Set<number>();
    for (const row of earlyAggroRows) {
      const games = Number(row.games);
      const wins = Number(row.wins);
      if (games <= 0) continue;
      if (wins / games >= 0.52) {
        earlyAggroChampionSet.add(row.championId);
      }
    }
    const classifyTeam = (
      championIds: number[],
      gameDurationSec: number | null,
    ): LabCompositionType => {
      let mage = 0;
      let tank = 0;
      let fighter = 0;
      let assassin = 0;
      let marksman = 0;
      let earlyAggroCount = 0;

      for (const championId of championIds) {
        const tags = championTagsById.get(championId) ?? new Set<string>();
        if (tags.has("MAGE")) mage += 1;
        if (tags.has("TANK")) tank += 1;
        if (tags.has("FIGHTER")) fighter += 1;
        if (tags.has("ASSASSIN")) assassin += 1;
        if (tags.has("MARKSMAN")) marksman += 1;
        if (earlyAggroChampionSet.has(championId)) earlyAggroCount += 1;
      }

      const longRange = mage + marksman;
      const evaluations: Array<{
        type: LabCompositionType;
        score: number;
        matched: boolean;
      }> = [
        {
          type: "TEAMFIGHT",
          score: (mage + tank) / 5,
          matched: mage + tank >= 3,
        },
        {
          type: "SPLIT_PUSH",
          score: (fighter + assassin) / 5,
          matched: fighter + assassin >= 2,
        },
        {
          type: "POKE",
          score: (longRange + Math.min(mage, 2)) / 7,
          matched: mage >= 2 && longRange >= 3,
        },
        {
          type: "EARLY_AGGRO",
          score: earlyAggroCount / 5,
          matched: earlyAggroCount >= 3 && (gameDurationSec ?? 99999) < 1500,
        },
        { type: "TANK_LINE", score: tank / 5, matched: tank >= 3 },
      ];
      const matched = evaluations.filter((e) => e.matched);
      const order: LabCompositionType[] = [
        "TEAMFIGHT",
        "SPLIT_PUSH",
        "POKE",
        "EARLY_AGGRO",
        "TANK_LINE",
      ];
      const target = (matched.length > 0 ? matched : evaluations).sort(
        (a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return order.indexOf(a.type) - order.indexOf(b.type);
        },
      );
      return target[0].type;
    };
    const compositionLabel: Record<LabCompositionType, string> = {
      TEAMFIGHT: "한타",
      SPLIT_PUSH: "스플릿",
      POKE: "포킹",
      EARLY_AGGRO: "속공",
      TANK_LINE: "탱커라인",
      SCALING_CARRY: "후반 캐리",
    };
    const compositionAgg = new Map<
      LabCompositionType,
      {
        currentGames: number;
        currentWins: number;
        prevGames: number;
        prevWins: number;
      }
    >();
    for (const type of [
      "TEAMFIGHT",
      "SPLIT_PUSH",
      "POKE",
      "EARLY_AGGRO",
      "TANK_LINE",
    ] as LabCompositionType[]) {
      compositionAgg.set(type, {
        currentGames: 0,
        currentWins: 0,
        prevGames: 0,
        prevWins: 0,
      });
    }
    for (const row of teamRows) {
      const type = classifyTeam(row.championIds, row.gameDurationSec);
      const current = compositionAgg.get(type)!;
      if (row.patchVersion === currentPatch) {
        current.currentGames += 1;
        if (row.win) current.currentWins += 1;
      } else if (row.patchVersion === previousPatch) {
        current.prevGames += 1;
        if (row.win) current.prevWins += 1;
      }
    }
    const compositionShifts = Array.from(compositionAgg.entries())
      .map(([type, agg]) => {
        const currentWinRate =
          agg.currentGames > 0 ? agg.currentWins / agg.currentGames : 0;
        const prevWinRate =
          agg.prevGames > 0 ? agg.prevWins / agg.prevGames : 0;
        const currentPickRate =
          currentTeams > 0 ? agg.currentGames / currentTeams : 0;
        const prevPickRate =
          previousTeams > 0 ? agg.prevGames / previousTeams : 0;
        return {
          type,
          label: compositionLabel[type],
          currentWinRate: Math.round(currentWinRate * 1000) / 10,
          prevWinRate: Math.round(prevWinRate * 1000) / 10,
          deltaWinRate: Math.round((currentWinRate - prevWinRate) * 1000) / 10,
          currentPickRate: Math.round(currentPickRate * 10000) / 100,
          prevPickRate: Math.round(prevPickRate * 10000) / 100,
          deltaPickRate:
            Math.round((currentPickRate - prevPickRate) * 10000) / 100,
          currentGames: agg.currentGames,
          prevGames: agg.prevGames,
          confidenceLevel: getConfidenceLevel(
            Math.min(agg.currentGames, agg.prevGames),
          ),
        };
      })
      .filter((row) => row.currentGames >= 5 && row.prevGames >= 5)
      .filter(
        (row) =>
          Math.abs(row.deltaWinRate) >= PATCH_IMPACT_MIN_SHIFT_DELTA ||
          Math.abs(row.deltaPickRate) >= PATCH_IMPACT_MIN_SHIFT_DELTA,
      )
      .sort(
        (a, b) =>
          Math.abs(b.deltaPickRate) +
          Math.abs(b.deltaWinRate) * 0.5 -
          (Math.abs(a.deltaPickRate) + Math.abs(a.deltaWinRate) * 0.5),
      );

    const result = {
      currentPatch,
      previousPatch,
      sample: {
        currentGames,
        previousGames,
        currentTeams,
        previousTeams,
      },
      buffed: impacts.slice(0, 5),
      nerfed: impacts.slice(-5).reverse(),
      positionShifts: positionShifts.slice(0, 5),
      compositionShifts: compositionShifts.slice(0, 5),
      insufficient:
        currentGames < PATCH_IMPACT_MIN_SAMPLE_GAMES ||
        previousGames < PATCH_IMPACT_MIN_SAMPLE_GAMES,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 3600);
    return result;
  }

  /**
   * Task 11: 밴률 통계
   * 챔피언별 밴률 + 밴 시 팀 승률 연관성
   */
  async getBanRates(period: Period = "30d"): Promise<{
    banStats: any[];
    totalMatches: number;
  }> {
    const cacheKey = this.labCacheKey(`meta:ban-rates:${period}`);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);

    // 전체 매치 수
    const totalMatchesResult = await this.prisma.$queryRaw<
      { count: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(DISTINCT mts."matchId")::bigint AS count
      FROM "match_team_stats" mts
      INNER JOIN "matches" m ON m."id" = mts."matchId"
      WHERE m."completedAt" IS NOT NULL
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
    `);
    const totalMatches = Number(totalMatchesResult[0]?.count ?? 0);

    if (totalMatches === 0) {
      const result = { banStats: [], totalMatches: 0 };
      await this.redis.set(cacheKey, JSON.stringify(result), 3600);
      return result;
    }

    // 챔피언별 밴 횟수 + 밴한 팀 승률
    const rows = await this.prisma.$queryRaw<
      {
        championId: number;
        banCount: bigint;
        banTeamWins: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        ban_id::int AS "championId",
        COUNT(*)::bigint AS "banCount",
        SUM(CASE WHEN mts."win" THEN 1 ELSE 0 END)::bigint AS "banTeamWins"
      FROM (
        SELECT mts."matchId", mts."teamId", mts."win",
               jsonb_array_elements(mts."bans")::int AS ban_id
        FROM "match_team_stats" mts
        INNER JOIN "matches" m ON m."id" = mts."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
      ) mts
      WHERE ban_id > 0
      GROUP BY ban_id
      ORDER BY COUNT(*) DESC
    `);

    const banStats = rows.map((row) => {
      const banCount = Number(row.banCount);
      const banTeamWins = Number(row.banTeamWins);
      return {
        championId: row.championId,
        banCount,
        banRate: Math.round((banCount / totalMatches) * 10000) / 100,
        banTeamWinRate:
          banCount > 0 ? Math.round((banTeamWins / banCount) * 1000) / 10 : 0,
        confidenceLevel: getConfidenceLevel(banCount),
      };
    });

    const result = { banStats, totalMatches };
    await this.redis.set(cacheKey, JSON.stringify(result), 3600);
    return result;
  }

  /**
   * Task 12: 챔피언 목록 통계 API
   * 스냅샷 우선 조회, 없으면 실시간 집계 fallback
   */
  async getChampions(
    period: Period = "30d",
    position?: string,
    includeLowSample = false,
    dataSource: LabStatsDataSource = "custom",
  ): Promise<{
    period: Period;
    position: string | null;
    includeLowSample: boolean;
    dataSource: LabStatsDataSource;
    source: "snapshot" | "realtime";
    champions: LabChampionListRow[];
  }> {
    const normalizedPosition = position?.trim() || null;
    const minGames = includeLowSample ? 1 : MIN_GAMES_CHAMPION;
    const cacheKey = this.labCacheKey(
      `champions:${dataSource}:${period}:${normalizedPosition ?? "all"}:${includeLowSample ? "all-samples" : "stable-only"}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    if (dataSource === "ranked-meta") {
      const rankedPeriod = period === "30d" ? "30d" : "current_patch";
      const ranked = await this.getRankedChampionSnapshots(
        rankedPeriod,
        normalizedPosition ?? undefined,
      );
      const minRankedGames = includeLowSample ? 1 : MIN_GAMES_CHAMPION;
      const champions = ranked.champions
        .filter((row) => row.games >= minRankedGames)
        .map((row) => {
          const championName = String(row.championId);
          return {
            championId: row.championId,
            championName,
            championNameKorean: getChampionKoreanName(championName),
            position: row.position,
            games: row.games,
            wins: row.wins,
            losses: row.games - row.wins,
            winRate: Math.round(row.winRate * 10000) / 10000,
            pickRate: Math.round(row.pickRate * 10000) / 100,
            banRate: 0,
            avgKda: row.avgKda,
            avgDamage: row.avgDamage,
            avgGold: 0,
            wilsonLower: Math.round(row.wilsonLower * 1000000) / 1000000,
            confidenceLevel: getConfidenceLevel(row.games),
          } satisfies LabChampionListRow;
        });
      const result = {
        period,
        position: normalizedPosition,
        includeLowSample,
        dataSource,
        source: "snapshot" as const,
        champions,
      };
      await this.redis.set(cacheKey, JSON.stringify(result), 1800);
      return result;
    }

    // 최신 배치 patchVersion 조회 — 동일 챔피언이 여러 패치버전으로 중복 노출되는 것 방지
    const latestSnapshotRow = includeLowSample
      ? null
      : await this.prisma.labChampionSnapshot.findFirst({
          where: { source: dataSource, period, position: normalizedPosition },
          orderBy: { computedAt: "desc" },
          select: { patchVersion: true },
        });

    const snapshotRows =
      includeLowSample || !latestSnapshotRow
        ? []
        : await this.prisma.labChampionSnapshot.findMany({
            where: {
              source: dataSource,
              period,
              position: normalizedPosition,
              patchVersion: latestSnapshotRow.patchVersion,
              games: { gte: MIN_GAMES_CHAMPION },
            },
            orderBy: { wilsonLower: "desc" },
          });

    const championIds = snapshotRows.map((row) => row.championId);
    const championNames = new Map<number, string>();
    if (championIds.length > 0) {
      const nameRows = await this.prisma.$queryRaw<
        { championId: number; championName: string }[]
      >(Prisma.sql`
        SELECT
          mp."championId" AS "championId",
          MIN(mp."championName") AS "championName"
        FROM "match_participants" mp
        WHERE mp."championId" IN (${Prisma.join(championIds)})
        GROUP BY mp."championId"
      `);
      for (const row of nameRows) {
        championNames.set(row.championId, row.championName);
      }
    }

    if (snapshotRows.length > 0) {
      const champions = snapshotRows.map((row) => {
        const championName =
          championNames.get(row.championId) ?? String(row.championId);
        const winRate = row.games > 0 ? row.wins / row.games : 0;
        return {
          championId: row.championId,
          championName,
          championNameKorean: getChampionKoreanName(championName),
          position: row.position,
          games: row.games,
          wins: row.wins,
          losses: row.games - row.wins,
          winRate: Math.round(winRate * 10000) / 10000,
          pickRate: Math.round(row.pickRate * 10000) / 100,
          banRate: Math.round(row.banRate * 10000) / 100,
          avgKda: row.avgKda,
          avgDamage: row.avgDamage,
          avgGold: row.avgGold,
          wilsonLower: Math.round(row.wilsonLower * 1000000) / 1000000,
          confidenceLevel: getConfidenceLevel(row.games),
        } satisfies LabChampionListRow;
      });

      const result = {
        period,
        position: normalizedPosition,
        includeLowSample,
        dataSource,
        source: "snapshot" as const,
        champions,
      };
      await this.redis.set(cacheKey, JSON.stringify(result), 1800);
      return result;
    }

    const periodFilter = this.getPeriodFilter(period);
    const sourceFilter = this.getMatchSourceFilter(dataSource);
    const [totalMatchesResult, banCountsResult, aggregateRows] =
      await Promise.all([
        this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
          SELECT COUNT(DISTINCT mp."matchId")::bigint AS count
          FROM "match_participants" mp
          INNER JOIN "matches" m ON m."id" = mp."matchId"
          WHERE m."completedAt" IS NOT NULL
            ${sourceFilter}
            ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        `),
        this.prisma.$queryRaw<{ championId: number; banCount: bigint }[]>(
          Prisma.sql`
            SELECT
              ban_id::int AS "championId",
              COUNT(*)::bigint AS "banCount"
            FROM (
              SELECT (jsonb_array_elements(mts."bans") ->> 'championId')::int AS ban_id
              FROM "match_team_stats" mts
              INNER JOIN "matches" m ON m."id" = mts."matchId"
              WHERE m."completedAt" IS NOT NULL
                ${sourceFilter}
                ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
            ) bans
            WHERE ban_id > 0
            GROUP BY ban_id
          `,
        ),
        aggregateCustomMatchStats(this.prisma, {
          period,
          position: normalizedPosition ?? undefined,
          groupBy: "champion",
          minGames,
          dateField: "completedAt",
          source: dataSource,
        }),
      ]);

    const totalMatches = Number(totalMatchesResult[0]?.count ?? 0);
    const banCounts = new Map(
      banCountsResult.map((row) => [row.championId, Number(row.banCount)]),
    );
    const champions = aggregateRows
      .map((row) => {
        const championName = row.championName ?? String(row.championId);
        const winRate = row.games > 0 ? row.wins / row.games : 0;
        const pickRate =
          totalMatches > 0
            ? normalizedPosition === null
              ? row.games / (totalMatches * 10)
              : row.games / totalMatches
            : 0;
        const banRate =
          totalMatches > 0
            ? (banCounts.get(row.championId) ?? 0) / totalMatches
            : 0;
        const wl = wilsonLower(row.wins, row.games);

        return {
          championId: row.championId,
          championName,
          championNameKorean: getChampionKoreanName(championName),
          position: normalizedPosition,
          games: row.games,
          wins: row.wins,
          losses: row.games - row.wins,
          winRate: Math.round(winRate * 10000) / 10000,
          pickRate: Math.round(pickRate * 10000) / 100,
          banRate: Math.round(banRate * 10000) / 100,
          avgKda: row.avgKda,
          avgDamage: row.avgDamage,
          avgGold: row.avgGold,
          wilsonLower: Math.round(wl * 1000000) / 1000000,
          confidenceLevel: getConfidenceLevel(row.games),
        } satisfies LabChampionListRow;
      })
      .sort((a, b) => b.wilsonLower - a.wilsonLower);

    const result = {
      period,
      position: normalizedPosition,
      includeLowSample,
      dataSource,
      source: "realtime" as const,
      champions,
    };
    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }

  // ─── Task 13: 챔피언 상세 (승률 추이 / 포지션 분포 / 아이템·룬 TOP) ───

  /**
   * 챔피언 상세 통계.
   * - 승률 추이: 주 단위(rolling 7일) 윈도우. 내전 특성상 일별은 빈 날이 많음.
   * - 포지션 분포: LabChampionSnapshot(period, championId, position≠null) 재활용.
   * - 아이템 TOP 5: 완성 아이템(Data Dragon `into`가 빈 아이템) 중 2-조합 빈도 + Wilson lower 정렬.
   * - 룬 TOP 3: `perks` JSON의 (primaryStyle, subStyle, keystonePerk) 3-tuple 집계.
   */
  async getChampionDetail(
    championId: number,
    period: Period = "30d",
    dataSource: LabStatsDataSource = "custom",
  ): Promise<LabChampionDetailResponse | null> {
    const cacheKey = this.labCacheKey(
      `champion:detail:${dataSource}:${championId}:${period}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    if (dataSource === "ranked-meta") {
      const rankedPeriod = period === "30d" ? "30d" : "current_patch";
      const ranked = await this.getRankedChampionSnapshots(rankedPeriod);
      const rows = ranked.champions.filter((row) => row.championId === championId);
      const totalRow = rows.find((row) => row.position === null) ?? rows[0];
      if (!totalRow) return null;
      const championName = String(championId);
      const positions = rows
        .filter((row) => row.position !== null)
        .map((row) => ({
          position: row.position as string,
          games: row.games,
          wins: row.wins,
          winRate: Math.round(row.winRate * 10000) / 10000,
          pickRateWithinChampion:
            totalRow.games > 0
              ? Math.round((row.games / totalRow.games) * 10000) / 10000
              : 0,
          wilsonLower: Math.round(row.wilsonLower * 1000000) / 1000000,
          confidenceLevel: getConfidenceLevel(row.games),
        }));
      const result: LabChampionDetailResponse = {
        championId,
        championName,
        championNameKorean: getChampionKoreanName(championName),
        dataSource,
        period,
        totals: {
          games: totalRow.games,
          wins: totalRow.wins,
          winRate: Math.round(totalRow.winRate * 10000) / 10000,
        },
        winrateTrend: [],
        trendInsufficient: true,
        patchTrend: [],
        patchItemTrend: [],
        positions,
        topBuilds: [],
        topItemCombos: [],
        topRuneCombos: [],
      };
      await this.redis.set(cacheKey, JSON.stringify(result), 1800);
      return result;
    }

    const periodFilter = this.getPeriodFilter(period);
    const sourceFilter = this.getMatchSourceFilter(dataSource);

    // 1) 총계 + 챔피언 이름 — 해당 기간 MatchParticipant 집계
    const totalsRows = await this.prisma.$queryRaw<
      {
        games: bigint;
        wins: bigint;
        championName: string | null;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins",
        MIN(mp."championName") AS "championName"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE mp."championId" = ${championId}
        AND m."completedAt" IS NOT NULL
        ${sourceFilter}
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
    `);

    const totalGames = Number(totalsRows[0]?.games ?? 0n);
    const totalWins = Number(totalsRows[0]?.wins ?? 0n);
    const championName = totalsRows[0]?.championName ?? String(championId);

    if (totalGames === 0) {
      // 해당 기간 데이터 없음 — null 반환 (컨트롤러에서 404로 변환)
      return null;
    }

    // 2) 주간 승률 추이 (DATE_TRUNC week, ISO 월요일 시작)
    const weeklyRows = await this.prisma.$queryRaw<
      { weekStart: Date; games: bigint; wins: bigint }[]
    >(Prisma.sql`
      SELECT
        DATE_TRUNC('week', m."completedAt") AS "weekStart",
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE mp."championId" = ${championId}
        AND m."completedAt" IS NOT NULL
        ${sourceFilter}
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
      GROUP BY DATE_TRUNC('week', m."completedAt")
      ORDER BY DATE_TRUNC('week', m."completedAt") ASC
    `);

    const trendInsufficient = weeklyRows.length < 3;
    const winrateTrend: LabChampionWinrateTrendPoint[] = trendInsufficient
      ? []
      : weeklyRows.map((row) => {
          const games = Number(row.games);
          const wins = Number(row.wins);
          return {
            weekStart: row.weekStart.toISOString(),
            games,
            wins,
            winRate: games > 0 ? Math.round((wins / games) * 10000) / 10000 : 0,
          };
        });

    // 2-b) 패치별 승률 추이
    const patchWinRows = await this.prisma.$queryRaw<
      { patch: string; games: bigint; wins: bigint }[]
    >(Prisma.sql`
      SELECT
        m."patchVersion" AS patch,
        COUNT(*)::bigint AS games,
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS wins
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE mp."championId" = ${championId}
        AND m."completedAt" IS NOT NULL
        AND m."patchVersion" IS NOT NULL
        ${sourceFilter}
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
      GROUP BY m."patchVersion"
      ORDER BY
        SPLIT_PART(m."patchVersion", '.', 1)::int ASC,
        SPLIT_PART(m."patchVersion", '.', 2)::int ASC
    `);

    const patchTrend: LabChampionPatchTrendPoint[] = patchWinRows.map(
      (row) => {
        const games = Number(row.games);
        const wins = Number(row.wins);
        return {
          patch: row.patch,
          games,
          wins,
          winRate:
            games > 0 ? Math.round((wins / games) * 10000) / 10000 : 0,
        };
      },
    );

    // 2-c) 패치별 아이템 TOP 5 — item0~6 LATERAL 언네스트 후 픽률 기준 집계
    const patchItemRawRows = await this.prisma.$queryRaw<
      { patch: string; itemId: number; picks: bigint; totalGames: bigint }[]
    >(Prisma.sql`
      WITH item_rows AS (
        SELECT
          m."patchVersion" AS patch,
          mp."matchId",
          unnested.item_id
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        CROSS JOIN LATERAL (
          VALUES
            (mp."item0"), (mp."item1"), (mp."item2"),
            (mp."item3"), (mp."item4"), (mp."item5"), (mp."item6")
        ) AS unnested(item_id)
        WHERE mp."championId" = ${championId}
          AND m."completedAt" IS NOT NULL
          AND m."patchVersion" IS NOT NULL
          AND unnested.item_id > 0
          ${sourceFilter}
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
      ),
      patch_games AS (
        SELECT patch, COUNT(DISTINCT "matchId")::bigint AS total_games
        FROM item_rows
        GROUP BY patch
      ),
      item_counts AS (
        SELECT ir.patch, ir.item_id, COUNT(*)::bigint AS picks
        FROM item_rows ir
        GROUP BY ir.patch, ir.item_id
      ),
      ranked AS (
        SELECT
          ic.patch,
          ic.item_id AS "itemId",
          ic.picks,
          pg.total_games AS "totalGames",
          ROW_NUMBER() OVER (
            PARTITION BY ic.patch ORDER BY ic.picks DESC
          ) AS rn
        FROM item_counts ic
        INNER JOIN patch_games pg ON pg.patch = ic.patch
        WHERE ic.picks >= 2
      )
      SELECT patch, "itemId", picks::bigint, "totalGames"::bigint
      FROM ranked
      WHERE rn <= 5
      ORDER BY
        SPLIT_PART(patch, '.', 1)::int ASC,
        SPLIT_PART(patch, '.', 2)::int ASC,
        picks DESC
    `);

    // 패치별로 그룹핑
    const patchItemMap = new Map<string, LabChampionPatchItemRow["topItems"]>();
    for (const row of patchItemRawRows) {
      if (!patchItemMap.has(row.patch)) patchItemMap.set(row.patch, []);
      const totalGames = Number(row.totalGames);
      const picks = Number(row.picks);
      patchItemMap.get(row.patch)!.push({
        itemId: Number(row.itemId),
        picks,
        pickRate:
          totalGames > 0
            ? Math.round((picks / totalGames) * 10000) / 100
            : 0,
      });
    }
    const patchItemTrend: LabChampionPatchItemRow[] = Array.from(
      patchItemMap.entries(),
    ).map(([patch, topItems]) => ({ patch, topItems }));

    // 3) 포지션 분포 — 스냅샷 우선, 미스 시 실시간 집계
    const positionSnapshots = await this.prisma.labChampionSnapshot.findMany({
      where: {
        source: dataSource,
        period,
        championId,
        position: { not: null },
      },
    });

    let positions: LabChampionPositionRow[];
    if (positionSnapshots.length > 0) {
      positions = positionSnapshots
        .map((row) => {
          const games = row.games;
          const wins = row.wins;
          const winRate = games > 0 ? wins / games : 0;
          return {
            position: row.position as string,
            games,
            wins,
            winRate: Math.round(winRate * 10000) / 10000,
            pickRateWithinChampion:
              totalGames > 0
                ? Math.round((games / totalGames) * 10000) / 10000
                : 0,
            wilsonLower: Math.round(row.wilsonLower * 1000000) / 1000000,
            confidenceLevel: getConfidenceLevel(games),
          } satisfies LabChampionPositionRow;
        })
        .sort((a, b) => b.games - a.games);
    } else {
      // 스냅샷 미생성 기간/챔피언 — 실시간 그룹핑
      const positionRows = await this.prisma.$queryRaw<
        { position: string; games: bigint; wins: bigint }[]
      >(Prisma.sql`
        SELECT
          mp."position" AS "position",
          COUNT(*)::bigint AS "games",
          COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins"
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE mp."championId" = ${championId}
          AND m."completedAt" IS NOT NULL
          ${sourceFilter}
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        GROUP BY mp."position"
      `);

      positions = positionRows
        .map((row) => {
          const games = Number(row.games);
          const wins = Number(row.wins);
          const winRate = games > 0 ? wins / games : 0;
          return {
            position: row.position,
            games,
            wins,
            winRate: Math.round(winRate * 10000) / 10000,
            pickRateWithinChampion:
              totalGames > 0
                ? Math.round((games / totalGames) * 10000) / 10000
                : 0,
            wilsonLower:
              Math.round(wilsonLower(wins, games, 1.96) * 1000000) / 1000000,
            confidenceLevel: getConfidenceLevel(games),
          } satisfies LabChampionPositionRow;
        })
        .sort((a, b) => b.games - a.games);
    }

    // 4) 아이템 TOP 5 / 룬 TOP 3 — MatchParticipant 로드 (완성 아이템 판별은 Data Dragon)
    const completedItemIds = await this.dataDragon
      .getCompletedItemIds()
      .catch((err) => {
        this.logger.warn(
          `Data Dragon completed items fetch failed, item combos skipped: ${err}`,
        );
        return new Set<number>();
      });

    const participants = await this.prisma.matchParticipant.findMany({
      where: {
        championId,
        match: {
          completedAt: periodFilter ? { gte: periodFilter } : { not: null },
          ...(dataSource === "custom"
            ? { roomId: { not: null } }
            : { roomId: null, riotMatchId: { not: null } }),
        },
      },
      select: {
        win: true,
        item0: true,
        item1: true,
        item2: true,
        item3: true,
        item4: true,
        item5: true,
        item6: true,
        summoner1Id: true,
        summoner2Id: true,
        perks: true,
        itemPurchaseOrder: true,
      },
    });

    const buildCounter = new Map<
      string,
      {
        coreItems: number[];
        boots: number | null;
        summonerSpellIds: [number, number];
        primaryStyle: number;
        subStyle: number;
        keystonePerk: number;
        games: number;
        wins: number;
      }
    >();

    // 아이템 2-조합 집계 — 완성 아이템만, 정규화된 (low, high) 튜플
    const itemComboCounter = new Map<
      string,
      { itemIds: [number, number]; games: number; wins: number }
    >();

    for (const p of participants) {
      const finalItemsOnParticipant = [
        p.item0,
        p.item1,
        p.item2,
        p.item3,
        p.item4,
        p.item5,
        p.item6,
      ]
        .filter((id) => id && completedItemIds.has(id))
        .filter((id, idx, arr) => arr.indexOf(id) === idx);
      const purchasedItemsOnParticipant = this.extractPurchasedCompletedItems(
        p.itemPurchaseOrder,
        completedItemIds,
      );
      const itemsOnParticipant =
        purchasedItemsOnParticipant.length >= 2
          ? purchasedItemsOnParticipant
          : finalItemsOnParticipant;
      const runeTriplet = this.extractRuneTriplet(p.perks);
      const boots = itemsOnParticipant.find((id) => BOOT_ITEM_IDS.has(id)) ?? null;
      const coreItems = itemsOnParticipant
        .filter((id) => !BOOT_ITEM_IDS.has(id))
        .slice(0, 3);

      if (coreItems.length >= 2 && runeTriplet) {
        const spells = [p.summoner1Id, p.summoner2Id].sort((a, b) => a - b) as [
          number,
          number,
        ];
        const key = [
          coreItems.join("-"),
          boots ?? "none",
          spells.join("-"),
          runeTriplet.primaryStyle,
          runeTriplet.subStyle,
          runeTriplet.keystonePerk,
        ].join("|");
        const existing = buildCounter.get(key);
        if (existing) {
          existing.games += 1;
          if (p.win) existing.wins += 1;
        } else {
          buildCounter.set(key, {
            coreItems,
            boots,
            summonerSpellIds: spells,
            primaryStyle: runeTriplet.primaryStyle,
            subStyle: runeTriplet.subStyle,
            keystonePerk: runeTriplet.keystonePerk,
            games: 1,
            wins: p.win ? 1 : 0,
          });
        }
      }

      if (itemsOnParticipant.length < 2) continue;

      // 2코어 조합 전체 pairs (nC2)
      for (let i = 0; i < itemsOnParticipant.length; i++) {
        for (let j = i + 1; j < itemsOnParticipant.length; j++) {
          const a = Math.min(itemsOnParticipant[i], itemsOnParticipant[j]);
          const b = Math.max(itemsOnParticipant[i], itemsOnParticipant[j]);
          const key = `${a}_${b}`;
          const existing = itemComboCounter.get(key);
          if (existing) {
            existing.games += 1;
            if (p.win) existing.wins += 1;
          } else {
            itemComboCounter.set(key, {
              itemIds: [a, b],
              games: 1,
              wins: p.win ? 1 : 0,
            });
          }
        }
      }
    }

    const topItemCombos: LabChampionItemComboRow[] = Array.from(
      itemComboCounter.values(),
    )
      .filter((entry) => entry.games >= 3) // 3게임 미만 조합은 노이즈
      .map((entry) => {
        const winRate = entry.games > 0 ? entry.wins / entry.games : 0;
        return {
          itemIds: entry.itemIds,
          games: entry.games,
          wins: entry.wins,
          winRate: Math.round(winRate * 10000) / 10000,
          wilsonLower:
            Math.round(wilsonLower(entry.wins, entry.games, 1.96) * 1000000) /
            1000000,
        };
      })
      .sort((a, b) => b.wilsonLower - a.wilsonLower)
      .slice(0, 5);

    // 코어 빌드: 승률 신뢰도(Wilson 60%) + 픽률(게임 수 40%) 종합 점수로 정렬
    const buildEntries = Array.from(buildCounter.values()).filter(
      (e) => e.games >= 3,
    );
    const buildMaxGames =
      buildEntries.length > 0
        ? Math.max(...buildEntries.map((e) => e.games))
        : 1;
    const topBuilds: LabChampionBuildRow[] = buildEntries
      .map((entry) => {
        const winRate = entry.games > 0 ? entry.wins / entry.games : 0;
        const wl = wilsonLower(entry.wins, entry.games, 1.96);
        const pickScore = entry.games / buildMaxGames;
        const combinedScore = 0.6 * wl + 0.4 * pickScore;
        return {
          coreItems: entry.coreItems,
          boots: entry.boots,
          summonerSpellIds: entry.summonerSpellIds,
          primaryStyle: entry.primaryStyle,
          subStyle: entry.subStyle,
          keystonePerk: entry.keystonePerk,
          games: entry.games,
          wins: entry.wins,
          winRate: Math.round(winRate * 10000) / 10000,
          wilsonLower: Math.round(wl * 1000000) / 1000000,
          combinedScore,
        };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, 5)
      .map(({ combinedScore: _, ...rest }) => rest);

    // 룬 3-tuple 집계
    const runeComboCounter = new Map<
      string,
      {
        primaryStyle: number;
        subStyle: number;
        keystonePerk: number;
        games: number;
        wins: number;
      }
    >();

    for (const p of participants) {
      const parsed = this.extractRuneTriplet(p.perks);
      if (!parsed) continue;
      const key = `${parsed.primaryStyle}_${parsed.subStyle}_${parsed.keystonePerk}`;
      const existing = runeComboCounter.get(key);
      if (existing) {
        existing.games += 1;
        if (p.win) existing.wins += 1;
      } else {
        runeComboCounter.set(key, {
          primaryStyle: parsed.primaryStyle,
          subStyle: parsed.subStyle,
          keystonePerk: parsed.keystonePerk,
          games: 1,
          wins: p.win ? 1 : 0,
        });
      }
    }

    const topRuneCombos: LabChampionRuneComboRow[] = Array.from(
      runeComboCounter.values(),
    )
      .filter((entry) => entry.games >= 3)
      .map((entry) => {
        const winRate = entry.games > 0 ? entry.wins / entry.games : 0;
        return {
          primaryStyle: entry.primaryStyle,
          subStyle: entry.subStyle,
          keystonePerk: entry.keystonePerk,
          games: entry.games,
          wins: entry.wins,
          winRate: Math.round(winRate * 10000) / 10000,
          wilsonLower:
            Math.round(wilsonLower(entry.wins, entry.games, 1.96) * 1000000) /
            1000000,
        };
      })
      .sort((a, b) => b.wilsonLower - a.wilsonLower)
      .slice(0, 3);

    const totalWinRate =
      totalGames > 0 ? Math.round((totalWins / totalGames) * 10000) / 10000 : 0;

    const result: LabChampionDetailResponse = {
      championId,
      championName,
      championNameKorean: getChampionKoreanName(championName),
      dataSource,
      period,
      totals: {
        games: totalGames,
        wins: totalWins,
        winRate: totalWinRate,
      },
      winrateTrend,
      trendInsufficient,
      patchTrend,
      patchItemTrend,
      positions,
      topBuilds,
      topItemCombos,
      topRuneCombos,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }

  // ─── Task 15: 시너지 조합 조회 API ───

  async getSynergy(
    period: Period = "30d",
    championId?: number,
    limit = 50,
    source: MatchStatsSource = "custom",
  ): Promise<LabSynergyResponse> {
    const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const normalizedSource: MatchStatsSource = [
      "custom",
      "ranked-community",
      "all",
    ].includes(source)
      ? source
      : "custom";
    const normalizedChampionId =
      typeof championId === "number" &&
      Number.isInteger(championId) &&
      championId > 0
        ? championId
        : null;
    const cacheKey = this.labCacheKey(
      `synergy:${period}:${normalizedSource}:${normalizedChampionId ?? "all"}:${normalizedLimit}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);
    const sourceFilter = this.getMatchSourceFilter(normalizedSource);

    // 챔피언 단일 승률 맵 (expected win rate 계산용)
    const championRates = await this.prisma.$queryRaw<
      {
        championId: number;
        position: string | null;
        games: bigint;
        wins: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        mp."championId" AS "championId",
        NULLIF(mp."position", '') AS "position",
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE m."completedAt" IS NOT NULL
        ${sourceFilter}
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        AND mp."position" IS NOT NULL
        AND mp."position" <> ''
        AND mp."position" <> 'UNKNOWN'
      GROUP BY mp."championId", NULLIF(mp."position", '')
    `);

    const championWinRateMap = new Map<string, number>();
    for (const row of championRates) {
      const games = Number(row.games);
      const wins = Number(row.wins);
      championWinRateMap.set(
        `${row.championId}:${row.position ?? "ALL"}`,
        games > 0 ? wins / games : 0,
      );
    }

    const rowsSource: "snapshot" | "realtime" = "realtime";
    const realtimeRows = await this.prisma.$queryRaw<
      {
        champ1Id: number;
        champ2Id: number;
        champ1Position: string | null;
        champ2Position: string | null;
        games: bigint;
        wins: bigint;
      }[]
    >(Prisma.sql`
        SELECT
          LEAST(a."championId", b."championId") AS "champ1Id",
          GREATEST(a."championId", b."championId") AS "champ2Id",
          CASE
            WHEN a."championId" <= b."championId" THEN NULLIF(a."position", '')
            ELSE NULLIF(b."position", '')
          END AS "champ1Position",
          CASE
            WHEN a."championId" <= b."championId" THEN NULLIF(b."position", '')
            ELSE NULLIF(a."position", '')
          END AS "champ2Position",
          COUNT(*)::bigint AS "games",
          COUNT(*) FILTER (WHERE a."win" = true)::bigint AS "wins"
        FROM "match_participants" a
        INNER JOIN "match_participants" b
          ON a."matchId" = b."matchId"
          AND (
            (a."teamId" IS NOT NULL AND b."teamId" IS NOT NULL AND a."teamId" = b."teamId")
            OR (a."teamId" IS NULL AND b."teamId" IS NULL AND a."win" = b."win")
          )
          AND a."id" < b."id"
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${sourceFilter}
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
          ${
            normalizedChampionId
              ? Prisma.sql`AND (a."championId" = ${normalizedChampionId} OR b."championId" = ${normalizedChampionId})`
              : Prisma.empty
          }
          AND a."position" IS NOT NULL
          AND b."position" IS NOT NULL
          AND a."position" <> ''
          AND b."position" <> ''
          AND a."position" <> 'UNKNOWN'
          AND b."position" <> 'UNKNOWN'
        GROUP BY 1, 2, 3, 4
        HAVING COUNT(*) >= ${MIN_GAMES_SYNERGY}
        ORDER BY COUNT(*) FILTER (WHERE a."win" = true)::float / NULLIF(COUNT(*), 0) DESC,
                 COUNT(*) DESC
        LIMIT ${normalizedLimit * 3}
      `);

    const rows = realtimeRows.map((row) => {
      const games = Number(row.games);
      const wins = Number(row.wins);
      return {
        champ1Id: row.champ1Id,
        champ2Id: row.champ2Id,
        champ1Position: row.champ1Position,
        champ2Position: row.champ2Position,
        games,
        wins,
        winRate: games > 0 ? wins / games : 0,
        wilsonLower: wilsonLower(wins, games),
      };
    });

    const championIds = Array.from(
      new Set(rows.flatMap((row) => [row.champ1Id, row.champ2Id])),
    );
    const championNameRows =
      championIds.length > 0
        ? await this.prisma.$queryRaw<
            { championId: number; championName: string }[]
          >(
            Prisma.sql`
              SELECT
                mp."championId" AS "championId",
                MIN(mp."championName") AS "championName"
              FROM "match_participants" mp
              WHERE mp."championId" IN (${Prisma.join(championIds)})
              GROUP BY mp."championId"
            `,
          )
        : [];
    const championNameMap = new Map(
      championNameRows.map((row) => [row.championId, row.championName]),
    );

    const enriched: LabSynergyRow[] = rows
      .map((row) => {
        const champ1Rate =
          championWinRateMap.get(
            `${row.champ1Id}:${row.champ1Position ?? "ALL"}`,
          ) ?? 0.5;
        const champ2Rate =
          championWinRateMap.get(
            `${row.champ2Id}:${row.champ2Position ?? "ALL"}`,
          ) ?? 0.5;
        const expectedWinRate = Math.max(
          0.05,
          Math.min((champ1Rate + champ2Rate) / 2, 0.95),
        );
        const deltaWinRate = row.winRate - expectedWinRate;
        const isSynergyEffective =
          row.games >= 5 && row.wilsonLower > expectedWinRate;
        const confidenceLevel = getConfidenceLevel(row.games);
        const champ1Name =
          championNameMap.get(row.champ1Id) ?? String(row.champ1Id);
        const champ2Name =
          championNameMap.get(row.champ2Id) ?? String(row.champ2Id);
        const badges: LabSynergyRow["badges"] = [];
        if (isSynergyEffective) badges.push("시너지 효과 있음");
        if (row.games >= 20) badges.push("표본 충분");
        else badges.push("주의 표본");

        return {
          champ1Id: row.champ1Id,
          champ2Id: row.champ2Id,
          champ1NameKorean: getChampionKoreanName(champ1Name),
          champ2NameKorean: getChampionKoreanName(champ2Name),
          positions: [row.champ1Position, row.champ2Position].filter(
            Boolean,
          ) as string[],
          games: row.games,
          wins: row.wins,
          winRate: Math.round(row.winRate * 10000) / 10000,
          wilsonLower: Math.round(row.wilsonLower * 1000000) / 1000000,
          expectedWinRate: Math.round(expectedWinRate * 10000) / 10000,
          deltaWinRate: Math.round(deltaWinRate * 10000) / 10000,
          confidenceLevel,
          badges,
        } satisfies LabSynergyRow;
      })
      .sort((a, b) => {
        const bScore = b.deltaWinRate * 0.7 + b.wilsonLower * 0.3;
        const aScore = a.deltaWinRate * 0.7 + a.wilsonLower * 0.3;
        return bScore - aScore;
      })
      .slice(0, normalizedLimit);

    const result: LabSynergyResponse = {
      period,
      championId: normalizedChampionId,
      dataSource: normalizedSource,
      source: rowsSource,
      summary: {
        totalPairs: rows.length,
        minGames: MIN_GAMES_SYNERGY,
      },
      rows: enriched,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }

  // ─── Task 16: 카운터 상성 조회 API ───

  async getCounter(
    period: Period = "30d",
    championId?: number,
    vsChampionId?: number,
    position?: string,
    limit = 50,
  ): Promise<LabCounterResponse> {
    const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const normalizedChampionId =
      typeof championId === "number" &&
      Number.isInteger(championId) &&
      championId > 0
        ? championId
        : null;
    const normalizedVsChampionId =
      typeof vsChampionId === "number" &&
      Number.isInteger(vsChampionId) &&
      vsChampionId > 0
        ? vsChampionId
        : null;
    const normalizedPosition =
      typeof position === "string" && position.trim().length > 0
        ? position.trim().toUpperCase()
        : null;

    const cacheKey = this.labCacheKey(
      `counter:${period}:${normalizedChampionId ?? "all"}:${normalizedVsChampionId ?? "all"}:${normalizedPosition ?? "all"}:${normalizedLimit}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);

    const snapshotWhere: Prisma.LabCounterSnapshotWhereInput = {
      period,
      ...(normalizedChampionId ? { champId: normalizedChampionId } : {}),
      ...(normalizedVsChampionId ? { vsChampId: normalizedVsChampionId } : {}),
      ...(normalizedPosition ? { position: normalizedPosition } : {}),
    };

    const snapshots = await this.prisma.labCounterSnapshot.findMany({
      where: snapshotWhere,
      orderBy: { wilsonLower: "desc" },
      take: normalizedLimit,
    });

    let source: "snapshot" | "realtime" = "snapshot";
    let rows = snapshots.map((row) => ({
      champId: row.champId,
      vsChampId: row.vsChampId,
      position: row.position,
      games: row.games,
      wins: row.wins,
      winRate: row.winRate,
      wilsonLower: row.wilsonLower,
    }));

    if (rows.length === 0) {
      source = "realtime";

      const realtimeRows = await this.prisma.$queryRaw<
        {
          champId: number;
          vsChampId: number;
          position: string | null;
          games: bigint;
          wins: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          a."championId" AS "champId",
          b."championId" AS "vsChampId",
          ${normalizedPosition ? Prisma.sql`a."position"` : Prisma.sql`NULL::text`} AS "position",
          COUNT(*)::bigint AS "games",
          COUNT(*) FILTER (WHERE a."win" = true)::bigint AS "wins"
        FROM "match_participants" a
        INNER JOIN "match_participants" b
          ON a."matchId" = b."matchId"
          AND (
            (a."teamId" IS NOT NULL AND b."teamId" IS NOT NULL AND a."teamId" <> b."teamId")
            OR (a."teamId" IS NULL AND b."teamId" IS NULL AND a."win" <> b."win")
          )
          ${normalizedPosition ? Prisma.sql`AND a."position" = b."position"` : Prisma.empty}
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
          ${normalizedChampionId ? Prisma.sql`AND a."championId" = ${normalizedChampionId}` : Prisma.empty}
          ${normalizedVsChampionId ? Prisma.sql`AND b."championId" = ${normalizedVsChampionId}` : Prisma.empty}
          ${normalizedPosition ? Prisma.sql`AND a."position" = ${normalizedPosition}` : Prisma.empty}
          ${normalizedPosition ? Prisma.sql`AND a."position" <> '' AND a."position" <> 'UNKNOWN'` : Prisma.empty}
        GROUP BY a."championId", b."championId", ${normalizedPosition ? Prisma.sql`a."position"` : Prisma.sql`NULL::text`}
        HAVING COUNT(*) >= ${MIN_GAMES_COUNTER}
        ORDER BY COUNT(*) DESC
        LIMIT ${normalizedLimit}
      `);

      rows = realtimeRows.map((row) => {
        const games = Number(row.games);
        const wins = Number(row.wins);
        const winRate = games > 0 ? wins / games : 0;
        return {
          champId: row.champId,
          vsChampId: row.vsChampId,
          position: row.position,
          games,
          wins,
          winRate,
          wilsonLower: wilsonLower(wins, games),
        };
      });
    }

    const championIds = Array.from(
      new Set(rows.flatMap((row) => [row.champId, row.vsChampId])),
    );
    const championNameRows =
      championIds.length > 0
        ? await this.prisma.$queryRaw<
            { championId: number; championName: string }[]
          >(
            Prisma.sql`
              SELECT
                mp."championId" AS "championId",
                MIN(mp."championName") AS "championName"
              FROM "match_participants" mp
              WHERE mp."championId" IN (${Prisma.join(championIds)})
              GROUP BY mp."championId"
            `,
          )
        : [];
    const championNameMap = new Map(
      championNameRows.map((row) => [row.championId, row.championName]),
    );

    const enriched: LabCounterRow[] = rows
      .map((row) => {
        const lower = wilsonLower(row.wins, row.games);
        const upper = wilsonUpper(row.wins, row.games);
        const verdict: LabCounterVerdict =
          lower > 0.55 ? "favorable" : upper < 0.45 ? "unfavorable" : "even";
        const champName =
          championNameMap.get(row.champId) ?? String(row.champId);
        const vsChampName =
          championNameMap.get(row.vsChampId) ?? String(row.vsChampId);

        return {
          champId: row.champId,
          vsChampId: row.vsChampId,
          champNameKorean: getChampionKoreanName(champName),
          vsChampNameKorean: getChampionKoreanName(vsChampName),
          position: row.position,
          games: row.games,
          wins: row.wins,
          winRate: Math.round(row.winRate * 10000) / 10000,
          wilsonLower: Math.round(lower * 1000000) / 1000000,
          wilsonUpper: Math.round(upper * 1000000) / 1000000,
          confidenceLevel: getConfidenceLevel(row.games),
          verdict,
        } satisfies LabCounterRow;
      })
      .sort((a, b) => b.wilsonLower - a.wilsonLower)
      .slice(0, normalizedLimit);

    const result: LabCounterResponse = {
      period,
      championId: normalizedChampionId,
      vsChampionId: normalizedVsChampionId,
      position: normalizedPosition,
      source,
      rows: enriched,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }

  // ─── Task 17: 팀 조합 유형 분석 API ───

  async getCompositions(
    period: Period = "30d",
    source: MatchStatsSource = "custom",
  ): Promise<LabCompositionsResponse> {
    const normalizedSource: MatchStatsSource = [
      "custom",
      "ranked-community",
      "all",
    ].includes(source)
      ? source
      : "custom";
    const cacheKey = this.labCacheKey(
      `compositions:${period}:${normalizedSource}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);
    const sourceFilter = this.getMatchSourceFilter(normalizedSource);

    const [championData, earlyAggroRows, teamRows] = await Promise.all([
      this.dataDragon.getChampionData("ko_KR"),
      this.prisma.$queryRaw<
        { championId: number; games: bigint; wins: bigint }[]
      >(Prisma.sql`
        SELECT
          mp."championId" AS "championId",
          COUNT(*)::bigint AS "games",
          COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins"
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${sourceFilter}
          AND m."gameDuration" IS NOT NULL
          AND m."gameDuration" < 1500
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        GROUP BY mp."championId"
        HAVING COUNT(*) >= 5
      `),
      this.prisma.$queryRaw<
        {
          matchId: string;
          teamId: string;
          win: boolean;
          gameDurationSec: number | null;
          championIds: number[];
        }[]
      >(Prisma.sql`
        SELECT
          mp."matchId" AS "matchId",
          COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text)) AS "teamId",
          BOOL_OR(mp."win") AS "win",
          MIN(m."gameDuration") AS "gameDurationSec",
          ARRAY_AGG(mp."championId")::int[] AS "championIds"
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${sourceFilter}
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        GROUP BY mp."matchId", COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
      `),
    ]);

    const championTagsById = new Map<number, Set<string>>();
    const championNameById = new Map<number, string>();
    for (const champion of Object.values(championData.data)) {
      const championId = Number(champion.key);
      if (!Number.isFinite(championId)) continue;
      championNameById.set(championId, champion.name);
      const tags = Array.isArray((champion as { tags?: string[] }).tags)
        ? (champion as { tags?: string[] }).tags!
        : [];
      championTagsById.set(
        championId,
        new Set(tags.map((tag) => tag.toUpperCase())),
      );
    }

    const earlyAggroChampionSet = new Set<number>();
    for (const row of earlyAggroRows) {
      const games = Number(row.games);
      const wins = Number(row.wins);
      const winRate = games > 0 ? wins / games : 0;
      if (winRate >= 0.52) {
        earlyAggroChampionSet.add(row.championId);
      }
    }

    type TeamCompositionEval = {
      type: LabCompositionType;
      score: number;
      matched: boolean;
      reasons: string[];
    };

    const classifyTeam = (
      championIds: number[],
      gameDurationSec: number | null,
    ): {
      type: LabCompositionType;
      score: number;
      reasons: string[];
      championIds: number[];
    } => {
      let mage = 0;
      let tank = 0;
      let fighter = 0;
      let assassin = 0;
      let marksman = 0;
      let earlyAggroCount = 0;
      const typeChampionIds = new Map<LabCompositionType, Set<number>>([
        ["TEAMFIGHT", new Set()],
        ["SPLIT_PUSH", new Set()],
        ["POKE", new Set()],
        ["EARLY_AGGRO", new Set()],
        ["TANK_LINE", new Set()],
        ["SCALING_CARRY", new Set()],
      ]);

      for (const championId of championIds) {
        const tags = championTagsById.get(championId) ?? new Set<string>();
        if (tags.has("MAGE")) {
          mage += 1;
          typeChampionIds.get("TEAMFIGHT")!.add(championId);
          typeChampionIds.get("POKE")!.add(championId);
          typeChampionIds.get("SCALING_CARRY")!.add(championId);
        }
        if (tags.has("TANK")) {
          tank += 1;
          typeChampionIds.get("TEAMFIGHT")!.add(championId);
          typeChampionIds.get("TANK_LINE")!.add(championId);
        }
        if (tags.has("FIGHTER")) {
          fighter += 1;
          typeChampionIds.get("SPLIT_PUSH")!.add(championId);
        }
        if (tags.has("ASSASSIN")) {
          assassin += 1;
          typeChampionIds.get("SPLIT_PUSH")!.add(championId);
          typeChampionIds.get("EARLY_AGGRO")!.add(championId);
        }
        if (tags.has("MARKSMAN")) {
          marksman += 1;
          typeChampionIds.get("POKE")!.add(championId);
          typeChampionIds.get("SCALING_CARRY")!.add(championId);
        }
        if (earlyAggroChampionSet.has(championId)) {
          earlyAggroCount += 1;
          typeChampionIds.get("EARLY_AGGRO")!.add(championId);
        }
      }

      const longRange = mage + marksman;
      const shortGame = (gameDurationSec ?? 99999) < 1500;
      const evaluations: TeamCompositionEval[] = [
        {
          type: "TEAMFIGHT",
          score: Math.min((mage + tank) / 4, 1),
          matched: mage + tank >= 3,
          reasons: [`광역/전면전 태그 ${mage + tank}명`, `탱커 ${tank}명`],
        },
        {
          type: "SPLIT_PUSH",
          score: Math.min((fighter + assassin) / 3, 1),
          matched: fighter + assassin >= 2,
          reasons: [`사이드 운영 태그 ${fighter + assassin}명`],
        },
        {
          type: "POKE",
          score: Math.min((longRange + Math.min(mage, 2)) / 5, 1),
          matched: mage >= 2 && longRange >= 3,
          reasons: [`원거리/마법 피해 축 ${longRange}명`, `마법사 ${mage}명`],
        },
        {
          type: "EARLY_AGGRO",
          score: Math.min(earlyAggroCount / 3, 1) * (shortGame ? 1 : 0.75),
          matched: earlyAggroCount >= 3 || (earlyAggroCount >= 2 && shortGame),
          reasons: [
            `초반 승리 경향 챔피언 ${earlyAggroCount}명`,
            shortGame ? "짧은 경기 표본" : "일반 경기 길이",
          ],
        },
        {
          type: "TANK_LINE",
          score: Math.min(tank / 3, 1),
          matched: tank >= 3,
          reasons: [`탱커 태그 ${tank}명`],
        },
        {
          type: "SCALING_CARRY",
          score: Math.min((marksman + Math.max(mage - 1, 0)) / 3, 1),
          matched: marksman >= 1 && mage >= 1 && !shortGame,
          reasons: [`후반 딜러 축 ${marksman + mage}명`, "중후반 지향"],
        },
      ];

      const matched = evaluations.filter((e) => e.matched);
      const target = (matched.length > 0 ? matched : evaluations).sort(
        (a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const order: LabCompositionType[] = [
            "TEAMFIGHT",
            "SPLIT_PUSH",
            "POKE",
            "EARLY_AGGRO",
            "TANK_LINE",
          ];
          return order.indexOf(a.type) - order.indexOf(b.type);
        },
      );
      return {
        type: target[0].type,
        score: target[0].score,
        reasons: target[0].reasons,
        championIds: Array.from(typeChampionIds.get(target[0].type) ?? []),
      };
    };

    const aggregate = new Map<
      LabCompositionType,
      {
        games: number;
        wins: number;
        scoreSum: number;
        reasons: Map<string, number>;
        championCounts: Map<number, number>;
        durationSum: number;
        durationCount: number;
      }
    >();
    const allTypes: LabCompositionType[] = [
      "TEAMFIGHT",
      "SPLIT_PUSH",
      "POKE",
      "EARLY_AGGRO",
      "TANK_LINE",
      "SCALING_CARRY",
    ];
    for (const type of allTypes) {
      aggregate.set(type, {
        games: 0,
        wins: 0,
        scoreSum: 0,
        reasons: new Map(),
        championCounts: new Map(),
        durationSum: 0,
        durationCount: 0,
      });
    }

    for (const team of teamRows) {
      const classified = classifyTeam(team.championIds, team.gameDurationSec);
      const bucket = aggregate.get(classified.type)!;
      bucket.games += 1;
      if (team.win) bucket.wins += 1;
      bucket.scoreSum += classified.score;
      for (const reason of classified.reasons) {
        bucket.reasons.set(reason, (bucket.reasons.get(reason) ?? 0) + 1);
      }
      for (const championId of classified.championIds) {
        bucket.championCounts.set(
          championId,
          (bucket.championCounts.get(championId) ?? 0) + 1,
        );
      }
      if (
        typeof team.gameDurationSec === "number" &&
        team.gameDurationSec > 0
      ) {
        bucket.durationSum += team.gameDurationSec;
        bucket.durationCount += 1;
      }
    }

    const labels: Record<LabCompositionType, string> = {
      TEAMFIGHT: "한타",
      SPLIT_PUSH: "스플릿",
      POKE: "포킹",
      EARLY_AGGRO: "속공",
      TANK_LINE: "탱커라인",
      SCALING_CARRY: "후반 캐리",
    };
    const descriptions: Record<LabCompositionType, string> = {
      TEAMFIGHT: "광역 피해와 전면 교전에 강한 구성",
      SPLIT_PUSH: "사이드 압박과 1:1/소규모 교전에 강한 구성",
      POKE: "원거리 견제와 사전 체력 압박에 강한 구성",
      EARLY_AGGRO: "초반 교전과 빠른 스노우볼에 강한 구성",
      TANK_LINE: "앞라인 유지력과 진입 흡수에 강한 구성",
      SCALING_CARRY: "중후반 딜러 보호와 성장 기대값이 높은 구성",
    };

    const totalTeams = teamRows.length;
    const rows: LabCompositionRow[] = allTypes
      .map((type) => {
        const bucket = aggregate.get(type)!;
        const winRate = bucket.games > 0 ? bucket.wins / bucket.games : 0;
        const pickRate = totalTeams > 0 ? bucket.games / totalTeams : 0;
        const avgScore =
          bucket.games > 0 ? bucket.scoreSum / bucket.games : 0;
        const avgGameDurationSec =
          bucket.durationCount > 0
            ? Math.round(bucket.durationSum / bucket.durationCount)
            : 0;
        const exampleChampions = Array.from(bucket.championCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([championId, games]) => ({
            championId,
            championNameKorean: getChampionKoreanName(String(championId)),
            games,
          }));
        const reasons = Array.from(bucket.reasons.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([reason]) => reason);
        return {
          type,
          label: labels[type],
          description: descriptions[type],
          games: bucket.games,
          wins: bucket.wins,
          winRate: Math.round(winRate * 10000) / 10000,
          wilsonLower: Math.round(wilsonLower(bucket.wins, bucket.games) * 1000000) / 1000000,
          pickRate: Math.round(pickRate * 10000) / 10000,
          avgScore: Math.round(avgScore * 10000) / 10000,
          avgGameDurationSec,
          exampleChampions,
          reasons,
          confidenceLevel: getConfidenceLevel(bucket.games),
        } satisfies LabCompositionRow;
      })
      .sort((a, b) => {
        return b.wilsonLower - a.wilsonLower;
      });

    const result: LabCompositionsResponse = {
      period,
      dataSource: normalizedSource,
      source: "realtime",
      totalTeams,
      topTypes: rows.slice(0, 3),
      rows,
      caveat:
        "챔피언 태그와 경기 길이 기반 분류입니다. 실제 콜, 라인전 구도, 숙련도는 별도 해석이 필요합니다.",
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }

  // ─── Task 18: 오라클 경매 효율 API ───

  async getAuctionEfficiency(
    period: Period = "30d",
  ): Promise<LabAuctionEfficiencyResponse> {
    const cacheKey = this.labCacheKey(`oracle:auction-efficiency:${period}`);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);
    const TREND_WINDOW = 5;
    const TREND_MIN_SEGMENT = 3;
    const MONEYBALL_PRIOR_GAMES = 8;
    const gameRows = await this.prisma.$queryRaw<
      {
        userId: string;
        username: string;
        matchId: string;
        completedAt: Date;
        soldPrice: number;
        win: boolean;
        kills: number;
        deaths: number;
        assists: number;
        damageShare: number;
        position: string | null;
      }[]
    >(Prisma.sql`
      WITH team_totals AS (
        SELECT
          mp."matchId",
          COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text)) AS "teamKey",
          SUM(mp."totalDamageDealtToChampions")::float AS "teamDamage"
        FROM "match_participants" mp
        GROUP BY mp."matchId", COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
      ),
      auction_entries AS (
        SELECT DISTINCT
          t."roomId" AS "roomId",
          tm."userId" AS "userId",
          tm."soldPrice"::float AS "soldPrice"
        FROM "team_members" tm
        INNER JOIN "teams" t ON t."id" = tm."teamId"
        INNER JOIN "rooms" r ON r."id" = t."roomId"
        WHERE r."teamMode" = 'AUCTION'
          AND tm."soldPrice" IS NOT NULL
      )
      SELECT
        mp."userId" AS "userId",
        u."username" AS "username",
        mp."matchId" AS "matchId",
        m."completedAt" AS "completedAt",
        ae."soldPrice"::float AS "soldPrice",
        mp."win" AS "win",
        mp."kills" AS "kills",
        mp."deaths" AS "deaths",
        mp."assists" AS "assists",
        ROUND((
          CASE WHEN tt."teamDamage" > 0
            THEN mp."totalDamageDealtToChampions"::float / tt."teamDamage"
            ELSE 0
          END
        )::numeric, 6)::float AS "damageShare",
        CASE
          WHEN mp."position" IS NULL OR mp."position" = '' OR mp."position" = 'UNKNOWN' THEN NULL
          ELSE mp."position"
        END AS "position"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      INNER JOIN "users" u ON u."id" = mp."userId"
      INNER JOIN team_totals tt
        ON tt."matchId" = mp."matchId"
       AND tt."teamKey" = COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
      INNER JOIN auction_entries ae
        ON ae."roomId" = m."roomId"
       AND ae."userId" = mp."userId"
      WHERE m."completedAt" IS NOT NULL
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
      ORDER BY m."completedAt" DESC, mp."matchId" DESC
    `);

    type UserAccumulator = {
      userId: string;
      username: string;
      soldPriceSum: number;
      games: number;
      wins: number;
      kdaSum: number;
      damageShareSum: number;
      perGame: Array<{
        completedAt: Date;
        soldPrice: number;
        kda: number;
        deaths: number;
        damageShare: number;
        win: boolean;
        position: string | null;
      }>;
    };

    const byUser = new Map<string, UserAccumulator>();
    for (const row of gameRows) {
      const current = byUser.get(row.userId) ?? {
        userId: row.userId,
        username: row.username,
        soldPriceSum: 0,
        games: 0,
        wins: 0,
        kdaSum: 0,
        damageShareSum: 0,
        perGame: [],
      };
      const kda = (row.kills + row.assists) / Math.max(row.deaths, 1);
      current.soldPriceSum += row.soldPrice;
      current.games += 1;
      current.wins += row.win ? 1 : 0;
      current.kdaSum += kda;
      current.damageShareSum += row.damageShare;
      current.perGame.push({
        completedAt: row.completedAt,
        soldPrice: row.soldPrice,
        kda,
        deaths: row.deaths,
        damageShare: row.damageShare,
        win: row.win,
        position: row.position,
      });
      byUser.set(row.userId, current);
    }

    const normalized = Array.from(byUser.values())
      .filter((row) => row.games >= 3)
      .map((row) => {
        const games = row.games;
        const wins = row.wins;
        const winRate = games > 0 ? wins / games : 0;
        return {
          userId: row.userId,
          username: row.username,
          soldPrice: row.soldPriceSum / Math.max(row.games, 1),
          games,
          wins,
          winRate,
          avgKda: row.kdaSum / Math.max(row.games, 1),
          avgDamageShare: row.damageShareSum / Math.max(row.games, 1),
          perGame: row.perGame,
        };
      });

    const percentile01 = (values: number[], value: number): number => {
      if (values.length <= 1) return 1;
      const sorted = [...values].sort((a, b) => a - b);
      const idx = sorted.findIndex((v) => v >= value);
      const rank = idx === -1 ? sorted.length - 1 : idx;
      return rank / (sorted.length - 1);
    };

    const kdaValues = normalized.map((r) => r.avgKda);
    const damageValues = normalized.map((r) => r.avgDamageShare);
    const winValues = normalized.map((r) => r.winRate);

    const scored = normalized.map((row) => {
      const kdaNorm = percentile01(kdaValues, row.avgKda);
      const damageNorm = percentile01(damageValues, row.avgDamageShare);
      const winNorm = percentile01(winValues, row.winRate);
      const performance = kdaNorm * 0.4 + damageNorm * 0.3 + winNorm * 0.3;
      return {
        ...row,
        performance,
      };
    });

    const priced = scored.filter((r) => r.soldPrice > 0);
    const unsold = scored.filter((r) => r.soldPrice <= 0);

    let beta0 = 0;
    let beta1 = 0;
    if (priced.length >= 2) {
      const xMean =
        priced.reduce((sum, r) => sum + r.soldPrice, 0) / priced.length;
      const yMean =
        priced.reduce((sum, r) => sum + r.performance, 0) / priced.length;
      let cov = 0;
      let varX = 0;
      for (const row of priced) {
        cov += (row.soldPrice - xMean) * (row.performance - yMean);
        varX += (row.soldPrice - xMean) ** 2;
      }
      beta1 = varX > 0 ? cov / varX : 0;
      beta0 = yMean - beta1 * xMean;
    }

    const withResidual = priced.map((row) => {
      const expectedPerformance = beta0 + beta1 * row.soldPrice;
      const efficiency = row.performance - expectedPerformance;
      return {
        ...row,
        expectedPerformance,
        efficiency,
      };
    });

    const residualStdDev =
      withResidual.length > 1
        ? Math.sqrt(
            withResidual.reduce((sum, row) => sum + row.efficiency ** 2, 0) /
              (withResidual.length - 1),
          )
        : 0;
    const residualSafe = Math.max(residualStdDev, 0.000001);
    const baselineMoneyball = 100;
    const defaultMoneyballScale = 15;
    const defaultPriorGames = MONEYBALL_PRIOR_GAMES;
    const TARGET_Z_IQR = 1.349;

    const getQuarterKey = (date: Date): string => {
      const month = date.getUTCMonth();
      const quarter = Math.floor(month / 3) + 1;
      return `${date.getUTCFullYear()}-Q${quarter}`;
    };
    const quantile = (values: number[], q: number): number | null => {
      if (values.length === 0) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const pos = (sorted.length - 1) * q;
      const lower = Math.floor(pos);
      const upper = Math.ceil(pos);
      if (lower === upper) return sorted[lower];
      const weight = pos - lower;
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };
    const computeIqr = (values: number[]): number | null => {
      const q1 = quantile(values, 0.25);
      const q3 = quantile(values, 0.75);
      if (q1 === null || q3 === null) return null;
      return q3 - q1;
    };
    const clamp = (value: number, min: number, max: number): number =>
      Math.min(max, Math.max(min, value));

    const latestCompletedAt = gameRows[0]?.completedAt ?? new Date();
    const currentQuarterKey = getQuarterKey(latestCompletedAt);
    const quarterGamesByUser = new Map<string, number>();
    for (const row of gameRows) {
      if (getQuarterKey(row.completedAt) !== currentQuarterKey) continue;
      quarterGamesByUser.set(
        row.userId,
        (quarterGamesByUser.get(row.userId) ?? 0) + 1,
      );
    }
    const quarterEligibleUsers = new Set(
      Array.from(quarterGamesByUser.entries())
        .filter(([, games]) => games >= 3)
        .map(([userId]) => userId),
    );
    const quarterResidualRows = withResidual.filter((r) =>
      quarterEligibleUsers.has(r.userId),
    );
    const quarterZScores = quarterResidualRows.map(
      (r) => r.efficiency / residualSafe,
    );
    const fallbackZScores = withResidual.map(
      (r) => r.efficiency / residualSafe,
    );
    const quarterIqr = computeIqr(quarterZScores);
    const fallbackIqr = computeIqr(fallbackZScores);
    const useQuarterCalibration =
      quarterResidualRows.length >= 8 &&
      quarterIqr !== null &&
      quarterIqr > 0.05;
    const calibrationMode: "quarter" | "fallback" = useQuarterCalibration
      ? "quarter"
      : "fallback";
    const observedIqr = useQuarterCalibration ? quarterIqr : fallbackIqr;

    const usersForPrior = useQuarterCalibration
      ? Array.from(quarterGamesByUser.values()).filter((games) => games >= 3)
      : normalized.map((r) => r.games);
    const medianGames = quantile(usersForPrior, 0.5);
    const moneyballPriorGames = clamp(
      Math.round(medianGames ?? defaultPriorGames),
      6,
      14,
    );
    const calibratedScale =
      observedIqr !== null && observedIqr > 0.05
        ? clamp(defaultMoneyballScale * (TARGET_Z_IQR / observedIqr), 10, 22)
        : defaultMoneyballScale;

    const gameKdaValues = gameRows.map(
      (row) => (row.kills + row.assists) / Math.max(row.deaths, 1),
    );
    const gameDamageValues = gameRows.map((row) => row.damageShare);
    const gamePerformanceByUser = new Map<
      string,
      Array<{
        completedAt: Date;
        soldPrice: number;
        kda: number;
        damageShare: number;
        performance: number;
        deaths: number;
        win: boolean;
        position: string | null;
      }>
    >();
    for (const row of gameRows) {
      const gameKda = (row.kills + row.assists) / Math.max(row.deaths, 1);
      const kdaNorm = percentile01(gameKdaValues, gameKda);
      const damageNorm = percentile01(gameDamageValues, row.damageShare);
      const winNorm = row.win ? 1 : 0;
      const perf = kdaNorm * 0.4 + damageNorm * 0.3 + winNorm * 0.3;
      const bucket = gamePerformanceByUser.get(row.userId) ?? [];
      bucket.push({
        completedAt: row.completedAt,
        soldPrice: row.soldPrice,
        kda: gameKda,
        damageShare: row.damageShare,
        performance: perf,
        deaths: row.deaths,
        win: row.win,
        position: row.position,
      });
      gamePerformanceByUser.set(row.userId, bucket);
    }

    const trendByUser = new Map<
      string,
      {
        recentTrendDelta: number;
        recentTrendPercent: number | null;
        recentGames: number;
        previousGames: number;
        trendConfidence: "insufficient" | "low" | "moderate" | "high";
      }
    >();
    for (const row of withResidual) {
      const games = [...(gamePerformanceByUser.get(row.userId) ?? [])].sort(
        (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
      );
      const recent = games.slice(0, TREND_WINDOW);
      const previous = games.slice(TREND_WINDOW, TREND_WINDOW * 2);
      const recentAvgEff =
        recent.length > 0
          ? recent.reduce(
              (sum, g) => sum + (g.performance - (beta0 + beta1 * g.soldPrice)),
              0,
            ) / recent.length
          : 0;
      const previousAvgEff =
        previous.length > 0
          ? previous.reduce(
              (sum, g) => sum + (g.performance - (beta0 + beta1 * g.soldPrice)),
              0,
            ) / previous.length
          : 0;
      const recentTrendDelta = recentAvgEff - previousAvgEff;
      const recentTrendPercent =
        previous.length > 0 && Math.abs(previousAvgEff) >= 0.0001
          ? (recentTrendDelta / Math.abs(previousAvgEff)) * 100
          : null;
      const segment = Math.min(recent.length, previous.length);
      const trendConfidence: "insufficient" | "low" | "moderate" | "high" =
        segment >= 5
          ? "high"
          : segment >= 4
            ? "moderate"
            : segment >= TREND_MIN_SEGMENT
              ? "low"
              : "insufficient";
      trendByUser.set(row.userId, {
        recentTrendDelta,
        recentTrendPercent,
        recentGames: recent.length,
        previousGames: previous.length,
        trendConfidence,
      });
    }

    const withIndex = withResidual.map((row) => {
      const trend = trendByUser.get(row.userId);
      const reliability = Math.sqrt(
        row.games / (row.games + moneyballPriorGames),
      );
      const moneyballIndex = Math.max(
        50,
        Math.min(
          150,
          baselineMoneyball +
            (row.efficiency / residualSafe) * calibratedScale * reliability,
        ),
      );
      return {
        ...row,
        moneyballIndex,
        reliability,
        recentTrendDelta: trend?.recentTrendDelta ?? 0,
        recentTrendPercent: trend?.recentTrendPercent ?? null,
        recentGames: trend?.recentGames ?? 0,
        previousGames: trend?.previousGames ?? 0,
        trendConfidence: trend?.trendConfidence ?? "insufficient",
      };
    });

    const bins = [
      { label: "0~99", min: 0, max: 99 },
      { label: "100~199", min: 100, max: 199 },
      { label: "200~399", min: 200, max: 399 },
      { label: "400~599", min: 400, max: 599 },
      { label: "600+", min: 600, max: null as number | null },
    ];

    const buckets: AuctionEfficiencyBucket[] = bins.map((bin) => {
      const inBin = withIndex.filter((row) =>
        bin.max === null
          ? row.soldPrice >= bin.min
          : row.soldPrice >= bin.min && row.soldPrice <= bin.max,
      );
      const games = inBin.reduce((sum, row) => sum + row.games, 0);
      const wins = inBin.reduce((sum, row) => sum + row.wins, 0);
      const avgKda =
        inBin.length > 0
          ? inBin.reduce((sum, row) => sum + row.avgKda, 0) / inBin.length
          : 0;
      const avgDamageShare =
        inBin.length > 0
          ? inBin.reduce((sum, row) => sum + row.avgDamageShare, 0) /
            inBin.length
          : 0;
      const avgPerformance =
        inBin.length > 0
          ? inBin.reduce((sum, row) => sum + row.performance, 0) / inBin.length
          : 0;
      return {
        label: bin.label,
        minPrice: bin.min,
        maxPrice: bin.max,
        games,
        users: inBin.length,
        avgKda: Math.round(avgKda * 100) / 100,
        avgDamageShare: Math.round(avgDamageShare * 10000) / 10000,
        winRate: games > 0 ? Math.round((wins / games) * 10000) / 10000 : 0,
        avgPerformance: Math.round(avgPerformance * 10000) / 10000,
      };
    });

    const scatter: AuctionEfficiencyPoint[] = withIndex.map((row) => ({
      userId: row.userId,
      username: row.username,
      soldPrice: Math.round(row.soldPrice),
      performance: Math.round(row.performance * 10000) / 10000,
      expectedPerformance: Math.round(row.expectedPerformance * 10000) / 10000,
      efficiency: Math.round(row.efficiency * 10000) / 10000,
      moneyballIndex: Math.round(row.moneyballIndex * 10) / 10,
      reliability: Math.round(row.reliability * 1000) / 1000,
      recentTrendDelta: Math.round(row.recentTrendDelta * 10000) / 10000,
      recentTrendPercent:
        row.recentTrendPercent === null
          ? null
          : Math.round(row.recentTrendPercent * 10) / 10,
      recentGames: row.recentGames,
      previousGames: row.previousGames,
      trendConfidence: row.trendConfidence,
    }));

    const toLeader = (
      row: (typeof withIndex)[number],
    ): AuctionEfficiencyLeader => ({
      userId: row.userId,
      username: row.username,
      soldPrice: Math.round(row.soldPrice),
      performance: Math.round(row.performance * 10000) / 10000,
      expectedPerformance: Math.round(row.expectedPerformance * 10000) / 10000,
      efficiency: Math.round(row.efficiency * 10000) / 10000,
      games: row.games,
      winRate: Math.round(row.winRate * 10000) / 10000,
      avgKda: Math.round(row.avgKda * 100) / 100,
      avgDamageShare: Math.round(row.avgDamageShare * 10000) / 10000,
      moneyballIndex: Math.round(row.moneyballIndex * 10) / 10,
      recentTrendDelta: Math.round(row.recentTrendDelta * 10000) / 10000,
      recentTrendPercent:
        row.recentTrendPercent === null
          ? null
          : Math.round(row.recentTrendPercent * 10) / 10,
      recentGames: row.recentGames,
      previousGames: row.previousGames,
      trendConfidence: row.trendConfidence,
      reliability: Math.round(row.reliability * 1000) / 1000,
    });

    const efficiencyTop = withIndex
      .filter((r) => residualStdDev <= 0 || r.efficiency > residualStdDev)
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, 5)
      .map(toLeader);

    const overpricedTop = withIndex
      .filter((r) => residualStdDev <= 0 || r.efficiency < -residualStdDev)
      .sort((a, b) => a.efficiency - b.efficiency)
      .slice(0, 5)
      .map(toLeader);

    const trendingTop = withIndex
      .filter((r) => r.trendConfidence !== "insufficient")
      .sort((a, b) => b.recentTrendDelta - a.recentTrendDelta)
      .slice(0, 5)
      .map(toLeader);

    const moneyballTop = withIndex
      .filter((r) => r.games >= 5)
      .sort((a, b) => b.moneyballIndex - a.moneyballIndex)
      .slice(0, 5)
      .map(toLeader);

    const bubbleRiskTop = withIndex
      .filter((r) => r.games >= 5)
      .sort((a, b) => a.moneyballIndex - b.moneyballIndex)
      .slice(0, 5)
      .map(toLeader);

    const roleFormUsersRaw = withIndex.map(
      (row): AuctionRoleFormUser | null => {
        const games = [...(gamePerformanceByUser.get(row.userId) ?? [])];
        const positionMap = new Map<
          string,
          {
            games: number;
            wins: number;
            kdaSum: number;
            deathsSum: number;
            damageShareSum: number;
            performanceSum: number;
          }
        >();
        for (const g of games) {
          if (!g.position) continue;
          const current = positionMap.get(g.position) ?? {
            games: 0,
            wins: 0,
            kdaSum: 0,
            deathsSum: 0,
            damageShareSum: 0,
            performanceSum: 0,
          };
          current.games += 1;
          current.wins += g.win ? 1 : 0;
          current.kdaSum += g.kda;
          current.deathsSum += g.deaths;
          current.damageShareSum += g.damageShare;
          current.performanceSum += g.performance;
          positionMap.set(g.position, current);
        }
        if (positionMap.size === 0) return null;

        const positions = Array.from(positionMap.entries())
          .map(([position, agg]) => ({
            position,
            games: agg.games,
            winRate: agg.games > 0 ? agg.wins / agg.games : 0,
            avgKda: agg.games > 0 ? agg.kdaSum / agg.games : 0,
            avgDeaths: agg.games > 0 ? agg.deathsSum / agg.games : 0,
            avgDamageShare: agg.games > 0 ? agg.damageShareSum / agg.games : 0,
            avgPerformance: agg.games > 0 ? agg.performanceSum / agg.games : 0,
          }))
          .sort((a, b) => b.games - a.games);

        const primary = positions[0] ?? null;
        const offRoles = positions.filter(
          (p) => p.position !== primary?.position,
        );
        const offRoleTotals = offRoles.reduce(
          (acc, p) => ({
            games: acc.games + p.games,
            winsWeighted: acc.winsWeighted + p.winRate * p.games,
            deathsWeighted: acc.deathsWeighted + p.avgDeaths * p.games,
            perfWeighted: acc.perfWeighted + p.avgPerformance * p.games,
          }),
          { games: 0, winsWeighted: 0, deathsWeighted: 0, perfWeighted: 0 },
        );
        const offRolePenalty =
          primary && offRoleTotals.games >= 3
            ? {
                winRateDelta:
                  primary.winRate -
                  offRoleTotals.winsWeighted / offRoleTotals.games,
                deathRateDelta:
                  (offRoleTotals.deathsWeighted / offRoleTotals.games -
                    primary.avgDeaths) /
                  Math.max(primary.avgDeaths, 0.1),
                performanceDelta:
                  primary.avgPerformance -
                  offRoleTotals.perfWeighted / offRoleTotals.games,
              }
            : null;

        const activeRoles = positions.filter((p) => p.games >= 3).length;
        const perfMean =
          positions.reduce((sum, p) => sum + p.avgPerformance, 0) /
          Math.max(positions.length, 1);
        const perfVariance =
          positions.reduce(
            (sum, p) => sum + (p.avgPerformance - perfMean) ** 2,
            0,
          ) / Math.max(positions.length, 1);
        const perfStdDev = Math.sqrt(perfVariance);
        const coverage = activeRoles / 5;
        const consistency = Math.max(0, 1 - perfStdDev / 0.2);
        const versatilityScore = Math.round(
          (coverage * 0.55 + consistency * 0.45) * 100,
        );
        const confidence: "insufficient" | "low" | "moderate" | "high" =
          row.games >= 20
            ? "high"
            : row.games >= 10
              ? "moderate"
              : row.games >= 5
                ? "low"
                : "insufficient";

        return {
          userId: row.userId,
          username: row.username,
          totalGames: row.games,
          activeRoles,
          primaryPosition: primary?.position ?? null,
          primaryGames: primary?.games ?? 0,
          versatilityScore,
          confidence,
          offRolePenalty:
            offRolePenalty === null
              ? null
              : {
                  winRateDelta:
                    Math.round(offRolePenalty.winRateDelta * 10000) / 10000,
                  deathRateDelta:
                    Math.round(offRolePenalty.deathRateDelta * 10000) / 10000,
                  performanceDelta:
                    Math.round(offRolePenalty.performanceDelta * 10000) / 10000,
                },
          positions: positions.map((p) => ({
            position: p.position,
            games: p.games,
            winRate: Math.round(p.winRate * 10000) / 10000,
            avgKda: Math.round(p.avgKda * 100) / 100,
            avgDeaths: Math.round(p.avgDeaths * 100) / 100,
            avgDamageShare: Math.round(p.avgDamageShare * 10000) / 10000,
            avgPerformance: Math.round(p.avgPerformance * 10000) / 10000,
          })),
        };
      },
    );
    const roleFormUsers: AuctionRoleFormUser[] = roleFormUsersRaw
      .filter((u): u is AuctionRoleFormUser => u !== null)
      .sort((a, b) => b.totalGames - a.totalGames);

    const versatilityTop = roleFormUsers
      .filter((u) => u.totalGames >= 5)
      .sort((a, b) => b.versatilityScore - a.versatilityScore)
      .slice(0, 5);
    const offRoleRiskTop = roleFormUsers
      .filter((u) => u.offRolePenalty !== null && u.totalGames >= 5)
      .sort(
        (a, b) =>
          (b.offRolePenalty?.performanceDelta ?? 0) -
          (a.offRolePenalty?.performanceDelta ?? 0),
      )
      .slice(0, 5);

    const unsoldGames = unsold.reduce((sum, row) => sum + row.games, 0);
    const unsoldWins = unsold.reduce((sum, row) => sum + row.wins, 0);
    const unsoldAvgPerformance =
      unsold.length > 0
        ? unsold.reduce((sum, row) => sum + row.performance, 0) / unsold.length
        : 0;

    const result: LabAuctionEfficiencyResponse = {
      period,
      source: "realtime",
      sampleSize: {
        users: scored.length,
        games: scored.reduce((sum, row) => sum + row.games, 0),
      },
      moneyball: {
        baselineIndex: baselineMoneyball,
        indexStdDev: Math.round(calibratedScale * 10) / 10,
        minGamesForTrend: TREND_MIN_SEGMENT,
        minGamesForRole: 5,
        calibration: {
          quarter: currentQuarterKey,
          mode: calibrationMode,
          sampleUsers:
            calibrationMode === "quarter"
              ? quarterEligibleUsers.size
              : normalized.length,
          pricedUsers:
            calibrationMode === "quarter"
              ? quarterResidualRows.length
              : withResidual.length,
          priorGames: moneyballPriorGames,
          scale: Math.round(calibratedScale * 1000) / 1000,
          observedIqr:
            observedIqr === null ? null : Math.round(observedIqr * 1000) / 1000,
          targetIqr: TARGET_Z_IQR,
        },
      },
      regression: {
        beta0: Math.round(beta0 * 1000000) / 1000000,
        beta1: Math.round(beta1 * 1000000) / 1000000,
        residualStdDev: Math.round(residualStdDev * 1000000) / 1000000,
      },
      buckets,
      scatter,
      efficiencyTop,
      overpricedTop,
      trendingTop,
      moneyballTop,
      bubbleRiskTop,
      roleForm: {
        users: roleFormUsers,
        versatilityTop,
        offRoleRiskTop,
      },
      unsoldSummary: {
        users: unsold.length,
        games: unsoldGames,
        winRate:
          unsoldGames > 0
            ? Math.round((unsoldWins / unsoldGames) * 10000) / 10000
            : 0,
        avgPerformance: Math.round(unsoldAvgPerformance * 10000) / 10000,
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }

  // ─── Task 19: 오라클 팀 밸런스 예측 API ───

  async getBalanceScore(
    teamA: string[],
    teamB: string[],
  ): Promise<LabBalanceScoreResponse> {
    const uniqueA = Array.from(new Set(teamA));
    const uniqueB = Array.from(new Set(teamB));
    const allUsers = Array.from(new Set([...uniqueA, ...uniqueB]));

    const users = await this.prisma.user.findMany({
      where: { id: { in: allUsers } },
      select: {
        id: true,
        username: true,
        nexusRanking: { select: { winRate: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const rawRows = await this.prisma.$queryRaw<
      {
        userId: string;
        matchId: string;
        completedAt: Date;
        win: boolean;
        kda: number;
        damageShare: number;
      }[]
    >(Prisma.sql`
      WITH team_totals AS (
        SELECT
          mp."matchId",
          COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text)) AS "teamKey",
          SUM(mp."totalDamageDealtToChampions")::float AS "teamDamage"
        FROM "match_participants" mp
        GROUP BY mp."matchId", COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
      )
      SELECT
        mp."userId" AS "userId",
        mp."matchId" AS "matchId",
        m."completedAt" AS "completedAt",
        mp."win" AS "win",
        ((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1))::float AS "kda",
        CASE WHEN tt."teamDamage" > 0
          THEN mp."totalDamageDealtToChampions"::float / tt."teamDamage"
          ELSE 0
        END::float AS "damageShare"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      INNER JOIN team_totals tt
        ON tt."matchId" = mp."matchId"
       AND tt."teamKey" = COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
      WHERE m."completedAt" IS NOT NULL
        AND mp."userId" IN (${Prisma.join(allUsers)})
      ORDER BY mp."userId" ASC, m."completedAt" DESC
    `);

    const rowsByUser = new Map<string, typeof rawRows>();
    for (const row of rawRows) {
      const arr = rowsByUser.get(row.userId) ?? [];
      if (arr.length < 20) {
        arr.push(row);
      }
      rowsByUser.set(row.userId, arr);
    }

    const sampledRows = Array.from(rowsByUser.values()).flat();
    const median = (values: number[]): number => {
      if (values.length === 0) return 1;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    };
    const kdaMedian = median(sampledRows.map((r) => r.kda));

    const pssByUser = new Map<
      string,
      {
        pss: number;
        recentGames: number;
        baseWinrate: number;
        kdaFactor: number;
        damageFactor: number;
        nexusWinRateFactor: number;
      }
    >();

    for (const userId of allUsers) {
      const rows = rowsByUser.get(userId) ?? [];
      const recentGames = rows.length;
      const wins = rows.filter((r) => r.win).length;
      const avgKda =
        recentGames > 0
          ? rows.reduce((sum, r) => sum + r.kda, 0) / recentGames
          : 0;
      const avgDamageShare =
        recentGames > 0
          ? rows.reduce((sum, r) => sum + r.damageShare, 0) / recentGames
          : 0;
      const baseWinrate = wilsonLower(wins, recentGames);
      const kdaFactor = kdaMedian > 0 ? Math.min(avgKda / kdaMedian, 2) : 0;
      const damageFactor = Math.min(Math.max(avgDamageShare, 0), 1);
      const nexusWinRate =
        (userMap.get(userId)?.nexusRanking?.winRate ?? 50) / 100;
      const nexusWinRateFactor = Math.min(Math.max(nexusWinRate, 0), 1);
      const pss =
        baseWinrate * 0.6 +
        kdaFactor * 0.1 +
        damageFactor * 0.1 +
        nexusWinRateFactor * 0.2;

      pssByUser.set(userId, {
        pss,
        recentGames,
        baseWinrate,
        kdaFactor,
        damageFactor,
        nexusWinRateFactor,
      });
    }

    const avg = (values: number[]): number =>
      values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;

    const teamAPss = avg(uniqueA.map((id) => pssByUser.get(id)?.pss ?? 0));
    const teamBPss = avg(uniqueB.map((id) => pssByUser.get(id)?.pss ?? 0));
    const sumPss = teamAPss + teamBPss;
    const modelWinRateA = sumPss > 0 ? teamAPss / sumPss : 0.5;

    const matchupRows = await this.prisma.$queryRaw<
      {
        matchId: string;
        teamId: string;
        win: boolean;
        userIds: string[];
      }[]
    >(Prisma.sql`
      SELECT
        mp."matchId" AS "matchId",
        COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text)) AS "teamId",
        BOOL_OR(mp."win") AS "win",
        ARRAY_AGG(mp."userId") AS "userIds"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE m."completedAt" IS NOT NULL
        AND mp."userId" IN (${Prisma.join(allUsers)})
      GROUP BY mp."matchId", COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
      HAVING COUNT(*) >= 1
    `);

    const byMatch = new Map<string, typeof matchupRows>();
    for (const row of matchupRows) {
      const arr = byMatch.get(row.matchId) ?? [];
      arr.push(row);
      byMatch.set(row.matchId, arr);
    }

    let similarCount = 0;
    let similarTeamAWins = 0;
    for (const rows of byMatch.values()) {
      if (rows.length < 2) continue;
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          const aTeam = rows[i];
          const bTeam = rows[j];
          const aInATeam = aTeam.userIds.filter((id) =>
            uniqueA.includes(id),
          ).length;
          const bInATeam = aTeam.userIds.filter((id) =>
            uniqueB.includes(id),
          ).length;
          const aInBTeam = bTeam.userIds.filter((id) =>
            uniqueA.includes(id),
          ).length;
          const bInBTeam = bTeam.userIds.filter((id) =>
            uniqueB.includes(id),
          ).length;

          if (aInATeam >= 3 && bInBTeam >= 3) {
            similarCount += 1;
            if (aTeam.win) similarTeamAWins += 1;
          } else if (aInBTeam >= 3 && bInATeam >= 3) {
            similarCount += 1;
            if (bTeam.win) similarTeamAWins += 1;
          }
        }
      }
    }

    const directWinRateA =
      similarCount > 0 ? similarTeamAWins / similarCount : modelWinRateA;
    const adjustedWinRateA =
      similarCount >= 5
        ? modelWinRateA * 0.7 + directWinRateA * 0.3
        : modelWinRateA;

    const minGames = Math.min(
      ...allUsers.map((id) => pssByUser.get(id)?.recentGames ?? 0),
    );
    const confidenceLevel: LabBalanceConfidence =
      minGames >= 10 ? "high" : minGames >= 5 ? "moderate" : "low";
    const confidenceMessage =
      confidenceLevel === "high"
        ? "참가자 전원이 최근 10게임 이상 데이터 보유"
        : confidenceLevel === "moderate"
          ? "참가자 전원이 최근 5게임 이상 데이터 보유"
          : "일부 유저의 최근 경기 데이터가 부족합니다";

    const players: LabBalancePlayerScore[] = allUsers.map((id) => {
      const score = pssByUser.get(id)!;
      const user = userMap.get(id);
      return {
        userId: id,
        username: user?.username ?? id.slice(0, 8),
        team: uniqueA.includes(id) ? "A" : "B",
        recentGames: score.recentGames,
        pss: Math.round(score.pss * 10000) / 10000,
        components: {
          baseWinrate: Math.round(score.baseWinrate * 10000) / 10000,
          kdaFactor: Math.round(score.kdaFactor * 10000) / 10000,
          damageFactor: Math.round(score.damageFactor * 10000) / 10000,
          nexusWinRateFactor:
            Math.round(score.nexusWinRateFactor * 10000) / 10000,
        },
      };
    });

    return {
      teamA: {
        avgPss: Math.round(teamAPss * 10000) / 10000,
        modelWinRate: Math.round(modelWinRateA * 10000) / 10000,
        adjustedWinRate: Math.round(adjustedWinRateA * 10000) / 10000,
      },
      teamB: {
        avgPss: Math.round(teamBPss * 10000) / 10000,
        modelWinRate: Math.round((1 - modelWinRateA) * 10000) / 10000,
        adjustedWinRate: Math.round((1 - adjustedWinRateA) * 10000) / 10000,
      },
      confidence: {
        level: confidenceLevel,
        message: confidenceMessage,
      },
      similarMatches: {
        count: similarCount,
        teamAWins: similarTeamAWins,
        teamBWins: similarCount - similarTeamAWins,
        teamAWinRate:
          similarCount > 0
            ? Math.round((similarTeamAWins / similarCount) * 10000) / 10000
            : 0,
      },
      players,
      caveat:
        "개인 성과 기반 참고용 예측이며 챔피언 선택/밴픽/컨디션/소통 변수는 반영되지 않습니다.",
    };
  }

  // ─── Task 20: 오라클 밴픽 추천 API ───

  async getBanRecommend(params: {
    period?: Period;
    userIds?: string[];
    teamAUserIds?: string[];
    teamBUserIds?: string[];
  }): Promise<LabBanRecommendResponse> {
    const period = params.period ?? "30d";
    const userIds = Array.from(new Set(params.userIds ?? []));
    const teamAUserIds = Array.from(new Set(params.teamAUserIds ?? []));
    const teamBUserIds = Array.from(new Set(params.teamBUserIds ?? []));

    const isByTeam = teamAUserIds.length > 0 && teamBUserIds.length > 0;
    const targetUsersGlobal = isByTeam
      ? Array.from(new Set([...teamAUserIds, ...teamBUserIds]))
      : userIds;

    if (targetUsersGlobal.length === 0) {
      return {
        period,
        mode: isByTeam ? "byTeam" : "global",
        meta: {
          source: "none",
          customMetaCount: 0,
          rankedMetaCount: 0,
          externalSupplementedCount: 0,
          rankedPeriod: null,
        },
        recommendations: [],
      };
    }

    const cacheKey = this.labCacheKey(
      `oracle:ban-recommend:${period}:${userIds.join(",")}:${teamAUserIds.join(",")}:${teamBUserIds.join(",")}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const users = await this.prisma.user.findMany({
      where: { id: { in: targetUsersGlobal } },
      select: { id: true, username: true },
    });
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    const masteryRows = await this.prisma.$queryRaw<
      {
        userId: string;
        championId: number;
        championName: string;
        games: bigint;
        wins: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        mp."userId" AS "userId",
        mp."championId" AS "championId",
        MIN(mp."championName") AS "championName",
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE m."completedAt" IS NOT NULL
        AND mp."userId" IN (${Prisma.join(targetUsersGlobal)})
      GROUP BY mp."userId", mp."championId"
      HAVING COUNT(*) >= 3
    `);

    const threatRows = await this.prisma.$queryRaw<
      {
        userId: string;
        championId: number;
        games: bigint;
        wins: bigint;
      }[]
    >(Prisma.sql`
      WITH ranked AS (
        SELECT
          mp."userId" AS "userId",
          mp."championId" AS "championId",
          mp."win" AS "win",
          ROW_NUMBER() OVER (
            PARTITION BY mp."userId", mp."championId"
            ORDER BY m."completedAt" DESC
          ) AS rn
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" IS NOT NULL
          AND mp."userId" IN (${Prisma.join(targetUsersGlobal)})
      )
      SELECT
        "userId",
        "championId",
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE "win" = true)::bigint AS "wins"
      FROM ranked
      WHERE rn <= 5
      GROUP BY "userId", "championId"
    `);

    const championIds = Array.from(
      new Set(masteryRows.map((r) => r.championId)),
    );

    const metaRows = await this.prisma.$queryRaw<
      {
        championId: number;
        wilsonLower: number;
        pickRate: number;
      }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (lcs."championId")
        lcs."championId" AS "championId",
        lcs."wilsonLower" AS "wilsonLower",
        lcs."pickRate" AS "pickRate"
      FROM "lab_champion_snapshots" lcs
      WHERE lcs."period" = ${period}
        AND lcs."position" IS NULL
        ${
          championIds.length > 0
            ? Prisma.sql`AND lcs."championId" IN (${Prisma.join(championIds)})`
            : Prisma.empty
        }
      ORDER BY lcs."championId", lcs."computedAt" DESC
    `);

    // 내전 메타 표본이 얕을 때 외부 랭크 메타(고티어 시딩)로 보강
    const rankedPeriod: "30d" | "current_patch" =
      period === "30d" ? "30d" : "current_patch";
    const rankedMetaRows =
      championIds.length > 0
        ? await this.prisma.labRankedChampionSnapshot.findMany({
            where: {
              period: rankedPeriod,
              position: null,
              championId: { in: championIds },
            },
            select: {
              championId: true,
              wilsonLower: true,
              pickRate: true,
            },
            orderBy: [{ wilsonLower: "desc" }, { pickRate: "desc" }],
            take: 120,
          })
        : [];
    const championNameRows =
      championIds.length > 0
        ? await this.prisma.$queryRaw<
            { championId: number; championName: string }[]
          >(
            Prisma.sql`
              SELECT
                mp."championId" AS "championId",
                MIN(mp."championName") AS "championName"
              FROM "match_participants" mp
              WHERE mp."championId" IN (${Prisma.join(championIds)})
              GROUP BY mp."championId"
            `,
          )
        : [];
    const championNameById = new Map(
      championNameRows.map((r) => [r.championId, r.championName]),
    );

    const customMetaChampionSet = new Set(metaRows.map((r) => r.championId));
    const externalSupplementedRows = rankedMetaRows.filter(
      (r) => !customMetaChampionSet.has(r.championId),
    );
    const mergedMetaRows = [...metaRows, ...externalSupplementedRows];

    const metaSource: LabBanRecommendResponse["meta"]["source"] =
      metaRows.length === 0
        ? rankedMetaRows.length > 0
          ? "ranked_only"
          : "none"
        : externalSupplementedRows.length > 0
          ? "hybrid"
          : "custom";

    const sortedMeta = [...mergedMetaRows].sort(
      (a, b) => b.wilsonLower - a.wilsonLower || b.pickRate - a.pickRate,
    );
    const metaStrengthByChampion = new Map<number, number>();
    for (let i = 0; i < sortedMeta.length; i++) {
      const ratio = (i + 1) / sortedMeta.length;
      const score =
        ratio <= 0.1 ? 1.0 : ratio <= 0.3 ? 0.75 : ratio <= 0.6 ? 0.5 : 0.25;
      metaStrengthByChampion.set(sortedMeta[i].championId, score);
    }

    const masteryByUserChamp = new Map<
      string,
      { games: number; wins: number; score: number }
    >();
    for (const row of masteryRows) {
      const games = Number(row.games);
      const wins = Number(row.wins);
      const wl = wilsonLower(wins, games);
      masteryByUserChamp.set(`${row.userId}:${row.championId}`, {
        games,
        wins,
        score: games * wl,
      });
    }

    const threatByUserChamp = new Map<string, number>();
    for (const row of threatRows) {
      const games = Number(row.games);
      const wins = Number(row.wins);
      threatByUserChamp.set(
        `${row.userId}:${row.championId}`,
        games > 0 ? wins / games : 0,
      );
    }

    const buildForTargets = (targets: string[]): LabBanRecommendationRow[] => {
      const scoreMap = new Map<
        number,
        {
          userMastery: number;
          metaStrength: number;
          threatScore: number;
          topUserForMastery?: {
            userId: string;
            games: number;
            winRate: number;
          };
          topUserForThreat?: { userId: string; threat: number };
        }
      >();

      for (const userId of targets) {
        for (const championId of championIds) {
          const key = `${userId}:${championId}`;
          const mastery = masteryByUserChamp.get(key);
          if (!mastery) continue;
          const threat = threatByUserChamp.get(key) ?? 0;
          const meta = metaStrengthByChampion.get(championId) ?? 0.25;

          const bucket = scoreMap.get(championId) ?? {
            userMastery: 0,
            metaStrength: 0,
            threatScore: 0,
          };

          const masteryContrib = mastery.score * 0.5;
          const metaContrib = meta * 0.3;
          const threatContrib = threat * 0.2;

          bucket.userMastery += masteryContrib;
          bucket.metaStrength += metaContrib;
          bucket.threatScore += threatContrib;

          const champWinRate =
            mastery.games > 0 ? mastery.wins / mastery.games : 0;
          if (
            !bucket.topUserForMastery ||
            masteryContrib >
              bucket.topUserForMastery.games *
                0.5 *
                (bucket.topUserForMastery.winRate || 0)
          ) {
            bucket.topUserForMastery = {
              userId,
              games: mastery.games,
              winRate: champWinRate,
            };
          }
          if (
            !bucket.topUserForThreat ||
            threat > bucket.topUserForThreat.threat
          ) {
            bucket.topUserForThreat = { userId, threat };
          }

          scoreMap.set(championId, bucket);
        }
      }

      return Array.from(scoreMap.entries())
        .map(([championId, c]) => {
          const total = c.userMastery + c.metaStrength + c.threatScore;
          const reasons: string[] = [];
          if (c.topUserForMastery) {
            const username =
              usernameById.get(c.topUserForMastery.userId) ??
              c.topUserForMastery.userId.slice(0, 8);
            reasons.push(
              `${username}의 주력 챔피언 (${c.topUserForMastery.games}게임 ${(c.topUserForMastery.winRate * 100).toFixed(1)}%)`,
            );
          }
          if ((metaStrengthByChampion.get(championId) ?? 0.25) >= 0.75) {
            reasons.push("현재 상위 메타 챔피언");
          }
          if (c.topUserForThreat && c.topUserForThreat.threat >= 0.6) {
            const username =
              usernameById.get(c.topUserForThreat.userId) ??
              c.topUserForThreat.userId.slice(0, 8);
            reasons.push(
              `${username} 최근 5게임 위협도 ${(c.topUserForThreat.threat * 100).toFixed(1)}%`,
            );
          }

          const championName =
            championNameById.get(championId) ?? String(championId);
          return {
            championId,
            championNameKorean: getChampionKoreanName(championName),
            banScore: Math.round(total * 10000) / 10000,
            contributions: {
              userMastery: Math.round(c.userMastery * 10000) / 10000,
              metaStrength: Math.round(c.metaStrength * 10000) / 10000,
              threatScore: Math.round(c.threatScore * 10000) / 10000,
            },
            reasons,
          } satisfies LabBanRecommendationRow;
        })
        .sort((a, b) => b.banScore - a.banScore)
        .slice(0, 5);
    };

    const result: LabBanRecommendResponse = isByTeam
      ? {
          period,
          mode: "byTeam",
          meta: {
            source: metaSource,
            customMetaCount: metaRows.length,
            rankedMetaCount: rankedMetaRows.length,
            externalSupplementedCount: externalSupplementedRows.length,
            rankedPeriod: rankedMetaRows.length > 0 ? rankedPeriod : null,
          },
          byTeam: {
            teamA: buildForTargets(teamBUserIds),
            teamB: buildForTargets(teamAUserIds),
          },
        }
      : {
          period,
          mode: "global",
          meta: {
            source: metaSource,
            customMetaCount: metaRows.length,
            rankedMetaCount: rankedMetaRows.length,
            externalSupplementedCount: externalSupplementedRows.length,
            rankedPeriod: rankedMetaRows.length > 0 ? rankedPeriod : null,
          },
          recommendations: buildForTargets(userIds),
        };

    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }

  // ─── Task 14: 챔피언 장인 목록 (동적 티어 완화 + masteryScore) ───

  async getChampionMastery(
    championId: number,
    dataSource: LabStatsDataSource = "custom",
    includeCrossSourceBadge = true,
  ): Promise<LabChampionMasteryResponse> {
    if (dataSource === "ranked-meta") {
      const empty: LabChampionMasteryResponse = {
        championId,
        championName: String(championId),
        championNameKorean: getChampionKoreanName(String(championId)),
        dataSource,
        appliedCriteria: {
          minTier: "DIAMOND",
          minRank: "II",
          minGames: 10,
          minWinRate: 0.4,
          isRelaxed: false,
        },
        totalUniquePlayersOnChamp: 0,
        qualifiedCount: 0,
        insufficient: true,
        masteries: [],
      };
      return empty;
    }

    const cacheKey = this.labCacheKey(
      `champion:mastery:${dataSource}:${championId}`,
    );
    const cached = includeCrossSourceBadge ? await this.redis.get(cacheKey) : null;
    if (cached) return JSON.parse(cached);

    const sourceFilter = this.getMatchSourceFilter(dataSource);

    const championRows = await this.prisma.$queryRaw<
      {
        userId: string;
        championName: string | null;
        games: bigint;
        wins: bigint;
        avgKda: number;
        avgDamageShare: number;
        avgVisionShare: number;
        lastPlayedAt: Date;
      }[]
    >(Prisma.sql`
      WITH team_totals AS (
        SELECT
          mp."matchId",
          COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text)) AS "teamKey",
          SUM(mp."totalDamageDealtToChampions")::float AS "teamDamage",
          SUM(mp."visionScore")::float AS "teamVision"
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${sourceFilter}
        GROUP BY mp."matchId", COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
      )
      SELECT
        mp."userId" AS "userId",
        MIN(mp."championName") AS "championName",
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins",
        ROUND(AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1))::numeric, 4)::float AS "avgKda",
        ROUND(AVG(
          CASE WHEN tt."teamDamage" > 0
            THEN mp."totalDamageDealtToChampions"::float / tt."teamDamage"
            ELSE 0
          END
        )::numeric, 6)::float AS "avgDamageShare",
        ROUND(AVG(
          CASE WHEN tt."teamVision" > 0
            THEN mp."visionScore"::float / tt."teamVision"
            ELSE 0
          END
        )::numeric, 6)::float AS "avgVisionShare",
        MAX(m."completedAt") AS "lastPlayedAt"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      INNER JOIN team_totals tt
        ON tt."matchId" = mp."matchId"
       AND tt."teamKey" = COALESCE(mp."teamId", CONCAT('__WIN__:', mp."win"::text))
      WHERE m."completedAt" IS NOT NULL
        ${sourceFilter}
        AND mp."championId" = ${championId}
        AND mp."userId" IS NOT NULL
      GROUP BY mp."userId"
    `);

    const totalUniquePlayersOnChamp = championRows.length;
    const championName = championRows[0]?.championName ?? String(championId);

    if (championRows.length === 0) {
      const empty: LabChampionMasteryResponse = {
        championId,
        championName,
        championNameKorean: getChampionKoreanName(championName),
        dataSource,
        appliedCriteria: {
          minTier: "DIAMOND",
          minRank: "II",
          minGames: 10,
          minWinRate: 0.4,
          isRelaxed: false,
        },
        totalUniquePlayersOnChamp: 0,
        qualifiedCount: 0,
        insufficient: true,
        masteries: [],
      };
      if (includeCrossSourceBadge) {
        await this.redis.set(cacheKey, JSON.stringify(empty), 1800);
      }
      return empty;
    }

    const userIds = championRows.map((r) => r.userId).filter(Boolean);
    const [users, auctionRows] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          avatar: true,
          riotAccounts: {
            select: {
              puuid: true,
              tier: true,
              rank: true,
              lp: true,
              isPrimary: true,
            },
          },
          nexusRanking: {
            select: {
              winRate: true,
              globalRank: true,
            },
          },
        },
      }),
      this.prisma.$queryRaw<
        { userId: string; avgSoldPrice: number | null }[]
      >(Prisma.sql`
        WITH auction_entries AS (
          SELECT DISTINCT
            t."roomId" AS "roomId",
            tm."userId" AS "userId",
            tm."soldPrice"::float AS "soldPrice"
          FROM "team_members" tm
          INNER JOIN "teams" t ON t."id" = tm."teamId"
          INNER JOIN "rooms" r ON r."id" = t."roomId"
          WHERE r."teamMode" = 'AUCTION'
            AND tm."soldPrice" IS NOT NULL
        )
        SELECT
          mp."userId" AS "userId",
          ROUND(AVG(ae."soldPrice")::numeric, 2)::float AS "avgSoldPrice"
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        INNER JOIN auction_entries ae
          ON ae."roomId" = m."roomId"
         AND ae."userId" = mp."userId"
        WHERE m."completedAt" IS NOT NULL
          AND mp."championId" = ${championId}
          AND mp."userId" IN (${Prisma.join(userIds)})
        GROUP BY mp."userId"
      `),
    ]);

    const allPuuids = users.flatMap((u) =>
      u.riotAccounts.map((ra) => ra.puuid),
    );
    const seasonTiers =
      allPuuids.length > 0
        ? await this.prisma.summonerSeasonTier.findMany({
            where: { puuid: { in: allPuuids } },
            select: {
              puuid: true,
              tier: true,
              rank: true,
              lp: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
          })
        : [];

    const latestSeasonTierByPuuid = new Map<
      string,
      { tier: string; rank: string; lp: number }
    >();
    for (const row of seasonTiers) {
      if (!latestSeasonTierByPuuid.has(row.puuid)) {
        latestSeasonTierByPuuid.set(row.puuid, {
          tier: row.tier,
          rank: row.rank,
          lp: row.lp,
        });
      }
    }

    const userMap = new Map(users.map((u) => [u.id, u]));
    const avgSoldPriceMap = new Map(
      auctionRows.map((row) => [row.userId, row.avgSoldPrice]),
    );

    const candidates = championRows
      .map((row) => {
        const user = userMap.get(row.userId);
        if (!user) return null;

        const accounts = user.riotAccounts.map((account) => {
          const seasonal = latestSeasonTierByPuuid.get(account.puuid);
          return {
            tier: (seasonal?.tier ?? account.tier ?? "UNRANKED").toUpperCase(),
            rank: (seasonal?.rank ?? account.rank ?? "").toUpperCase(),
            lp: seasonal?.lp ?? account.lp ?? 0,
            isPrimary: account.isPrimary,
          };
        });

        let selectedRanked = null as {
          tier: string;
          rank: string;
          lp: number;
        } | null;

        const primary = accounts.find((a) => a.isPrimary);
        if (primary) {
          selectedRanked = primary;
        } else if (accounts.length > 0) {
          selectedRanked = [...accounts].sort(
            (a, b) =>
              tierScore(b.tier, b.rank, b.lp) - tierScore(a.tier, a.rank, a.lp),
          )[0];
        }

        const games = Number(row.games);
        const wins = Number(row.wins);
        const champWinRate = games > 0 ? wins / games : 0;

        return {
          userId: row.userId,
          username: user.username,
          avatar: user.avatar,
          riotTier: selectedRanked?.tier ?? "UNRANKED",
          riotRank: selectedRanked?.rank ?? "",
          riotLp: selectedRanked?.lp ?? 0,
          games,
          wins,
          champWinRate,
          avgKda: row.avgKda,
          avgDamageShare: row.avgDamageShare,
          avgVisionShare: row.avgVisionShare,
          lastPlayedAt: row.lastPlayedAt,
          nexusWinRate: user.nexusRanking?.winRate ?? 0,
          nexusGlobalRank: user.nexusRanking?.globalRank ?? null,
          avgSoldPrice: avgSoldPriceMap.get(row.userId) ?? null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const criteriaLevels: Array<LabChampionMasteryCriteria> = [
      {
        minTier: "DIAMOND",
        minRank: "II",
        minGames: 10,
        minWinRate: 0.4,
        isRelaxed: false,
      },
      {
        minTier: "PLATINUM",
        minRank: "I",
        minGames: 7,
        minWinRate: 0.4,
        isRelaxed: true,
      },
      {
        minTier: "PLATINUM",
        minRank: "II",
        minGames: 5,
        minWinRate: 0.35,
        isRelaxed: true,
      },
    ];

    const passesCriteria = (
      row: (typeof candidates)[number],
      criteria: LabChampionMasteryCriteria,
    ): boolean => {
      if (row.riotTier === "UNRANKED") return false;
      if (row.games < criteria.minGames) return false;
      if (row.champWinRate < criteria.minWinRate) return false;
      return (
        tierScore(row.riotTier, row.riotRank, row.riotLp) >=
        tierScore(criteria.minTier, criteria.minRank)
      );
    };

    let appliedCriteria = criteriaLevels[0];
    let qualified = candidates.filter((row) =>
      passesCriteria(row, appliedCriteria),
    );
    if (qualified.length < 10) {
      appliedCriteria = criteriaLevels[1];
      qualified = candidates.filter((row) =>
        passesCriteria(row, appliedCriteria),
      );
    }
    if (qualified.length < 5) {
      appliedCriteria = criteriaLevels[2];
      qualified = candidates.filter((row) =>
        passesCriteria(row, appliedCriteria),
      );
    }

    const percentile = (values: number[], value: number): number => {
      if (values.length === 0) return 0;
      if (values.length === 1) return 100;
      const sorted = [...values].sort((a, b) => a - b);
      const idx = sorted.findIndex((v) => v >= value);
      const rankIndex = idx === -1 ? sorted.length - 1 : idx;
      return (rankIndex / (sorted.length - 1)) * 100;
    };

    const kdaValues = qualified.map((r) => r.avgKda);
    const damageShareValues = qualified.map((r) => r.avgDamageShare);
    const visionShareValues = qualified.map((r) => r.avgVisionShare);

    const scored = qualified.map((row) => {
      const volumeScore =
        Math.min(Math.log2(row.games + 1) / Math.log2(51), 1) * 100;
      const skillScore = wilsonLower(row.wins, row.games) * 100;
      const kdaPct = percentile(kdaValues, row.avgKda);
      const damagePct = percentile(damageShareValues, row.avgDamageShare);
      const visionPct = percentile(visionShareValues, row.avgVisionShare);
      const impactScore = kdaPct * 0.4 + damagePct * 0.4 + visionPct * 0.2;

      const daysAgo =
        (Date.now() - row.lastPlayedAt.getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore =
        daysAgo < 30 ? 100 : daysAgo < 60 ? 60 : daysAgo < 90 ? 30 : 0;

      const masteryScore =
        volumeScore * 0.3 +
        skillScore * 0.4 +
        impactScore * 0.2 +
        recencyScore * 0.1;

      return {
        ...row,
        volumeScore,
        skillScore,
        impactScore,
        recencyScore,
        masteryScore,
      };
    });

    scored.sort((a, b) => b.masteryScore - a.masteryScore);
    const topScored = scored.slice(0, MASTERY_TOP_LIMIT);
    const insufficient = topScored.length < 3;

    const masteryScores = topScored.map((r) => r.masteryScore);
    const soldPriceValues = topScored
      .map((r) => r.avgSoldPrice)
      .filter((v): v is number => typeof v === "number");
    const masteryQ3 =
      masteryScores.length > 0
        ? [...masteryScores].sort((a, b) => a - b)[
            Math.floor((masteryScores.length - 1) * 0.75)
          ]
        : 0;
    const soldQ3 =
      soldPriceValues.length > 0
        ? [...soldPriceValues].sort((a, b) => a - b)[
            Math.floor((soldPriceValues.length - 1) * 0.75)
          ]
        : null;

    const masteries: LabChampionMasteryEntry[] = topScored.map((row, idx) => {
      const badges: LabChampionMasteryBadgeWithDerived[] = [];
      const highSoldPrice =
        typeof row.avgSoldPrice === "number" &&
        soldQ3 !== null &&
        row.avgSoldPrice >= soldQ3;
      const highMastery = row.masteryScore >= masteryQ3;

      if (highSoldPrice && highMastery) badges.push("커뮤니티 인증");
      else if (highSoldPrice) badges.push("고평가");
      if (appliedCriteria.isRelaxed) badges.push("기준 완화");

      return {
        rank: idx + 1,
        userId: row.userId,
        username: row.username,
        avatar: row.avatar,
        riotTier: row.riotTier,
        riotRank: row.riotRank,
        champGames: row.games,
        champWins: row.wins,
        champWinRate: Math.round(row.champWinRate * 10000) / 10000,
        wilsonLower:
          Math.round(wilsonLower(row.wins, row.games) * 1000000) / 1000000,
        avgKda: Math.round(row.avgKda * 100) / 100,
        masteryScore: Math.round(row.masteryScore * 100) / 100,
        scoreBreakdown: {
          volume: Math.round(row.volumeScore * 100) / 100,
          skill: Math.round(row.skillScore * 100) / 100,
          impact: Math.round(row.impactScore * 100) / 100,
          recency: row.recencyScore,
        },
        lastPlayedAt: row.lastPlayedAt.toISOString(),
        nexusWinRate: row.nexusWinRate,
        nexusGlobalRank: row.nexusGlobalRank,
        avgSoldPrice: row.avgSoldPrice,
        badges,
      };
    });

    if (includeCrossSourceBadge) {
      const oppositeSource: LabStatsDataSource =
        dataSource === "custom" ? "ranked-community" : "custom";
      const opposite = await this.getChampionMastery(
        championId,
        oppositeSource,
        false,
      );
      const oppositeUserIds = new Set(opposite.masteries.map((row) => row.userId));
      for (const entry of masteries) {
        if (
          oppositeUserIds.has(entry.userId) &&
          !entry.badges.includes("양쪽 장인")
        ) {
          entry.badges.push("양쪽 장인");
        }
      }
    }

    const result: LabChampionMasteryResponse = {
      championId,
      championName,
      championNameKorean: getChampionKoreanName(championName),
      dataSource,
      appliedCriteria,
      totalUniquePlayersOnChamp,
      qualifiedCount: qualified.length,
      insufficient,
      masteries,
    };

    if (includeCrossSourceBadge) {
      await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    }
    return result;
  }

  private extractPurchasedCompletedItems(
    itemPurchaseOrder: Prisma.JsonValue,
    completedItemIds: Set<number>,
  ): number[] {
    if (!Array.isArray(itemPurchaseOrder)) return [];

    return itemPurchaseOrder
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const itemId = Number((entry as { itemId?: unknown }).itemId);
        const timestamp = Number((entry as { timestamp?: unknown }).timestamp ?? 0);

        if (!Number.isInteger(itemId) || !completedItemIds.has(itemId)) {
          return null;
        }

        return {
          itemId,
          timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        };
      })
      .filter(
        (entry): entry is { itemId: number; timestamp: number } => entry !== null,
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => entry.itemId)
      .filter((id, index, array) => array.indexOf(id) === index);
  }

  /**
   * Riot perks JSON에서 (primaryStyle, subStyle, keystonePerk)를 추출.
   * 구조: { styles: [{ description: "primaryStyle", style: number, selections: [{ perk: number, ... }, ...] },
   *                  { description: "subStyle", style: number, ... }] }
   */
  private extractRuneTriplet(perks: Prisma.JsonValue): {
    primaryStyle: number;
    subStyle: number;
    keystonePerk: number;
  } | null {
    if (!perks || typeof perks !== "object") return null;
    const styles = (perks as { styles?: unknown }).styles;
    if (!Array.isArray(styles) || styles.length < 2) return null;

    const primary = styles[0] as
      | {
          style?: number;
          selections?: { perk?: number }[];
        }
      | undefined;
    const sub = styles[1] as { style?: number } | undefined;

    const primaryStyle = primary?.style;
    const subStyle = sub?.style;
    const keystonePerk = primary?.selections?.[0]?.perk;

    if (
      typeof primaryStyle !== "number" ||
      typeof subStyle !== "number" ||
      typeof keystonePerk !== "number"
    ) {
      return null;
    }

    return { primaryStyle, subStyle, keystonePerk };
  }

  // ─── Task 35: Admin — 콜드스타트/데이터 단계 조회 ───

  /**
   * 현재 Lab 데이터 단계(0~4)를 반환한다.
   * - 0단계(콜드):    0~9게임
   * - 1단계(워밍업):  10~29게임
   * - 2단계(기본):    30~99게임
   * - 3단계(안정):    100~299게임
   * - 4단계(성숙):    300+게임
   */
  async getDataPhase(): Promise<{
    phase: number;
    totalMatches: number;
    nextPhaseThreshold: number | null;
    remainingUntilNextPhase: number | null;
    snapshotLastComputedAt: Date | null;
  }> {
    const THRESHOLDS = [0, 10, 30, 100, 300];

    const totalMatches = await this.prisma.match.count({
      where: { completedAt: { not: null } },
    });

    let phase = 0;
    for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
      if (totalMatches >= THRESHOLDS[i]) {
        phase = i;
        break;
      }
    }

    const nextThreshold = THRESHOLDS[phase + 1] ?? null;
    const remaining =
      nextThreshold !== null ? nextThreshold - totalMatches : null;

    // 가장 최근 스냅샷 computedAt
    const latestSnapshot = await this.prisma.labChampionSnapshot.findFirst({
      orderBy: { computedAt: "desc" },
      select: { computedAt: true },
    });

    return {
      phase,
      totalMatches,
      nextPhaseThreshold: nextThreshold,
      remainingUntilNextPhase: remaining,
      snapshotLastComputedAt: latestSnapshot?.computedAt ?? null,
    };
  }

  // ─── Task 39: LabRankedChampionSnapshot 집계 ───

  /**
   * 외부 고티어(KR 챌린저+그마) 시딩 유저(priority=7, isNexusUser=false)의
   * 랭크 매치(queueId 420/440)를 기반으로 period별 챔피언 메타 스냅샷을 재계산한다.
   * period 처리 순서: 7d → 30d → current_patch
   */
  async computeRankedChampionSnapshots(): Promise<{
    sevenDay: number;
    thirtyDay: number;
    currentPatch: number;
  }> {
    const periods = ["7d", "30d", "current_patch"] as const;
    const counts = { sevenDay: 0, thirtyDay: 0, currentPatch: 0 };

    for (const p of periods) {
      const count = await this.computeRankedSnapshotForPeriod(p);
      if (p === "7d") counts.sevenDay = count;
      else if (p === "30d") counts.thirtyDay = count;
      else counts.currentPatch = count;
    }

    this.logger.log(
      `LabRankedChampionSnapshot 완료: 7d=${counts.sevenDay}, 30d=${counts.thirtyDay}, current_patch=${counts.currentPatch}`,
    );
    return counts;
  }

  private async computeRankedSnapshotForPeriod(
    period: "7d" | "30d" | "current_patch",
  ): Promise<number> {
    // POSITIONS: 향후 포지션별 정규화에 활용 예정 (현재는 집계 시 inline 처리)
    // const POSITIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT", null];

    // 기간 필터 및 패치 버전 결정
    let gameCreatedAfter: Date | null = null;
    let targetPatchVersion: string | null = null;

    if (period === "7d") {
      gameCreatedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "30d") {
      gameCreatedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else {
      // current_patch: 최빈 patchVersion 감지
      const patchRow = await this.prisma.$queryRaw<
        Array<{ patchVersion: string; cnt: bigint }>
      >`
        SELECT "patchVersion", COUNT(*) AS cnt
        FROM "riot_match_cache"
        WHERE "patchVersion" IS NOT NULL
          AND "queueId" IN (420, 440)
          AND "gameEnd" >= NOW() - INTERVAL '7 days'
        GROUP BY "patchVersion"
        ORDER BY cnt DESC
        LIMIT 1
      `;
      if (patchRow.length === 0) {
        this.logger.warn(
          "LabRankedChampionSnapshot: current_patch 감지 실패, 스킵",
        );
        return 0;
      }
      targetPatchVersion = patchRow[0].patchVersion;

      // 증분 재계산: lastMatchCreatedAt cursor 이후 신규 매치만 처리
      const existing = await this.prisma.labRankedChampionSnapshot.findFirst({
        where: { period: "current_patch", patchVersion: targetPatchVersion },
        orderBy: { lastMatchCreatedAt: "desc" },
        select: { lastMatchCreatedAt: true },
      });
      gameCreatedAfter = existing?.lastMatchCreatedAt ?? null;
    }

    // 시딩 유저 PUUID 목록 (priority=7, isNexusUser=false)
    const seedingPuuids = await this.prisma.knownPuuid.findMany({
      where: { priority: 7, isNexusUser: false },
      select: { puuid: true },
    });
    if (seedingPuuids.length === 0) {
      this.logger.warn(
        `LabRankedChampionSnapshot(${period}): 시딩 PUUID 없음, 스킵`,
      );
      return 0;
    }
    const puuidSet = seedingPuuids.map((p) => p.puuid);

    // Riot match-v5 participant 레벨 집계 (JSON 파싱은 PostgreSQL에서 수행)
    type ParticipantRow = {
      puuid: string;
      championId: number;
      position: string | null;
      individualPosition: string | null;
      lane: string | null;
      role: string | null;
      kills: number;
      deaths: number;
      assists: number;
      totalDamageDealtToChampions: number;
      win: boolean;
      gameCreation: bigint;
    };

    const gameCreatedAfterMs = gameCreatedAfter
      ? gameCreatedAfter.getTime()
      : null;
    const patchFilter = targetPatchVersion
      ? Prisma.sql`AND rm."patchVersion" = ${targetPatchVersion}`
      : Prisma.sql``;
    const timeFilter = gameCreatedAfterMs
      ? Prisma.sql`AND (rm."data"->'info'->>'gameCreation')::bigint > ${gameCreatedAfterMs}`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<ParticipantRow[]>`
      SELECT
        p.value->>'puuid'                                            AS "puuid",
        (p.value->>'championId')::int                               AS "championId",
        p.value->>'teamPosition'                                     AS "position",
        p.value->>'individualPosition'                               AS "individualPosition",
        p.value->>'lane'                                             AS "lane",
        p.value->>'role'                                             AS "role",
        (p.value->>'kills')::int                                     AS "kills",
        (p.value->>'deaths')::int                                    AS "deaths",
        (p.value->>'assists')::int                                   AS "assists",
        (p.value->>'totalDamageDealtToChampions')::int               AS "totalDamageDealtToChampions",
        (p.value->>'win')::boolean                                   AS "win",
        (rm."data"->'info'->>'gameCreation')::bigint                 AS "gameCreation"
      FROM "riot_match_cache" rm,
           jsonb_array_elements(rm."data"->'info'->'participants') AS p(value)
      WHERE rm."queueId" IN (420, 440)
        ${timeFilter}
        ${patchFilter}
        AND p.value->>'puuid' = ANY(${puuidSet})
    `;

    if (rows.length === 0) {
      this.logger.log(`LabRankedChampionSnapshot(${period}): 신규 row 없음`);
      return 0;
    }

    // champion × position 집계
    type AggKey = string; // `${championId}:${position|"ALL"}`
    const aggMap = new Map<
      AggKey,
      {
        games: number;
        wins: number;
        totalKda: number;
        totalDamage: number;
        maxGameCreation: number;
      }
    >();

    for (const row of rows) {
      const normalizedPosition = normalizeRiotPosition({
        teamPosition: row.position,
        individualPosition: row.individualPosition,
        lane: row.lane,
        role: row.role,
      });
      const pos = normalizedPosition !== "UNKNOWN" ? normalizedPosition : null;
      const kda =
        row.deaths === 0
          ? (row.kills + row.assists) * 1.0
          : (row.kills + row.assists) / row.deaths;

      for (const slotPos of [pos, null]) {
        const key: AggKey = `${row.championId}:${slotPos ?? "ALL"}`;
        const agg = aggMap.get(key) ?? {
          games: 0,
          wins: 0,
          totalKda: 0,
          totalDamage: 0,
          maxGameCreation: 0,
        };
        agg.games++;
        if (row.win) agg.wins++;
        agg.totalKda += kda;
        agg.totalDamage += Number(row.totalDamageDealtToChampions);
        agg.maxGameCreation = Math.max(
          agg.maxGameCreation,
          Number(row.gameCreation),
        );
        aggMap.set(key, agg);
      }
    }

    // 전체 표본 수(참가자 행 기준 분모)
    const totalGames = rows.length;
    const posGames = new Map<string, number>();
    for (const row of rows) {
      const normalizedPosition = normalizeRiotPosition({
        teamPosition: row.position,
        individualPosition: row.individualPosition,
        lane: row.lane,
        role: row.role,
      });
      if (normalizedPosition !== "UNKNOWN") {
        posGames.set(
          normalizedPosition,
          (posGames.get(normalizedPosition) ?? 0) + 1,
        );
      }
    }

    const allRows = Array.from(aggMap.entries())
      .filter(([, agg]) => agg.games >= 5)
      .map(([key, agg]) => {
        const [champIdStr, posStr] = key.split(":");
        const championId = Number(champIdStr);
        const position = posStr === "ALL" ? null : posStr;
        const avgKda = agg.totalKda / agg.games;
        const avgDamage = agg.totalDamage / agg.games;
        const confidence = getConfidenceLevel(agg.games);
        const denom = position
          ? (posGames.get(position) ?? 1)
          : totalGames || 1;
        const pickRate = agg.games / denom;
        const lastMatchCreatedAt = agg.maxGameCreation
          ? new Date(agg.maxGameCreation)
          : null;

        return {
          championId,
          position,
          games: agg.games,
          wins: agg.wins,
          avgKda,
          avgDamage,
          pickRate,
          wilsonLower: wilsonLower(agg.wins, agg.games),
          confidence,
          lastMatchCreatedAt,
          totalKda: agg.totalKda,
          totalDamage: agg.totalDamage,
        };
      });

    if (period !== "current_patch") {
      await this.prisma.$transaction([
        this.prisma.labRankedChampionSnapshot.deleteMany({
          where: { period },
        }),
        ...(allRows.length > 0
          ? [
              this.prisma.labRankedChampionSnapshot.createMany({
                data: allRows.map((row) => ({
                  period,
                  patchVersion: null,
                  championId: row.championId,
                  position: row.position,
                  games: row.games,
                  wins: row.wins,
                  avgKda: row.avgKda,
                  avgDamage: row.avgDamage,
                  pickRate: row.pickRate,
                  banRate: 0,
                  wilsonLower: row.wilsonLower,
                  confidence: row.confidence,
                  lastMatchCreatedAt: row.lastMatchCreatedAt,
                })),
              }),
            ]
          : []),
      ]);

      this.logger.log(
        `LabRankedChampionSnapshot(${period}): ${allRows.length}건 재생성, 원본 rows ${rows.length}건`,
      );
      return allRows.length;
    }

    let upserted = 0;
    for (const row of allRows) {
      const {
        championId,
        position,
        games,
        wins,
        avgKda,
        avgDamage,
        pickRate,
        wilsonLower: wilson,
        confidence,
        lastMatchCreatedAt,
        totalKda,
        totalDamage,
      } = row;

      // 증분 upsert: games/wins delta 합산
      const existing2 = await this.prisma.labRankedChampionSnapshot.findFirst({
        where: {
          period: "current_patch",
          patchVersion: targetPatchVersion,
          championId,
          position,
        },
      });

      if (existing2) {
        const newGames = existing2.games + games;
        const newWins = existing2.wins + wins;
        await this.prisma.labRankedChampionSnapshot.update({
          where: { id: existing2.id },
          data: {
            games: newGames,
            wins: newWins,
            avgKda: (existing2.avgKda * existing2.games + totalKda) / newGames,
            avgDamage:
              (existing2.avgDamage * existing2.games + totalDamage) / newGames,
            pickRate,
            banRate: 0,
            wilsonLower: wilsonLower(newWins, newGames),
            confidence: getConfidenceLevel(newGames),
            lastMatchCreatedAt,
            computedAt: new Date(),
          },
        });
      } else {
        await this.prisma.labRankedChampionSnapshot.create({
          data: {
            period: "current_patch",
            patchVersion: targetPatchVersion,
            championId,
            position,
            games,
            wins,
            avgKda,
            avgDamage,
            pickRate,
            banRate: 0,
            wilsonLower: wilson,
            confidence,
            lastMatchCreatedAt,
          },
        });
      }

      upserted++;
    }

    // 신규 패치 전환 감지: current_patch row 중 이전 patchVersion 레코드 정리
    if (period === "current_patch" && targetPatchVersion) {
      await this.prisma.labRankedChampionSnapshot.deleteMany({
        where: {
          period: "current_patch",
          patchVersion: { not: targetPatchVersion },
        },
      });
    }

    this.logger.log(
      `LabRankedChampionSnapshot(${period}): ${upserted}건 upsert, 원본 rows ${rows.length}건`,
    );
    return upserted;
  }

  /**
   * 랭크 스냅샷 API — period/position 필터
   * 외부 메타 참고용. 내전 LabChampionSnapshot과 분리된 데이터.
   */
  async getRankedChampionSnapshots(
    period: "7d" | "30d" | "current_patch",
    position?: string,
  ): Promise<{
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
    computedAt: Date | null;
  }> {
    // current_patch는 가장 최근 patchVersion만 반환
    let resolvedPatchVersion: string | undefined;
    if (period === "current_patch") {
      const latest = await this.prisma.labRankedChampionSnapshot.findFirst({
        where: { period: "current_patch" },
        orderBy: { computedAt: "desc" },
        select: { patchVersion: true },
      });
      if (latest?.patchVersion) resolvedPatchVersion = latest.patchVersion;
    }

    const rows = await this.prisma.labRankedChampionSnapshot.findMany({
      where: {
        period,
        ...(position ? { position } : {}),
        ...(resolvedPatchVersion ? { patchVersion: resolvedPatchVersion } : {}),
      },
      orderBy: { wilsonLower: "desc" },
    });

    const computedAt =
      rows.length > 0
        ? rows.reduce(
            (max, r) => (r.computedAt > max ? r.computedAt : max),
            rows[0].computedAt,
          )
        : null;

    const patchVersion =
      period === "current_patch" && rows.length > 0
        ? rows[0].patchVersion
        : null; // 7d/30d는 DB에 "" 저장이지만 응답에서는 null로 반환

    return {
      period,
      patchVersion,
      champions: rows.map((r) => ({
        championId: r.championId,
        position: r.position,
        games: r.games,
        wins: r.wins,
        winRate: r.games > 0 ? r.wins / r.games : 0,
        avgKda: r.avgKda,
        avgDamage: r.avgDamage,
        pickRate: r.pickRate,
        wilsonLower: r.wilsonLower,
        confidence: r.confidence,
      })),
      computedAt,
    };
  }

  // ─── Task 38: 시간대별/요일별 패턴 분석 ───

  /**
   * Match.completedAt 기준으로 요일(0=일~6=토) × 시간대(0~23)별 게임 수와 승률을 집계한다.
   * 내전은 저녁/야간에 집중되므로 시간대 편향이 승률에 영향을 미칠 수 있다.
   */
  async getPlayPatterns(period: "30d" | "90d" | "all"): Promise<{
    heatmap: Array<{
      dayOfWeek: number; // 0=일요일, 6=토요일 (KST 기준)
      hour: number; // 0~23 (KST 기준)
      games: number;
      wins: number; // 해당 시간대 첫 번째 팀 기준 win (게임 레벨 집계)
      winRate: number;
    }>;
    byDayOfWeek: Array<{
      dayOfWeek: number;
      dayLabel: string; // "월", "화", ... "일"
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
  }> {
    const cacheKey = `${LAB_CACHE_PREFIX}play-patterns:${period}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);
    const KST_OFFSET_HOURS = 9;

    // 매치별 completedAt, win을 가져와 KST 기준으로 요일/시간 분해
    const matches = await this.prisma.match.findMany({
      where: {
        completedAt: {
          not: null,
          ...(periodFilter ? { gte: periodFilter } : {}),
        },
      },
      select: { completedAt: true },
      orderBy: { completedAt: "asc" },
    });

    // heatmap: dayOfWeek × hour 집계
    const heatmapMap = new Map<string, { games: number }>();
    const dayMap = new Map<number, number>(); // dayOfWeek → games
    const hourMap = new Map<number, number>(); // hour → games

    for (const match of matches) {
      if (!match.completedAt) continue;
      const kst = new Date(
        match.completedAt.getTime() + KST_OFFSET_HOURS * 3600 * 1000,
      );
      const dow = kst.getUTCDay(); // 0=일, 6=토
      const hour = kst.getUTCHours();

      const heatKey = `${dow}:${hour}`;
      const existing = heatmapMap.get(heatKey) ?? { games: 0 };
      heatmapMap.set(heatKey, { games: existing.games + 1 });

      dayMap.set(dow, (dayMap.get(dow) ?? 0) + 1);
      hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
    }

    const totalGames = matches.length;

    // 기간 일수 계산
    let periodDays = 30;
    if (period === "90d") periodDays = 90;
    else if (period === "all" && matches.length > 0) {
      const first = matches[0].completedAt!;
      const last = matches[matches.length - 1].completedAt!;
      periodDays = Math.max(
        1,
        Math.ceil((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }

    const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
    const weeks = periodDays / 7;
    const byDayOfWeek = Array.from({ length: 7 }, (_, dow) => ({
      dayOfWeek: dow,
      dayLabel: DAY_LABELS[dow],
      games: dayMap.get(dow) ?? 0,
      avgGamesPerWeek:
        weeks > 0 ? Math.round(((dayMap.get(dow) ?? 0) / weeks) * 10) / 10 : 0,
    }));

    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      games: hourMap.get(h) ?? 0,
      avgGamesPerDay:
        periodDays > 0
          ? Math.round(((hourMap.get(h) ?? 0) / periodDays) * 100) / 100
          : 0,
    }));

    // heatmap 배열 변환 (winRate는 단순 0.5 placeholer — match 레벨 win은 teamStats에 있어 조인 비용 큼)
    const heatmap = Array.from(heatmapMap.entries()).map(([key, stats]) => {
      const [dowStr, hourStr] = key.split(":");
      return {
        dayOfWeek: Number(dowStr),
        hour: Number(hourStr),
        games: stats.games,
        wins: 0, // 매치 레벨 win 집계는 별도 쿼리 필요, 현재는 생략
        winRate: 0,
      };
    });

    // peak 계산
    const peakDayOfWeek = byDayOfWeek.reduce(
      (best, cur) => (cur.games > best.games ? cur : best),
      byDayOfWeek[0],
    ).dayOfWeek;
    const peakHour = byHour.reduce(
      (best, cur) => (cur.games > best.games ? cur : best),
      byHour[0],
    ).hour;

    const result = {
      heatmap,
      byDayOfWeek,
      byHour,
      peakDayOfWeek,
      peakHour,
      totalGames,
      periodDays,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 3600);
    return result;
  }

  // ─── Task 37: 유저 간 직접 대전 상성 분석 ───

  /**
   * 같은 커뮤니티 내 두 유저의 직접 대전 전적을 분석한다.
   * 동일 matchId에서 서로 다른 teamId를 가진 두 참가자를 찾아 집계.
   */
  async getHeadToHead(
    userAId: string,
    userBId: string,
  ): Promise<{
    userAId: string;
    userBId: string;
    totalGames: number;
    userAWins: number;
    userBWins: number;
    userAWinRate: number;
    userBWinRate: number;
    confidence: ConfidenceLevel;
    positionBreakdown: Array<{
      userAPosition: string;
      userBPosition: string;
      games: number;
      userAWins: number;
      userAWinRate: number;
    }>;
    recentMatches: Array<{
      matchId: string;
      completedAt: Date | null;
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
  }> {
    // 두 유저가 같은 matchId에 다른 팀으로 참가한 경기 조회
    const sharedMatches = await this.prisma.$queryRaw<
      Array<{
        matchId: string;
        completedAt: Date | null;
        aChampId: number;
        aChampName: string;
        aPos: string;
        aKills: number;
        aDeaths: number;
        aAssists: number;
        aWin: boolean;
        aTeamId: string;
        bChampId: number;
        bChampName: string;
        bPos: string;
        bKills: number;
        bDeaths: number;
        bAssists: number;
        bWin: boolean;
        bTeamId: string;
      }>
    >`
      SELECT
        a."matchId",
        m."completedAt",
        a."championId"   AS "aChampId",
        a."championName" AS "aChampName",
        a."position"     AS "aPos",
        a."kills"        AS "aKills",
        a."deaths"       AS "aDeaths",
        a."assists"      AS "aAssists",
        a."win"          AS "aWin",
        a."teamId"       AS "aTeamId",
        b."championId"   AS "bChampId",
        b."championName" AS "bChampName",
        b."position"     AS "bPos",
        b."kills"        AS "bKills",
        b."deaths"       AS "bDeaths",
        b."assists"      AS "bAssists",
        b."win"          AS "bWin",
        b."teamId"       AS "bTeamId"
      FROM "match_participants" a
      JOIN "match_participants" b
        ON a."matchId" = b."matchId"
       AND (
         (a."teamId" IS NOT NULL AND b."teamId" IS NOT NULL AND a."teamId" <> b."teamId")
         OR (a."teamId" IS NULL AND b."teamId" IS NULL AND a."win" <> b."win")
       )
      JOIN "matches" m ON m."id" = a."matchId"
      WHERE a."userId" = ${userAId}
        AND b."userId" = ${userBId}
        AND m."completedAt" IS NOT NULL
      ORDER BY m."completedAt" DESC
    `;

    const totalGames = sharedMatches.length;
    if (totalGames === 0) {
      return {
        userAId,
        userBId,
        totalGames: 0,
        userAWins: 0,
        userBWins: 0,
        userAWinRate: 0,
        userBWinRate: 0,
        confidence: "insufficient",
        positionBreakdown: [],
        recentMatches: [],
      };
    }

    const userAWins = sharedMatches.filter((m) => m.aWin).length;
    const userBWins = totalGames - userAWins;

    // 포지션 조합별 집계
    const posMap = new Map<string, { games: number; userAWins: number }>();
    for (const row of sharedMatches) {
      const key = `${row.aPos}|${row.bPos}`;
      const existing = posMap.get(key) ?? { games: 0, userAWins: 0 };
      posMap.set(key, {
        games: existing.games + 1,
        userAWins: existing.userAWins + (row.aWin ? 1 : 0),
      });
    }

    const positionBreakdown = Array.from(posMap.entries())
      .map(([key, stats]) => {
        const [userAPosition, userBPosition] = key.split("|");
        return {
          userAPosition,
          userBPosition,
          games: stats.games,
          userAWins: stats.userAWins,
          userAWinRate: stats.games > 0 ? stats.userAWins / stats.games : 0,
        };
      })
      .sort((a, b) => b.games - a.games);

    // 최근 5경기
    const recentMatches = sharedMatches.slice(0, 5).map((row) => ({
      matchId: row.matchId,
      completedAt: row.completedAt,
      userAChampionId: Number(row.aChampId),
      userAChampionName: row.aChampName,
      userAPosition: row.aPos,
      userAKills: Number(row.aKills),
      userADeaths: Number(row.aDeaths),
      userAAssists: Number(row.aAssists),
      userAWin: row.aWin,
      userBChampionId: Number(row.bChampId),
      userBChampionName: row.bChampName,
      userBPosition: row.bPos,
      userBKills: Number(row.bKills),
      userBDeaths: Number(row.bDeaths),
      userBAssists: Number(row.bAssists),
      userBWin: row.bWin,
    }));

    return {
      userAId,
      userBId,
      totalGames,
      userAWins,
      userBWins,
      userAWinRate: userAWins / totalGames,
      userBWinRate: userBWins / totalGames,
      confidence: getConfidenceLevel(totalGames),
      positionBreakdown,
      recentMatches,
    };
  }
}
