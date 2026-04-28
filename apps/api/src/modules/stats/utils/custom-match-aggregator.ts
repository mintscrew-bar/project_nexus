import { Prisma, PrismaClient } from "@prisma/client";

export type CustomMatchPeriod = "30d" | "90d" | "all";
export type CustomMatchGroupBy =
  | "champion"
  | "champion+position"
  | "user+champion";

/**
 * 데이터 소스 구분 — 같은 match_participants 테이블에 내전/외부 ranked가 섞여 있어
 * 통계 집계 시 source 분리가 필수.
 *
 * - 'custom'           = 내전 (matches.roomId IS NOT NULL)
 * - 'ranked-community' = 외부 ranked 매치 (roomId NULL & riotMatchId IS NOT NULL)
 * - 'all'              = 분리 없이 전체 (기존 동작 유지용 — 새 호출은 자제)
 */
export type MatchStatsSource = "custom" | "ranked-community" | "all";

type CustomAggregationClient = Pick<PrismaClient, "$queryRaw">;

export interface AggregateCustomMatchStatsOptions {
  userId?: string;
  period?: CustomMatchPeriod;
  fromDate?: Date;
  position?: string | null;
  groupBy: CustomMatchGroupBy;
  minGames?: number;
  dateField?: "createdAt" | "completedAt";
  /**
   * 데이터 소스. 미지정 시 'all' (호환용). 새 호출은 명시적으로 'custom' 또는
   * 'ranked-community'를 지정해야 한다.
   */
  source?: MatchStatsSource;
}

export interface CustomMatchAggregateRow {
  userId: string | null;
  championId: number;
  championName: string | null;
  position: string | null;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  avgKda: number;
  avgDamage: number;
  avgGold: number;
}

