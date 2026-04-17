import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { wilsonLower, ConfidenceLevel } from "@nexus/types";

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
        // 챔피언별 통계 집계
        const rows = await this.prisma.$queryRaw<
          {
            championId: number;
            games: bigint;
            wins: bigint;
            avgKda: number;
            avgDamage: number;
            avgGold: number;
          }[]
        >(Prisma.sql`
          SELECT
            mp."championId",
            COUNT(*)::bigint AS games,
            SUM(CASE WHEN mp."win" THEN 1 ELSE 0 END)::bigint AS wins,
            ROUND(AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1)), 4)::float AS "avgKda",
            ROUND(AVG(mp."totalDamageDealtToChampions"), 2)::float AS "avgDamage",
            ROUND(AVG(mp."goldEarned"), 2)::float AS "avgGold"
          FROM "match_participants" mp
          INNER JOIN "matches" m ON m."id" = mp."matchId"
          WHERE m."completedAt" IS NOT NULL
            ${periodFilter ? Prisma.sql`AND m."completedAt" >= ${periodFilter}` : Prisma.empty}
            ${position !== null ? Prisma.sql`AND mp."position" = ${position}` : Prisma.empty}
          GROUP BY mp."championId"
          HAVING COUNT(*) >= ${MIN_GAMES_CHAMPION}
        `);

        for (const row of rows) {
          const games = Number(row.games);
          const wins = Number(row.wins);
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
}
