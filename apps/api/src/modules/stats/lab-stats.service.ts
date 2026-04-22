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
import { aggregateCustomMatchStats } from "./utils/custom-match-aggregator";

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

export interface LabChampionDetailResponse {
  championId: number;
  championName: string;
  championNameKorean: string;
  period: "30d" | "90d" | "all";
  totals: {
    games: number;
    wins: number;
    winRate: number;
  };
  winrateTrend: LabChampionWinrateTrendPoint[]; // 데이터 포인트 3개 미만이면 빈 배열
  trendInsufficient: boolean;
  positions: LabChampionPositionRow[];
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
  badges: LabChampionMasteryBadge[];
}

export interface LabChampionMasteryResponse {
  championId: number;
  championName: string;
  championNameKorean: string;
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
  games: number;
  wins: number;
  winRate: number;
  wilsonLower: number;
  expectedWinRate: number;
  deltaWinRate: number;
  confidenceLevel: ConfidenceLevel;
  badges: Array<"시너지 효과 있음">;
}

export interface LabSynergyResponse {
  period: Period;
  championId: number | null;
  source: "snapshot" | "realtime";
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
  | "TANK_LINE";

export interface LabCompositionRow {
  type: LabCompositionType;
  label: string;
  games: number;
  wins: number;
  winRate: number;
  pickRate: number;
  avgGameDurationSec: number;
  confidenceLevel: ConfidenceLevel;
}

export interface LabCompositionsResponse {
  period: Period;
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
}

export interface LabAuctionEfficiencyResponse {
  period: Period;
  source: "realtime";
  sampleSize: {
    users: number;
    games: number;
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
const PERIODS: Period[] = ["30d", "90d", "all"];
const POSITIONS = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT", null] as const;

// ─── 최소 게임 수 임계값 ───

const MIN_GAMES_CHAMPION = 5;
const MIN_GAMES_SYNERGY = 3;
const MIN_GAMES_COUNTER = 3;
const MASTERY_TOP_LIMIT = 50;

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

    for (const period of PERIODS) {
      const periodFilter = this.getPeriodFilter(period);

      // 해당 기간 전체 매치 수 계산 (픽률 분모)
      const totalMatchesResult = await this.prisma.$queryRaw<
        { count: bigint }[]
      >(Prisma.sql`
        SELECT COUNT(DISTINCT mp."matchId")::bigint AS count
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
      `);
      const totalMatches = Number(totalMatchesResult[0]?.count ?? 0);

      if (totalMatches === 0) {
        this.logger.log(`챔피언 스냅샷 [${period}]: 매치 없음, 건너뜀`);
        continue;
      }

      // 밴 횟수 집계 (전체 기간용)
      const banCountsResult = await this.prisma.$queryRaw<
        { championId: number; banCount: bigint }[]
      >(Prisma.sql`
        SELECT
          ban_id::int AS "championId",
          COUNT(*)::bigint AS "banCount"
        FROM (
          SELECT jsonb_array_elements(mts."bans")::int AS ban_id
          FROM "match_team_stats" mts
          INNER JOIN "matches" m ON m."id" = mts."matchId"
          WHERE m."completedAt" IS NOT NULL
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
              period_patchVersion_championId_position: {
                period,
                patchVersion: currentPatchVersion ?? "",
                championId: row.championId,
                position: position ?? "",
              },
            },
            create: {
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
        }
      }

      this.logger.log(
        `챔피언 스냅샷 [${period}] 완료: ${totalUpserted}건 upsert`,
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
          AND a."teamId" = b."teamId"
          AND a."id" < b."id"
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
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
          AND a."teamId" <> b."teamId"
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
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
          AND a."teamId" <> b."teamId"
          AND a."position" = b."position"
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
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
      // 스냅샷 우선 조회
      const snapshots = await this.prisma.labChampionSnapshot.findMany({
        where: {
          period,
          position,
          games: { gte: MIN_GAMES_CHAMPION },
        },
        orderBy: { wilsonLower: "desc" },
      });

      if (snapshots.length === 0) {
        result[position] = [];
        continue;
      }

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

        return {
          championId: s.championId,
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
    buffed: any[];
    nerfed: any[];
    insufficient: boolean;
  }> {
    const cacheKey = this.labCacheKey("meta:patch-impact");
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // 최근 2개 패치 버전 조회
    const patches = await this.prisma.$queryRaw<
      { patchVersion: string }[]
    >(Prisma.sql`
      SELECT DISTINCT "patchVersion"
      FROM "matches"
      WHERE "patchVersion" IS NOT NULL
        AND "completedAt" IS NOT NULL
      ORDER BY "patchVersion" DESC
      LIMIT 2
    `);

    if (patches.length < 2) {
      const result = {
        currentPatch: patches[0]?.patchVersion ?? null,
        previousPatch: null,
        buffed: [],
        nerfed: [],
        insufficient: true,
      };
      await this.redis.set(cacheKey, JSON.stringify(result), 3600);
      return result;
    }

    const currentPatch = patches[0].patchVersion;
    const previousPatch = patches[1].patchVersion;

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
        HAVING COUNT(*) >= 3
      ),
      prev_patch AS (
        SELECT mp."championId",
               SUM(CASE WHEN mp."win" THEN 1 ELSE 0 END)::bigint AS wins,
               COUNT(*)::bigint AS games
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."patchVersion" = ${previousPatch}
        GROUP BY mp."championId"
        HAVING COUNT(*) >= 3
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
        championNameKorean: getChampionKoreanName(row.championName),
        currentWinRate: Math.round(currentWinRate * 1000) / 10,
        prevWinRate: Math.round(prevWinRate * 1000) / 10,
        deltaWinRate: Math.round(deltaWinRate * 1000) / 10,
        currentGames: Number(row.currentGames),
        prevGames: Number(row.prevGames),
      };
    });

    impacts.sort((a, b) => b.deltaWinRate - a.deltaWinRate);

    const result = {
      currentPatch,
      previousPatch,
      buffed: impacts.slice(0, 5),
      nerfed: impacts.slice(-5).reverse(),
      insufficient: false,
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
  ): Promise<{
    period: Period;
    position: string | null;
    includeLowSample: boolean;
    source: "snapshot" | "realtime";
    champions: LabChampionListRow[];
  }> {
    const normalizedPosition = position?.trim() || null;
    const minGames = includeLowSample ? 1 : MIN_GAMES_CHAMPION;
    const cacheKey = this.labCacheKey(
      `champions:${period}:${normalizedPosition ?? "all"}:${includeLowSample ? "all-samples" : "stable-only"}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const snapshotRows = includeLowSample
      ? []
      : await this.prisma.labChampionSnapshot.findMany({
          where: {
            period,
            position: normalizedPosition,
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
        source: "snapshot" as const,
        champions,
      };
      await this.redis.set(cacheKey, JSON.stringify(result), 1800);
      return result;
    }

    const periodFilter = this.getPeriodFilter(period);
    const [totalMatchesResult, banCountsResult, aggregateRows] =
      await Promise.all([
        this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
          SELECT COUNT(DISTINCT mp."matchId")::bigint AS count
          FROM "match_participants" mp
          INNER JOIN "matches" m ON m."id" = mp."matchId"
          WHERE m."completedAt" IS NOT NULL
            ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        `),
        this.prisma.$queryRaw<{ championId: number; banCount: bigint }[]>(
          Prisma.sql`
            SELECT
              ban_id::int AS "championId",
              COUNT(*)::bigint AS "banCount"
            FROM (
              SELECT jsonb_array_elements(mts."bans")::int AS ban_id
              FROM "match_team_stats" mts
              INNER JOIN "matches" m ON m."id" = mts."matchId"
              WHERE m."completedAt" IS NOT NULL
                ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
            ) bans
            WHERE ban_id > 0
            GROUP BY ban_id
          `,
        ),
        aggregateCustomMatchStats(this.prisma, {
          period,
          position: normalizedPosition,
          groupBy: "champion",
          minGames,
          dateField: "completedAt",
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
  ): Promise<LabChampionDetailResponse | null> {
    const cacheKey = this.labCacheKey(
      `champion:detail:${championId}:${period}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);

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

    // 3) 포지션 분포 — 스냅샷 우선, 미스 시 실시간 집계
    const positionSnapshots = await this.prisma.labChampionSnapshot.findMany({
      where: {
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
        perks: true,
      },
    });

    // 아이템 2-조합 집계 — 완성 아이템만, 정규화된 (low, high) 튜플
    const itemComboCounter = new Map<
      string,
      { itemIds: [number, number]; games: number; wins: number }
    >();

    for (const p of participants) {
      const itemsOnParticipant = [
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
      period,
      totals: {
        games: totalGames,
        wins: totalWins,
        winRate: totalWinRate,
      },
      winrateTrend,
      trendInsufficient,
      positions,
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
  ): Promise<LabSynergyResponse> {
    const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const normalizedChampionId =
      typeof championId === "number" &&
      Number.isInteger(championId) &&
      championId > 0
        ? championId
        : null;
    const cacheKey = this.labCacheKey(
      `synergy:${period}:${normalizedChampionId ?? "all"}:${normalizedLimit}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);

    // 챔피언 단일 승률 맵 (expected win rate 계산용)
    const championRates = await this.prisma.$queryRaw<
      { championId: number; games: bigint; wins: bigint }[]
    >(Prisma.sql`
      SELECT
        mp."championId" AS "championId",
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE m."completedAt" IS NOT NULL
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
      GROUP BY mp."championId"
    `);

    const championWinRateMap = new Map<number, number>();
    for (const row of championRates) {
      const games = Number(row.games);
      const wins = Number(row.wins);
      championWinRateMap.set(row.championId, games > 0 ? wins / games : 0);
    }

    const snapshotWhere: Prisma.LabSynergySnapshotWhereInput = {
      period,
      ...(normalizedChampionId
        ? {
            OR: [
              { champ1Id: normalizedChampionId },
              { champ2Id: normalizedChampionId },
            ],
          }
        : {}),
    };
    const snapshots = await this.prisma.labSynergySnapshot.findMany({
      where: snapshotWhere,
      orderBy: { wilsonLower: "desc" },
      take: normalizedLimit,
    });

    let rowsSource: "snapshot" | "realtime" = "snapshot";
    let rows = snapshots.map((row) => ({
      champ1Id: row.champ1Id,
      champ2Id: row.champ2Id,
      games: row.games,
      wins: row.wins,
      winRate: row.winRate,
      wilsonLower: row.wilsonLower,
    }));

    // 스냅샷 미스 시 실시간 fallback
    if (rows.length === 0) {
      rowsSource = "realtime";
      const realtimeRows = await this.prisma.$queryRaw<
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
          COUNT(*)::bigint AS "games",
          COUNT(*) FILTER (WHERE a."win" = true)::bigint AS "wins"
        FROM "match_participants" a
        INNER JOIN "match_participants" b
          ON a."matchId" = b."matchId"
          AND a."teamId" = b."teamId"
          AND a."id" < b."id"
        INNER JOIN "matches" m ON m."id" = a."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
          ${
            normalizedChampionId
              ? Prisma.sql`AND (a."championId" = ${normalizedChampionId} OR b."championId" = ${normalizedChampionId})`
              : Prisma.empty
          }
        GROUP BY 1, 2
        HAVING COUNT(*) >= ${MIN_GAMES_SYNERGY}
        ORDER BY COUNT(*) DESC
        LIMIT ${normalizedLimit}
      `);

      rows = realtimeRows.map((row) => {
        const games = Number(row.games);
        const wins = Number(row.wins);
        return {
          champ1Id: row.champ1Id,
          champ2Id: row.champ2Id,
          games,
          wins,
          winRate: games > 0 ? wins / games : 0,
          wilsonLower: wilsonLower(wins, games),
        };
      });
    }

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
        const champ1Rate = championWinRateMap.get(row.champ1Id) ?? 0;
        const champ2Rate = championWinRateMap.get(row.champ2Id) ?? 0;
        const expectedWinRate = Math.min((champ1Rate * champ2Rate) / 0.5, 1);
        const deltaWinRate = row.winRate - expectedWinRate;
        const isSynergyEffective =
          row.games >= 5 && row.wilsonLower > expectedWinRate;
        const champ1Name =
          championNameMap.get(row.champ1Id) ?? String(row.champ1Id);
        const champ2Name =
          championNameMap.get(row.champ2Id) ?? String(row.champ2Id);

        return {
          champ1Id: row.champ1Id,
          champ2Id: row.champ2Id,
          champ1NameKorean: getChampionKoreanName(champ1Name),
          champ2NameKorean: getChampionKoreanName(champ2Name),
          games: row.games,
          wins: row.wins,
          winRate: Math.round(row.winRate * 10000) / 10000,
          wilsonLower: Math.round(row.wilsonLower * 1000000) / 1000000,
          expectedWinRate: Math.round(expectedWinRate * 10000) / 10000,
          deltaWinRate: Math.round(deltaWinRate * 10000) / 10000,
          confidenceLevel: getConfidenceLevel(row.games),
          badges: isSynergyEffective ? ["시너지 효과 있음"] : [],
        } satisfies LabSynergyRow;
      })
      .sort((a, b) => b.wilsonLower - a.wilsonLower)
      .slice(0, normalizedLimit);

    const result: LabSynergyResponse = {
      period,
      championId: normalizedChampionId,
      source: rowsSource,
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
          AND a."teamId" <> b."teamId"
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
  ): Promise<LabCompositionsResponse> {
    const cacheKey = this.labCacheKey(`compositions:${period}`);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const periodFilter = this.getPeriodFilter(period);

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
          mp."teamId" AS "teamId",
          BOOL_OR(mp."win") AS "win",
          MIN(m."gameDuration") AS "gameDurationSec",
          ARRAY_AGG(mp."championId")::int[] AS "championIds"
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE m."completedAt" IS NOT NULL
          ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
        GROUP BY mp."matchId", mp."teamId"
      `),
    ]);

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
      const winRate = games > 0 ? wins / games : 0;
      if (winRate >= 0.52) {
        earlyAggroChampionSet.add(row.championId);
      }
    }

    type TeamCompositionEval = {
      type: LabCompositionType;
      score: number;
      matched: boolean;
    };

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
      const evaluations: TeamCompositionEval[] = [
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
        {
          type: "TANK_LINE",
          score: tank / 5,
          matched: tank >= 3,
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
      return target[0].type;
    };

    const aggregate = new Map<
      LabCompositionType,
      {
        games: number;
        wins: number;
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
    ];
    for (const type of allTypes) {
      aggregate.set(type, {
        games: 0,
        wins: 0,
        durationSum: 0,
        durationCount: 0,
      });
    }

    for (const team of teamRows) {
      const type = classifyTeam(team.championIds, team.gameDurationSec);
      const bucket = aggregate.get(type)!;
      bucket.games += 1;
      if (team.win) bucket.wins += 1;
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
    };

    const totalTeams = teamRows.length;
    const rows: LabCompositionRow[] = allTypes
      .map((type) => {
        const bucket = aggregate.get(type)!;
        const winRate = bucket.games > 0 ? bucket.wins / bucket.games : 0;
        const pickRate = totalTeams > 0 ? bucket.games / totalTeams : 0;
        const avgGameDurationSec =
          bucket.durationCount > 0
            ? Math.round(bucket.durationSum / bucket.durationCount)
            : 0;
        return {
          type,
          label: labels[type],
          games: bucket.games,
          wins: bucket.wins,
          winRate: Math.round(winRate * 10000) / 10000,
          pickRate: Math.round(pickRate * 10000) / 10000,
          avgGameDurationSec,
          confidenceLevel: getConfidenceLevel(bucket.games),
        } satisfies LabCompositionRow;
      })
      .sort((a, b) => b.winRate - a.winRate);

    const result: LabCompositionsResponse = {
      period,
      source: "realtime",
      totalTeams,
      topTypes: rows.slice(0, 3),
      rows,
      caveat:
        "챔피언 태그 기반 근사 분류이며 실제 팀 전략과 차이가 있을 수 있습니다.",
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

    const rows = await this.prisma.$queryRaw<
      {
        userId: string;
        username: string;
        soldPrice: number;
        games: bigint;
        wins: bigint;
        avgKda: number;
        avgDamageShare: number;
      }[]
    >(Prisma.sql`
      WITH team_totals AS (
        SELECT
          mp."matchId",
          mp."teamId",
          SUM(mp."totalDamageDealtToChampions")::float AS "teamDamage"
        FROM "match_participants" mp
        GROUP BY mp."matchId", mp."teamId"
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
        MIN(u."username") AS "username",
        ROUND(AVG(ae."soldPrice"), 2)::float AS "soldPrice",
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins",
        ROUND(AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1)), 4)::float AS "avgKda",
        ROUND(AVG(
          CASE WHEN tt."teamDamage" > 0
            THEN mp."totalDamageDealtToChampions"::float / tt."teamDamage"
            ELSE 0
          END
        ), 6)::float AS "avgDamageShare"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      INNER JOIN "users" u ON u."id" = mp."userId"
      INNER JOIN team_totals tt
        ON tt."matchId" = mp."matchId"
       AND tt."teamId" = mp."teamId"
      INNER JOIN auction_entries ae
        ON ae."roomId" = m."roomId"
       AND ae."userId" = mp."userId"
      WHERE m."completedAt" IS NOT NULL
        ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
      GROUP BY mp."userId"
      HAVING COUNT(*) >= 3
    `);

    const normalized = rows.map((row) => {
      const games = Number(row.games);
      const wins = Number(row.wins);
      const winRate = games > 0 ? wins / games : 0;
      return {
        userId: row.userId,
        username: row.username,
        soldPrice: row.soldPrice,
        games,
        wins,
        winRate,
        avgKda: row.avgKda,
        avgDamageShare: row.avgDamageShare,
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

    const bins = [
      { label: "0~99", min: 0, max: 99 },
      { label: "100~199", min: 100, max: 199 },
      { label: "200~399", min: 200, max: 399 },
      { label: "400~599", min: 400, max: 599 },
      { label: "600+", min: 600, max: null as number | null },
    ];

    const buckets: AuctionEfficiencyBucket[] = bins.map((bin) => {
      const inBin = withResidual.filter((row) =>
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

    const scatter: AuctionEfficiencyPoint[] = withResidual.map((row) => ({
      userId: row.userId,
      username: row.username,
      soldPrice: Math.round(row.soldPrice),
      performance: Math.round(row.performance * 10000) / 10000,
      expectedPerformance: Math.round(row.expectedPerformance * 10000) / 10000,
      efficiency: Math.round(row.efficiency * 10000) / 10000,
    }));

    const toLeader = (
      row: (typeof withResidual)[number],
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
    });

    const efficiencyTop = withResidual
      .filter((r) => residualStdDev <= 0 || r.efficiency > residualStdDev)
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, 5)
      .map(toLeader);

    const overpricedTop = withResidual
      .filter((r) => residualStdDev <= 0 || r.efficiency < -residualStdDev)
      .sort((a, b) => a.efficiency - b.efficiency)
      .slice(0, 5)
      .map(toLeader);

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
      regression: {
        beta0: Math.round(beta0 * 1000000) / 1000000,
        beta1: Math.round(beta1 * 1000000) / 1000000,
        residualStdDev: Math.round(residualStdDev * 1000000) / 1000000,
      },
      buckets,
      scatter,
      efficiencyTop,
      overpricedTop,
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
          mp."teamId",
          SUM(mp."totalDamageDealtToChampions")::float AS "teamDamage"
        FROM "match_participants" mp
        GROUP BY mp."matchId", mp."teamId"
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
       AND tt."teamId" = mp."teamId"
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
        mp."teamId" AS "teamId",
        BOOL_OR(mp."win") AS "win",
        ARRAY_AGG(mp."userId") AS "userIds"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE m."completedAt" IS NOT NULL
        AND mp."userId" IN (${Prisma.join(allUsers)})
      GROUP BY mp."matchId", mp."teamId"
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
      ORDER BY lcs."championId", lcs."computedAt" DESC
    `);

    const championIds = Array.from(
      new Set(masteryRows.map((r) => r.championId)),
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
    const championNameById = new Map(
      championNameRows.map((r) => [r.championId, r.championName]),
    );

    const sortedMeta = [...metaRows].sort(
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
          byTeam: {
            teamA: buildForTargets(teamBUserIds),
            teamB: buildForTargets(teamAUserIds),
          },
        }
      : {
          period,
          mode: "global",
          recommendations: buildForTargets(userIds),
        };

    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }

  // ─── Task 14: 챔피언 장인 목록 (동적 티어 완화 + masteryScore) ───

  async getChampionMastery(
    championId: number,
  ): Promise<LabChampionMasteryResponse> {
    const cacheKey = this.labCacheKey(`champion:mastery:${championId}`);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

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
          mp."teamId",
          SUM(mp."totalDamageDealtToChampions")::float AS "teamDamage",
          SUM(mp."visionScore")::float AS "teamVision"
        FROM "match_participants" mp
        GROUP BY mp."matchId", mp."teamId"
      )
      SELECT
        mp."userId" AS "userId",
        MIN(mp."championName") AS "championName",
        COUNT(*)::bigint AS "games",
        COUNT(*) FILTER (WHERE mp."win" = true)::bigint AS "wins",
        ROUND(AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1)), 4)::float AS "avgKda",
        ROUND(AVG(
          CASE WHEN tt."teamDamage" > 0
            THEN mp."totalDamageDealtToChampions"::float / tt."teamDamage"
            ELSE 0
          END
        ), 6)::float AS "avgDamageShare",
        ROUND(AVG(
          CASE WHEN tt."teamVision" > 0
            THEN mp."visionScore"::float / tt."teamVision"
            ELSE 0
          END
        ), 6)::float AS "avgVisionShare",
        MAX(m."completedAt") AS "lastPlayedAt"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      INNER JOIN team_totals tt
        ON tt."matchId" = mp."matchId"
       AND tt."teamId" = mp."teamId"
      WHERE m."completedAt" IS NOT NULL
        AND mp."championId" = ${championId}
      GROUP BY mp."userId"
    `);

    const totalUniquePlayersOnChamp = championRows.length;
    const championName = championRows[0]?.championName ?? String(championId);

    if (championRows.length === 0) {
      const empty: LabChampionMasteryResponse = {
        championId,
        championName,
        championNameKorean: getChampionKoreanName(championName),
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
      await this.redis.set(cacheKey, JSON.stringify(empty), 1800);
      return empty;
    }

    const userIds = championRows.map((r) => r.userId);
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
          ROUND(AVG(ae."soldPrice"), 2)::float AS "avgSoldPrice"
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
      const badges: LabChampionMasteryBadge[] = [];
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

    const result: LabChampionMasteryResponse = {
      championId,
      championName,
      championNameKorean: getChampionKoreanName(championName),
      appliedCriteria,
      totalUniquePlayersOnChamp,
      qualifiedCount: qualified.length,
      insufficient,
      masteries,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
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
          AND "queue_id" IN (420, 440)
          AND "game_end" >= NOW() - INTERVAL '7 days'
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
        (p.value->>'kills')::int                                     AS "kills",
        (p.value->>'deaths')::int                                    AS "deaths",
        (p.value->>'assists')::int                                   AS "assists",
        (p.value->>'totalDamageDealtToChampions')::int               AS "totalDamageDealtToChampions",
        (p.value->>'win')::boolean                                   AS "win",
        (rm."data"->'info'->>'gameCreation')::bigint                 AS "gameCreation"
      FROM "riot_match_cache" rm,
           jsonb_array_elements(rm."data"->'info'->'participants') AS p(value)
      WHERE rm."queue_id" IN (420, 440)
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
      const pos = row.position && row.position !== "" ? row.position : null;
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

    // 전체 게임 수 (포지션 슬롯 기준 분모)
    const totalGames = rows.filter(
      (r) => r.position === null || r.position === "",
    ).length;
    const posGames = new Map<string, number>();
    for (const row of rows) {
      if (row.position) {
        posGames.set(row.position, (posGames.get(row.position) ?? 0) + 1);
      }
    }

    let upserted = 0;
    for (const [key, agg] of aggMap.entries()) {
      if (agg.games < 5) continue; // insufficient — 저장 안 함

      const [champIdStr, posStr] = key.split(":");
      const championId = Number(champIdStr);
      const position = posStr === "ALL" ? null : posStr;

      const avgKda = agg.totalKda / agg.games;
      const avgDamage = agg.totalDamage / agg.games;
      const wilson = wilsonLower(agg.wins, agg.games);
      const confidence = getConfidenceLevel(agg.games);

      const denom = position ? (posGames.get(position) ?? 1) : totalGames || 1;
      const pickRate = agg.games / (denom * 10); // 10명 중 1명 픽 기준

      const lastMatchCreatedAt = agg.maxGameCreation
        ? new Date(agg.maxGameCreation)
        : null;

      if (period === "current_patch" && targetPatchVersion) {
        // 증분 upsert: games/wins delta 합산
        const existing2 = await this.prisma.labRankedChampionSnapshot.findFirst(
          {
            where: {
              period: "current_patch",
              patchVersion: targetPatchVersion,
              championId,
              position,
            },
          },
        );

        if (existing2) {
          const newGames = existing2.games + agg.games;
          const newWins = existing2.wins + agg.wins;
          await this.prisma.labRankedChampionSnapshot.update({
            where: { id: existing2.id },
            data: {
              games: newGames,
              wins: newWins,
              avgKda:
                (existing2.avgKda * existing2.games + agg.totalKda) / newGames,
              avgDamage:
                (existing2.avgDamage * existing2.games + agg.totalDamage) /
                newGames,
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
              games: agg.games,
              wins: agg.wins,
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
      } else {
        // 전체 재계산 upsert (null → "" 변환으로 unique key 처리)
        await this.prisma.labRankedChampionSnapshot.upsert({
          where: {
            period_patchVersion_championId_position: {
              period,
              patchVersion: "", // null 대신 빈 문자열로 unique key 처리
              championId,
              position: position ?? "",
            },
          },
          create: {
            period,
            patchVersion: "", // null 대신 빈 문자열 — unique key sentinel
            championId,
            position,
            games: agg.games,
            wins: agg.wins,
            avgKda,
            avgDamage,
            pickRate,
            banRate: 0,
            wilsonLower: wilson,
            confidence,
            lastMatchCreatedAt,
          },
          update: {
            games: agg.games,
            wins: agg.wins,
            avgKda,
            avgDamage,
            pickRate,
            banRate: 0,
            wilsonLower: wilson,
            confidence,
            lastMatchCreatedAt,
            computedAt: new Date(),
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
       AND a."teamId"  != b."teamId"
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
