import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { RiotMatchService } from "../riot/riot-match.service";
import { RiotService } from "../riot/riot.service";
import { getChampionKoreanName } from "@nexus/types";

export interface ChampionStats {
  championId: number;
  championName: string;
  /** 챔피언 한글명 (예: "아리") — 프론트 한글 표시용 */
  championNameKorean: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
}

export interface RankedChampStat {
  championId: number;
  championName: string;
  /** 챔피언 한글명 (예: "아리") — 프론트 한글 표시용 */
  championNameKorean: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface PositionStats {
  position: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface AuctionTitle {
  key: string;
  label: string;
  description: string;
}

export interface AuctionStats {
  captainCount: number;
  totalAuctions: number;
  totalSold: number;
  yuchalCount: number;
  avgSoldPrice: number;
  maxSoldPrice: number;
  titles: AuctionTitle[];
}

export interface LabSampleOverview {
  matchesWithStats: number;
  participantRows: number;
  playersInDataset: number;
  championsInDataset: number;
  itemSelections: number;
  recentMatches30d: number;
}

export interface LabLaneProfile {
  position: string;
  games: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamage: number;
  avgGold: number;
}

export interface LabChampionSignal {
  championId: number;
  championName: string;
  championNameKorean: string;
  games: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
}

export interface LabItemTrend {
  itemId: number;
  picks: number;
  uniqueUsers: number;
}

export interface LabMasteryLeader {
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
}

export interface LabOverview {
  sample: LabSampleOverview;
  laneProfiles: LabLaneProfile[];
  championSignals: LabChampionSignal[];
  itemTrends: LabItemTrend[];
  masteryLeaders: LabMasteryLeader[];
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly riotMatchService: RiotMatchService,
    private readonly riotService: RiotService,
  ) {}

  /**
   * 유저와 프라이버시 설정을 한 번에 조회 — checkPrivacy + user.findUnique 통합
   * 기존: checkPrivacy(DB) + user.findUnique(DB) = 2회
   * 개선: user include settings = 1회
   */
  private async getUserWithSettings(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: {
          select: {
            showMatchHistory: true,
            showChampionStats: true,
            showRiotAccounts: true,
          },
        },
      },
    });
  }

  async getLabOverview(): Promise<LabOverview> {
    const [
      matchesWithStats,
      participantRows,
      playersInDatasetRows,
      championsInDatasetRows,
      itemSelectionsRows,
      recentMatchesRows,
      laneProfileRows,
      championSignalRows,
      itemTrendRows,
      masteryLeaderRows,
    ] = await Promise.all([
      this.prisma.matchParticipant.groupBy({
        by: ["matchId"],
      }),
      this.prisma.matchParticipant.count(),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT "userId")::bigint AS count
        FROM "match_participants"
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT "championId")::bigint AS count
        FROM "match_participants"
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT unnest(ARRAY["item0", "item1", "item2", "item3", "item4", "item5", "item6"]) AS item_id
          FROM "match_participants"
        ) items
        WHERE item_id > 0
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT mp."matchId")::bigint AS count
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE COALESCE(m."completedAt", m."createdAt") >= NOW() - INTERVAL '30 days'
      `),
      this.prisma.$queryRaw<
        {
          position: string;
          games: bigint;
          winRate: number;
          avgKills: number;
          avgDeaths: number;
          avgAssists: number;
          avgDamage: number;
          avgGold: number;
        }[]
      >(Prisma.sql`
        SELECT
          "position",
          COUNT(*)::bigint AS games,
          ROUND(AVG(CASE WHEN "win" THEN 1.0 ELSE 0.0 END) * 100, 1)::float AS "winRate",
          ROUND(AVG("kills"), 1)::float AS "avgKills",
          ROUND(AVG("deaths"), 1)::float AS "avgDeaths",
          ROUND(AVG("assists"), 1)::float AS "avgAssists",
          ROUND(AVG("totalDamageDealtToChampions"), 0)::float AS "avgDamage",
          ROUND(AVG("goldEarned"), 0)::float AS "avgGold"
        FROM "match_participants"
        WHERE "position" IS NOT NULL
          AND "position" <> ''
          AND "position" <> 'UNKNOWN'
        GROUP BY "position"
        ORDER BY COUNT(*) DESC
      `),
      this.prisma.$queryRaw<
        {
          championId: number;
          championName: string;
          games: bigint;
          winRate: number;
          avgKills: number;
          avgDeaths: number;
          avgAssists: number;
        }[]
      >(Prisma.sql`
        SELECT
          "championId",
          "championName",
          COUNT(*)::bigint AS games,
          ROUND(AVG(CASE WHEN "win" THEN 1.0 ELSE 0.0 END) * 100, 1)::float AS "winRate",
          ROUND(AVG("kills"), 1)::float AS "avgKills",
          ROUND(AVG("deaths"), 1)::float AS "avgDeaths",
          ROUND(AVG("assists"), 1)::float AS "avgAssists"
        FROM "match_participants"
        GROUP BY "championId", "championName"
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC, "winRate" DESC
        LIMIT 12
      `),
      this.prisma.$queryRaw<
        {
          itemId: number;
          picks: bigint;
          uniqueUsers: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          item_id AS "itemId",
          COUNT(*)::bigint AS picks,
          COUNT(DISTINCT "userId")::bigint AS "uniqueUsers"
        FROM (
          SELECT
            "userId",
            unnest(ARRAY["item0", "item1", "item2", "item3", "item4", "item5", "item6"]) AS item_id
          FROM "match_participants"
        ) items
        WHERE item_id > 0
        GROUP BY item_id
        ORDER BY COUNT(*) DESC
        LIMIT 12
      `),
      this.prisma.$queryRaw<
        {
          userId: string;
          username: string;
          avatar: string | null;
          championId: number;
          championName: string;
          games: bigint;
          winRate: number;
          avgKda: number;
          masteryScore: number;
        }[]
      >(Prisma.sql`
        WITH champion_user AS (
          SELECT
            mp."userId",
            u."username",
            u."avatar",
            mp."championId",
            mp."championName",
            COUNT(*)::bigint AS games,
            AVG(CASE WHEN mp."win" THEN 1.0 ELSE 0.0 END) * 100 AS "winRate",
            AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1)) AS "avgKda"
          FROM "match_participants" mp
          INNER JOIN "users" u ON u."id" = mp."userId"
          GROUP BY mp."userId", u."username", u."avatar", mp."championId", mp."championName"
          HAVING COUNT(*) >= 4
        ),
        ranked AS (
          SELECT
            *,
            ROUND((games * 4) + ("winRate" * 0.45) + ("avgKda" * 8), 1) AS "masteryScore",
            ROW_NUMBER() OVER (
              PARTITION BY "userId"
              ORDER BY ((games * 4) + ("winRate" * 0.45) + ("avgKda" * 8)) DESC, games DESC
            ) AS rn
          FROM champion_user
        )
        SELECT
          "userId",
          "username",
          "avatar",
          "championId",
          "championName",
          games,
          ROUND("winRate", 1)::float AS "winRate",
          ROUND("avgKda", 2)::float AS "avgKda",
          "masteryScore"
        FROM ranked
        WHERE rn = 1
        ORDER BY "masteryScore" DESC
        LIMIT 10
      `),
    ]);

    return {
      sample: {
        matchesWithStats: matchesWithStats.length,
        participantRows,
        playersInDataset: Number(playersInDatasetRows[0]?.count ?? 0),
        championsInDataset: Number(championsInDatasetRows[0]?.count ?? 0),
        itemSelections: Number(itemSelectionsRows[0]?.count ?? 0),
        recentMatches30d: Number(recentMatchesRows[0]?.count ?? 0),
      },
      laneProfiles: laneProfileRows.map((row) => ({
        position: row.position,
        games: Number(row.games),
        winRate: Number(row.winRate),
        avgKills: Number(row.avgKills),
        avgDeaths: Number(row.avgDeaths),
        avgAssists: Number(row.avgAssists),
        avgDamage: Number(row.avgDamage),
        avgGold: Number(row.avgGold),
      })),
      championSignals: championSignalRows.map((row) => ({
        championId: row.championId,
        championName: row.championName,
        championNameKorean: getChampionKoreanName(row.championName),
        games: Number(row.games),
        winRate: Number(row.winRate),
        avgKills: Number(row.avgKills),
        avgDeaths: Number(row.avgDeaths),
        avgAssists: Number(row.avgAssists),
      })),
      itemTrends: itemTrendRows.map((row) => ({
        itemId: row.itemId,
        picks: Number(row.picks),
        uniqueUsers: Number(row.uniqueUsers),
      })),
      masteryLeaders: masteryLeaderRows.map((row) => ({
        userId: row.userId,
        username: row.username,
        avatar: row.avatar,
        championId: row.championId,
        championName: row.championName,
        championNameKorean: getChampionKoreanName(row.championName),
        games: Number(row.games),
        winRate: Number(row.winRate),
        avgKda: Number(row.avgKda),
        masteryScore: Number(row.masteryScore),
      })),
    };
  }

  private isPrivacyAllowed(
    settings: { showMatchHistory?: boolean; showChampionStats?: boolean; showRiotAccounts?: boolean } | null,
    requesterId: string,
    userId: string,
    setting: "showMatchHistory" | "showChampionStats" | "showRiotAccounts",
  ): boolean {
    if (requesterId === userId) return true;
    return !settings || settings[setting] !== false;
  }

  /**
   * Get auction statistics for a user (captain count, sold prices, titles)
   */
  async getUserAuctionStats(
    userId: string,
    requesterId?: string,
  ): Promise<AuctionStats> {
    const user = await this.getUserWithSettings(userId);
    if (!user) throw new NotFoundException("User not found");
    if (requesterId && !this.isPrivacyAllowed(user.settings, requesterId, userId, "showMatchHistory")) {
      return { captainCount: 0, totalAuctions: 0, totalSold: 0, yuchalCount: 0, avgSoldPrice: 0, maxSoldPrice: 0, titles: [] };
    }

    // 팀장 횟수
    const captainCount = await this.prisma.team.count({
      where: { captainId: userId },
    });

    // 경매 낙찰 기록 (soldPrice != null → 경매 대상으로 올라온 적 있음)
    const soldRecords = await this.prisma.teamMember.findMany({
      where: { userId, soldPrice: { not: null } },
      select: { soldPrice: true },
    });

    const totalAuctions = soldRecords.length;
    const soldPrices = soldRecords
      .map((r: (typeof soldRecords)[number]) => r.soldPrice!)
      .filter((p: number) => p > 0);
    const totalSold = soldPrices.length;
    const yuchalCount = totalAuctions - totalSold;
    const avgSoldPrice =
      totalSold > 0
        ? Math.round(soldPrices.reduce((s: number, p: number) => s + p, 0) / totalSold)
        : 0;
    const maxSoldPrice = totalSold > 0 ? Math.max(...soldPrices) : 0;

    // 칭호 계산
    const titles: AuctionTitle[] = [];

    // 팀장 칭호
    if (captainCount >= 20) {
      titles.push({
        key: "born_leader",
        label: "타고난 리더",
        description: "20회 이상 팀장을 맡은 진정한 리더",
      });
    } else if (captainCount >= 10) {
      titles.push({
        key: "captain_master",
        label: "팀장 장인",
        description: "10회 이상 팀장을 역임한 베테랑",
      });
    } else if (captainCount >= 5) {
      titles.push({
        key: "regular_captain",
        label: "단골 팀장",
        description: "5회 이상 팀장을 맡은 경험자",
      });
    }

    // 평균 낙찰가 칭호
    if (avgSoldPrice >= 600) {
      titles.push({
        key: "superstar",
        label: "슈퍼스타",
        description: "평균 낙찰가 600 이상의 최고 몸값",
      });
    } else if (avgSoldPrice >= 400) {
      titles.push({
        key: "blue_chip",
        label: "블루칩",
        description: "평균 낙찰가 400 이상의 고가 선수",
      });
    } else if (avgSoldPrice >= 200) {
      titles.push({
        key: "high_value",
        label: "고가 용병",
        description: "평균 낙찰가 200 이상의 인기 선수",
      });
    }

    // 최고 낙찰가 칭호
    if (maxSoldPrice >= 800) {
      titles.push({
        key: "ace",
        label: "팀의 에이스",
        description: "최고 800 이상에 낙찰된 전설",
      });
    }

    // 경험 칭호
    if (totalAuctions >= 20) {
      titles.push({
        key: "veteran",
        label: "베테랑",
        description: "20회 이상 경매에 오른 고참 선수",
      });
    }

    return {
      captainCount,
      totalAuctions,
      totalSold,
      yuchalCount,
      avgSoldPrice,
      maxSoldPrice,
      titles,
    };
  }

  /**
   * Get champion statistics for a user
   */
  async getUserChampionStats(
    userId: string,
    requesterId?: string,
  ): Promise<ChampionStats[]> {
    const user = await this.getUserWithSettings(userId);
    if (!user) throw new NotFoundException("User not found");
    if (requesterId && !this.isPrivacyAllowed(user.settings, requesterId, userId, "showChampionStats")) return [];

    // Get all match participants for this user
    const participants = await this.prisma.matchParticipant.findMany({
      where: { userId },
      select: {
        championId: true,
        championName: true,
        kills: true,
        deaths: true,
        assists: true,
        totalMinionsKilled: true,
        neutralMinionsKilled: true,
        goldEarned: true,
        totalDamageDealtToChampions: true,
        win: true,
      },
    });

    // Aggregate stats by champion
    const statsMap = new Map<number, ChampionStats>();

    participants.forEach((p: (typeof participants)[number]) => {
      const existing = statsMap.get(p.championId);
      if (existing) {
        existing.games++;
        if (p.win) existing.wins++;
        else existing.losses++;
        existing.kills += p.kills;
        existing.deaths += p.deaths;
        existing.assists += p.assists;
        existing.totalMinionsKilled += p.totalMinionsKilled;
        existing.neutralMinionsKilled += p.neutralMinionsKilled;
        existing.goldEarned += p.goldEarned;
        existing.totalDamageDealtToChampions += p.totalDamageDealtToChampions;
      } else {
        statsMap.set(p.championId, {
          championId: p.championId,
          championName: p.championName,
          // 영문 챔피언명을 한글로 변환하여 추가 (기존 영문 필드는 유지)
          championNameKorean: getChampionKoreanName(p.championName),
          games: 1,
          wins: p.win ? 1 : 0,
          losses: p.win ? 0 : 1,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          totalMinionsKilled: p.totalMinionsKilled,
          neutralMinionsKilled: p.neutralMinionsKilled,
          goldEarned: p.goldEarned,
          totalDamageDealtToChampions: p.totalDamageDealtToChampions,
        });
      }
    });

    // Convert to array and sort by games played
    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  }

  /**
   * Get position statistics for a user
   */
  async getUserPositionStats(
    userId: string,
    requesterId?: string,
  ): Promise<PositionStats[]> {
    const user = await this.getUserWithSettings(userId);
    if (!user) throw new NotFoundException("User not found");
    if (requesterId && !this.isPrivacyAllowed(user.settings, requesterId, userId, "showMatchHistory")) return [];

    // Get all match participants for this user
    const participants = await this.prisma.matchParticipant.findMany({
      where: { userId },
      select: {
        position: true,
        kills: true,
        deaths: true,
        assists: true,
        win: true,
      },
    });

    // Aggregate stats by position
    const statsMap = new Map<string, PositionStats>();

    participants.forEach((p: (typeof participants)[number]) => {
      const position = p.position || "UNKNOWN";
      const existing = statsMap.get(position);
      if (existing) {
        existing.games++;
        if (p.win) existing.wins++;
        else existing.losses++;
        existing.kills += p.kills;
        existing.deaths += p.deaths;
        existing.assists += p.assists;
      } else {
        statsMap.set(position, {
          position,
          games: 1,
          wins: p.win ? 1 : 0,
          losses: p.win ? 0 : 1,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
        });
      }
    });

    // Convert to array and sort by games played
    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  }

  /**
   * Find user by Riot account (gameName + tagLine)
   */
  async findUserByRiotAccount(
    gameName: string,
    tagLine: string,
  ): Promise<{ userId: string; riotAccount: any } | null> {
    const riotAccount = await this.prisma.riotAccount.findFirst({
      where: {
        gameName: {
          equals: gameName,
          mode: "insensitive",
        },
        tagLine: {
          equals: tagLine,
          mode: "insensitive",
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    if (!riotAccount) {
      return null;
    }

    return {
      userId: riotAccount.userId,
      riotAccount: {
        id: riotAccount.id,
        gameName: riotAccount.gameName,
        tagLine: riotAccount.tagLine,
        puuid: riotAccount.puuid,
        tier: riotAccount.tier,
        rank: riotAccount.rank,
        lp: riotAccount.lp, // Changed from leaguePoints
        isPrimary: riotAccount.isPrimary,
        user: riotAccount.user,
      },
    };
  }

  /**
   * Get user's Riot accounts
   */
  async getUserRiotAccounts(userId: string, requesterId?: string) {
    // settings 포함 조회 후 프라이버시 체크 (기존 checkPrivacy + user.findUnique 2회 → 1회)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: { select: { showRiotAccounts: true } },
        riotAccounts: {
          select: {
            id: true,
            gameName: true,
            tagLine: true,
            puuid: true,
            tier: true,
            rank: true,
            lp: true,
            isPrimary: true,
            mainRole: true,
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!user) throw new NotFoundException("User not found");
    if (requesterId && !this.isPrivacyAllowed(user.settings, requesterId, userId, "showRiotAccounts")) return [];

    return user.riotAccounts;
  }

  /**
   * Search users by username
   */
  async searchUsers(query: string, limit: number = 10) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        username: {
          contains: query.trim(),
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        createdAt: true,
        riotAccounts: {
          where: { isPrimary: true },
          select: {
            gameName: true,
            tagLine: true,
            tier: true,
            rank: true,
          },
          take: 1,
        },
      },
      take: limit,
      orderBy: {
        username: "asc",
      },
    });

    return users.map((user: (typeof users)[number]) => ({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      createdAt: user.createdAt,
      primaryRiotAccount: user.riotAccounts[0] || null,
    }));
  }

  /**
   * Get Riot match history for a summoner by gameName + tagLine
   */
  async getRiotMatchHistory(
    gameName: string,
    tagLine: string,
    count: number = 20,
    queueId?: number,
    start: number = 0,
  ) {
    // First, get the summoner info to get PUUID
    const summonerInfo = await this.riotService.getSummonerByRiotId(
      gameName,
      tagLine,
    );

    if (!summonerInfo) {
      throw new NotFoundException("Summoner not found");
    }

    // Fetch match history using PUUID
    const matches = await this.riotMatchService.getMatchHistoryByPuuid(
      summonerInfo.puuid,
      count,
      queueId,
      start,
    );

    return matches;
  }

  /**
   * Get match timeline (item purchases, gold/CS/XP per minute)
   */
  async getMatchTimeline(matchId: string) {
    return this.riotMatchService.getMatchTimeline(matchId);
  }

  /**
   * Get Riot match history for a user (uses primary Riot account)
   */
  async getUserRiotMatchHistory(
    userId: string,
    count: number = 20,
    queueId?: number,
  ) {
    // Get user's primary Riot account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        riotAccounts: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.riotAccounts.length === 0) {
      throw new NotFoundException("User has no linked Riot account");
    }

    const primaryAccount = user.riotAccounts[0];

    // Fetch match history using PUUID
    const matches = await this.riotMatchService.getMatchHistoryByPuuid(
      primaryAccount.puuid,
      count,
      queueId,
    );

    return matches;
  }

  /**
   * 랭크 게임 챔피언별 시즌 전체 통계
   * - Redis 캐시 (10분) → 즉시 반환
   * - 솔로(420) + 자유(440) 랭크 매치 ID를 100개씩 전부 페이징
   * - 각 매치는 DB 캐시 우선 조회 → 없으면 Riot API 호출 후 DB에 저장
   * - 매치 상세는 5개씩 배치 순차 처리 (rate limit 보호)
   */
  async getRankedChampionStats(gameName: string, tagLine: string) {
    // 1. Redis 캐시 확인 (10분 TTL)
    const cacheKey = `stats:ranked-champ:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const summonerInfo = await this.riotService.getSummonerByRiotId(
      gameName,
      tagLine,
    );
    if (!summonerInfo) throw new NotFoundException("Summoner not found");

    const puuid = summonerInfo.puuid;
    const RANKED_QUEUES = [420, 440];
    const BATCH_SIZE = 100;

    // S2026 시즌 시작: 2026년 1월 9일 UTC (Unix seconds)
    const SEASON_2026_START = Math.floor(
      new Date("2026-01-09T00:00:00Z").getTime() / 1000,
    );

    // 모든 랭크 매치 ID 수집 (큐 타입 순차 처리 — rate limit 보호)
    const allMatchIds: string[] = [];
    for (const queueId of RANKED_QUEUES) {
      let start = 0;
      while (true) {
        const ids = await this.riotMatchService.getMatchIdsByPuuid(
          puuid,
          start,
          BATCH_SIZE,
          queueId,
          undefined,
          3,
          SEASON_2026_START,
        );
        allMatchIds.push(...ids);
        if (ids.length < BATCH_SIZE) break;
        start += BATCH_SIZE;
      }
    }

    if (allMatchIds.length === 0) {
      await this.redis.set(cacheKey, JSON.stringify([]), 600);
      return [];
    }

    // 중복 제거
    const uniqueIds = [...new Set(allMatchIds)];

    // DB 캐시 보유 여부 단일 쿼리로 확인
    const dbCached = await this.prisma.riotMatchCache.findMany({
      where: { matchId: { in: uniqueIds } },
      select: { matchId: true },
    });
    const dbCachedSet = new Set(dbCached.map((e: { matchId: string }) => e.matchId));
    const cachedIds = uniqueIds.filter((id) => dbCachedSet.has(id));
    const uncachedIds = uniqueIds.filter((id) => !dbCachedSet.has(id));

    // 캐시된 매치: 병렬 조회 (DB에서 즉시 반환 — Riot API 호출 없음)
    const cachedResults = await Promise.all(
      cachedIds.map((id) => this.riotMatchService.getMatchById(id)),
    );

    // 미캐시 매치: 타임아웃 방지를 위해 최대 40개만 처리
    // 나머지는 다음 요청 시 점진적으로 DB 캐시에 적재됨
    const MAX_UNCACHED_FETCH = 40;
    const uncachedResults: any[] = [];
    for (let i = 0; i < Math.min(uncachedIds.length, MAX_UNCACHED_FETCH); i++) {
      try {
        const match = await this.riotMatchService.getMatchById(uncachedIds[i]);
        uncachedResults.push(match);
      } catch {
        // 개별 매치 오류는 건너뜀 — 나머지 처리 계속
        uncachedResults.push(null);
      }
      // 마지막 항목 이후는 대기 불필요
      if (i < Math.min(uncachedIds.length, MAX_UNCACHED_FETCH) - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    const matchDetails = [...cachedResults, ...uncachedResults];

    // 챔피언별 통계 집계
    const statsMap = new Map<string, RankedChampStat>();

    for (const match of matchDetails) {
      if (!match) continue;
      const participant = match.info.participants.find(
        (p: any) => p.puuid === puuid,
      );
      if (!participant) continue;

      const key = participant.championName;
      const existing = statsMap.get(key);
      if (existing) {
        existing.games++;
        if (participant.win) existing.wins++;
        else existing.losses++;
        existing.kills += participant.kills;
        existing.deaths += participant.deaths;
        existing.assists += participant.assists;
      } else {
        statsMap.set(key, {
          championId: participant.championId,
          championName: participant.championName,
          // 영문 챔피언명을 한글로 변환하여 추가 (기존 영문 필드는 유지)
          championNameKorean: getChampionKoreanName(participant.championName),
          games: 1,
          wins: participant.win ? 1 : 0,
          losses: participant.win ? 0 : 1,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
        });
      }
    }

    const result = Array.from(statsMap.values()).sort(
      (a, b) => b.games - a.games,
    );

    // 미캐시 매치가 MAX 초과면 집계가 불완전 — 30초 TTL로 재시도 유도
    // 완전 집계 시 10분 TTL 적용
    const isPartial = uncachedIds.length > MAX_UNCACHED_FETCH;
    await this.redis.set(cacheKey, JSON.stringify(result), isPartial ? 30 : 600);

    return result;
  }
}
