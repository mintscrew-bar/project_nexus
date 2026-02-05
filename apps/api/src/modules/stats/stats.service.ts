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
    queueId?: number
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
      queueId
    );

    return matches;
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
}
