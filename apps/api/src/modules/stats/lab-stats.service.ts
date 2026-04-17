import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { wilsonLower, getConfidenceLevel, ConfidenceLevel } from "@nexus/types";
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

@Injectable()
export class LabStatsService {
  private readonly logger = new Logger(LabStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
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
  ): Promise<{
    period: Period;
    position: string | null;
    source: "snapshot" | "realtime";
    champions: LabChampionListRow[];
  }> {
    const normalizedPosition = position?.trim() || null;
    const cacheKey = this.labCacheKey(
      `champions:${period}:${normalizedPosition ?? "all"}`,
    );
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const snapshotRows = await this.prisma.labChampionSnapshot.findMany({
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
          minGames: MIN_GAMES_CHAMPION,
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
      source: "realtime" as const,
      champions,
    };
    await this.redis.set(cacheKey, JSON.stringify(result), 1800);
    return result;
  }
}
