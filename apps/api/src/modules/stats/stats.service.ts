import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RiotMatchService } from "../riot/riot-match.service";
import { RiotService } from "../riot/riot.service";

export interface ChampionStats {
  championId: number;
  championName: string;
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

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly riotMatchService: RiotMatchService,
    private readonly riotService: RiotService
  ) {}

  /**
   * Get champion statistics for a user
   */
  async getUserChampionStats(userId: string): Promise<ChampionStats[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

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

    participants.forEach((p) => {
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
  async getUserPositionStats(userId: string): Promise<PositionStats[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

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

    participants.forEach((p) => {
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
    tagLine: string
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
  async getUserRiotAccounts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        riotAccounts: {
          select: {
            id: true,
            gameName: true,
            tagLine: true,
            puuid: true,
            tier: true,
            rank: true,
            lp: true,
            // Removed wins and losses as they are not directly on RiotAccount model
            isPrimary: true,
            mainRole: true,
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Type assertion to ensure riotAccounts property is recognized
    const userWithRiotAccounts = user as typeof user & { riotAccounts: any[] };

    // Explicitly check for riotAccounts as it is included
    if (!userWithRiotAccounts.riotAccounts) {
      return []; // Or throw an error, depending on desired behavior
    }

    return userWithRiotAccounts.riotAccounts;
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

    return users.map((user) => ({
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
    start: number = 0
  ) {
    // First, get the summoner info to get PUUID
    const summonerInfo = await this.riotService.getSummonerByRiotId(
      gameName,
      tagLine
    );

    if (!summonerInfo) {
      throw new NotFoundException("Summoner not found");
    }

    // Fetch match history using PUUID
    const matches = await this.riotMatchService.getMatchHistoryByPuuid(
      summonerInfo.puuid,
      count,
      queueId,
      start
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
    queueId?: number
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
      queueId
    );

    return matches;
  }

  /**
   * 소환사의 시즌별 티어 히스토리
   */
  async getSummonerSeasonTiers(gameName: string, tagLine: string) {
    const summonerInfo = await this.riotService.getSummonerByRiotId(gameName, tagLine);
    if (!summonerInfo) throw new NotFoundException("Summoner not found");

    const tiers = await this.prisma.summonerSeasonTier.findMany({
      where: { puuid: summonerInfo.puuid },
      orderBy: { season: "desc" },
    });

    return tiers;
  }

  /**
   * 랭크 게임 챔피언별 시즌 전체 통계
   * - 솔로(420) + 자유(440) 랭크 매치 ID를 100개씩 전부 페이징
   * - 각 매치는 DB 캐시 우선 조회 → 없으면 Riot API 호출 후 DB에 저장
   * - 재요청 시에는 DB에서 즉시 반환 (API 호출 없음)
   */
  async getRankedChampionStats(gameName: string, tagLine: string) {
    const summonerInfo = await this.riotService.getSummonerByRiotId(gameName, tagLine);
    if (!summonerInfo) throw new NotFoundException("Summoner not found");

    const puuid = summonerInfo.puuid;
    const RANKED_QUEUES = [420, 440];
    const BATCH_SIZE = 100;

    // S2026 시즌 시작: 2026년 1월 9일 UTC (Unix seconds)
    const SEASON_2026_START = Math.floor(new Date('2026-01-09T00:00:00Z').getTime() / 1000);

    // 모든 랭크 매치 ID 수집 (두 큐 타입 병렬로)
    const allMatchIds: string[] = [];
    await Promise.all(
      RANKED_QUEUES.map(async (queueId) => {
        let start = 0;
        while (true) {
          const ids = await this.riotMatchService.getMatchIdsByPuuid(
            puuid, start, BATCH_SIZE, queueId, undefined, 3, SEASON_2026_START
          );
          allMatchIds.push(...ids);
          if (ids.length < BATCH_SIZE) break;
          start += BATCH_SIZE;
        }
      })
    );

    if (allMatchIds.length === 0) return [];

    // 중복 제거 (솔로 + 자유 사이에 겹칠 일은 없지만 안전하게)
    const uniqueIds = [...new Set(allMatchIds)];

    // 각 매치 상세 조회 (DB 캐시 우선)
    const matchDetails = await Promise.all(
      uniqueIds.map((id) => this.riotMatchService.getMatchById(id))
    );

    // 챔피언별 통계 집계
    const statsMap = new Map<string, RankedChampStat>();

    for (const match of matchDetails) {
      if (!match) continue;
      const participant = match.info.participants.find((p) => p.puuid === puuid);
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
          games: 1,
          wins: participant.win ? 1 : 0,
          losses: participant.win ? 0 : 1,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
        });
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  }
}