function getPeriodStart(period?: CustomMatchPeriod): Date | null {
  if (!period || period === "all") {
    return null;
  }

  const days = period === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildSourceFilter(source?: MatchStatsSource): Prisma.Sql {
  // 소스 미지정 시 분리 없이 전체 (호환). 새 호출은 명시적으로 지정해야 함.
  if (!source || source === "all") return Prisma.empty;
  if (source === "custom") {
    // 내전: roomId가 있는 매치 (Nexus 내부 토너먼트)
    return Prisma.sql`AND m."roomId" IS NOT NULL`;
  }
  // ranked-community: 외부 ranked 매치 — roomId 없고 riotMatchId 있는 매치
  return Prisma.sql`AND m."roomId" IS NULL AND m."riotMatchId" IS NOT NULL`;
}

function buildWhereSql(options: AggregateCustomMatchStatsOptions): Prisma.Sql {
  const dateField = options.dateField ?? "completedAt";
  const fromDate = options.fromDate ?? getPeriodStart(options.period);
  const dateColumn = Prisma.raw(`m."${dateField}"`);
  const sourceFilter = buildSourceFilter(options.source);

  return Prisma.sql`
    WHERE ${dateColumn} IS NOT NULL
      ${fromDate ? Prisma.sql`AND ${dateColumn} >= ${fromDate}` : Prisma.empty}
      ${sourceFilter}
      ${options.userId ? Prisma.sql`AND mp."userId" = ${options.userId}` : Prisma.empty}
      ${
        options.position === undefined
          ? Prisma.empty
          : options.position === null
            ? Prisma.sql`AND mp."position" IS NULL`
            : Prisma.sql`AND mp."position" = ${options.position}`
      }
  `;
}

export async function aggregateCustomMatchStats(
  prisma: CustomAggregationClient,
  options: AggregateCustomMatchStatsOptions,
): Promise<CustomMatchAggregateRow[]> {
  const whereSql = buildWhereSql(options);
  const minGames = options.minGames ?? 1;

  if (options.groupBy === "champion") {
    const rows = await prisma.$queryRaw<
      {
        championId: number;
        championName: string;
        games: bigint;
        wins: bigint;
        kills: number;
        deaths: number;
        assists: number;
        avgKda: number;
        avgDamage: number;
        avgGold: number;
      }[]
    >(Prisma.sql`
      SELECT
        mp."championId" AS "championId",
        MIN(mp."championName") AS "championName",
        COUNT(*)::bigint AS games,
        SUM(CASE WHEN mp."win" THEN 1 ELSE 0 END)::bigint AS wins,
        COALESCE(SUM(mp."kills"), 0)::float AS kills,
        COALESCE(SUM(mp."deaths"), 0)::float AS deaths,
        COALESCE(SUM(mp."assists"), 0)::float AS assists,
        ROUND(AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1))::numeric, 4)::float AS "avgKda",
        ROUND(AVG(mp."totalDamageDealtToChampions")::numeric, 2)::float AS "avgDamage",
        ROUND(AVG(mp."goldEarned")::numeric, 2)::float AS "avgGold"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      ${whereSql}
      GROUP BY mp."championId"
      HAVING COUNT(*) >= ${minGames}
      ORDER BY games DESC, "championId" ASC
    `);

    return rows.map((row) => ({
      userId: null,
      championId: row.championId,
      championName: row.championName,
      position: null,
      games: Number(row.games),
      wins: Number(row.wins),
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      avgKda: row.avgKda,
      avgDamage: row.avgDamage,
      avgGold: row.avgGold,
    }));
  }

  if (options.groupBy === "champion+position") {
    const rows = await prisma.$queryRaw<
      {
        championId: number;
        championName: string;
        position: string | null;
        games: bigint;
        wins: bigint;
        kills: number;
        deaths: number;
        assists: number;
        avgKda: number;
        avgDamage: number;
        avgGold: number;
      }[]
    >(Prisma.sql`
      SELECT
        mp."championId" AS "championId",
        MIN(mp."championName") AS "championName",
        mp."position" AS position,
        COUNT(*)::bigint AS games,
        SUM(CASE WHEN mp."win" THEN 1 ELSE 0 END)::bigint AS wins,
        COALESCE(SUM(mp."kills"), 0)::float AS kills,
        COALESCE(SUM(mp."deaths"), 0)::float AS deaths,
        COALESCE(SUM(mp."assists"), 0)::float AS assists,
        ROUND(AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1))::numeric, 4)::float AS "avgKda",
        ROUND(AVG(mp."totalDamageDealtToChampions")::numeric, 2)::float AS "avgDamage",
        ROUND(AVG(mp."goldEarned")::numeric, 2)::float AS "avgGold"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      ${whereSql}
      GROUP BY mp."championId", mp."position"
      HAVING COUNT(*) >= ${minGames}
      ORDER BY games DESC, "championId" ASC, position ASC
    `);

    return rows.map((row) => ({
      userId: null,
      championId: row.championId,
      championName: row.championName,
      position: row.position,
      games: Number(row.games),
      wins: Number(row.wins),
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      avgKda: row.avgKda,
      avgDamage: row.avgDamage,
      avgGold: row.avgGold,
    }));
  }

  const rows = await prisma.$queryRaw<
    {
      userId: string;
      championId: number;
      championName: string;
      games: bigint;
      wins: bigint;
      kills: number;
      deaths: number;
      assists: number;
      avgKda: number;
      avgDamage: number;
      avgGold: number;
    }[]
  >(Prisma.sql`
    SELECT
      mp."userId" AS "userId",
      mp."championId" AS "championId",
      MIN(mp."championName") AS "championName",
      COUNT(*)::bigint AS games,
      SUM(CASE WHEN mp."win" THEN 1 ELSE 0 END)::bigint AS wins,
      COALESCE(SUM(mp."kills"), 0)::float AS kills,
      COALESCE(SUM(mp."deaths"), 0)::float AS deaths,
      COALESCE(SUM(mp."assists"), 0)::float AS assists,
      ROUND(AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1))::numeric, 4)::float AS "avgKda",
      ROUND(AVG(mp."totalDamageDealtToChampions")::numeric, 2)::float AS "avgDamage",
      ROUND(AVG(mp."goldEarned")::numeric, 2)::float AS "avgGold"
    FROM "match_participants" mp
    INNER JOIN "matches" m ON m."id" = mp."matchId"
    ${whereSql}
    GROUP BY mp."userId", mp."championId"
    HAVING COUNT(*) >= ${minGames}
    ORDER BY games DESC, "userId" ASC, "championId" ASC
  `);

  return rows.map((row) => ({
    userId: row.userId,
    championId: row.championId,
    championName: row.championName,
    position: null,
    games: Number(row.games),
    wins: Number(row.wins),
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    avgKda: row.avgKda,
    avgDamage: row.avgDamage,
    avgGold: row.avgGold,
  }));
}
