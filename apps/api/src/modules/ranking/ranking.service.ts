import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);
  private static readonly MIN_GAMES_FOR_RANK = 10;
  private static readonly RECENT_GAMES_COUNT = 20;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Update ranking for a user after match completion
   */
  async updateRanking(userId: string): Promise<void> {
    try {
      // Nexus 랭킹은 내전만 반영한다. 외부 Riot 인제스트 매치도
      // match_participants.userId에 매핑될 수 있으므로 roomId로 분리한다.
      const participants = await this.prisma.matchParticipant.findMany({
        where: {
          userId,
          match: {
            roomId: { not: null },
          },
        },
        select: { win: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });

      const totalGames = participants.length;
      const wins = participants.filter(
        (p: { win: boolean; createdAt: Date }) => p.win,
      ).length;
      const losses = totalGames - wins;
      const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

      // Recent form (last 20 games)
      const recentGames = participants.slice(
        0,
        RankingService.RECENT_GAMES_COUNT,
      );
      const recentWins = recentGames.filter(
        (p: { win: boolean; createdAt: Date }) => p.win,
      ).length;
      const recentLosses = recentGames.length - recentWins;

      // Upsert NexusRanking
      await this.prisma.nexusRanking.upsert({
        where: { userId },
        create: {
          userId,
          totalGames,
          wins,
          losses,
          winRate,
          recentWins,
          recentLosses,
        },
        update: {
          totalGames,
          wins,
          losses,
          winRate,
          recentWins,
          recentLosses,
        },
      });

      // Update clan rankings if user is in any clan
      const clanMemberships = await this.prisma.clanMember.findMany({
        where: { userId },
        select: { clanId: true },
      });

      for (const membership of clanMemberships) {
        await this.updateClanRanking(userId, membership.clanId);
      }

      this.logger.log(
        `Updated ranking for user ${userId}: ${wins}W ${losses}L (${winRate.toFixed(1)}%)`,
      );
    } catch (error) {
      this.logger.error(`Failed to update ranking for user ${userId}:`, error);
    }
  }

  /**
   * Update clan-specific ranking for a user.
   * Since rooms don't have a clanId field, clan ranking uses the same
   * Nexus custom-match stats to rank members within each clan.
   */
  private async updateClanRanking(
    userId: string,
    clanId: string,
  ): Promise<void> {
    const participants = await this.prisma.matchParticipant.findMany({
      where: {
        userId,
        match: {
          roomId: { not: null },
        },
      },
      select: { win: true },
    });

    const totalGames = participants.length;
    const wins = participants.filter((p: { win: boolean }) => p.win).length;
    const losses = totalGames - wins;
    const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

    await this.prisma.clanRanking.upsert({
      where: { userId_clanId: { userId, clanId } },
      create: {
        userId,
        clanId,
        totalGames,
        wins,
        losses,
        winRate,
      },
      update: {
        totalGames,
        wins,
        losses,
        winRate,
      },
    });
  }

  /**
   * Get global ranking (paginated, minimum games required)
   */
  async getGlobalRanking(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [rankings, total] = await Promise.all([
      this.prisma.nexusRanking.findMany({
        where: {
          totalGames: { gte: RankingService.MIN_GAMES_FOR_RANK },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
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
          },
        },
        orderBy: [{ winRate: "desc" }, { totalGames: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.nexusRanking.count({
        where: {
          totalGames: { gte: RankingService.MIN_GAMES_FOR_RANK },
        },
      }),
    ]);

    // Attach rank numbers
    const rankedData = rankings.map(
      (r: (typeof rankings)[number], i: number) => ({
        ...r,
        globalRank: skip + i + 1,
      }),
    );

    return {
      rankings: rankedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get clan ranking (paginated)
   */
  async getClanRanking(clanId: string, page: number = 1, limit: number = 50) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    const skip = (page - 1) * limit;

    const [rankings, total] = await Promise.all([
      this.prisma.clanRanking.findMany({
        where: { clanId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
        orderBy: [{ winRate: "desc" }, { totalGames: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.clanRanking.count({ where: { clanId } }),
    ]);

    const rankedData = rankings.map(
      (r: (typeof rankings)[number], i: number) => ({
        ...r,
        clanRank: skip + i + 1,
      }),
    );

    return {
      clan: { id: clan.id, name: clan.name, tag: clan.tag },
      rankings: rankedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a specific user's ranking info
   */
  async getUserRanking(userId: string) {
    const ranking = await this.prisma.nexusRanking.findUnique({
      where: { userId },
    });

    if (!ranking) {
      return {
        totalGames: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        globalRank: null,
        recentWins: 0,
        recentLosses: 0,
      };
    }

    // Calculate global rank position
    let globalRank: number | null = null;
    if (ranking.totalGames >= RankingService.MIN_GAMES_FOR_RANK) {
      const higherCount = await this.prisma.nexusRanking.count({
        where: {
          totalGames: { gte: RankingService.MIN_GAMES_FOR_RANK },
          OR: [
            { winRate: { gt: ranking.winRate } },
            {
              winRate: ranking.winRate,
              totalGames: { gt: ranking.totalGames },
            },
          ],
        },
      });
      globalRank = higherCount + 1;
    }

    return {
      ...ranking,
      globalRank,
    };
  }

  /**
   * Recalculate all rankings (admin/cron)
   */
  async recalculateAllRankings(): Promise<{ processed: number }> {
    // 기존에 외부 인제스트 매치로 오염된 ranking row도 0으로 재계산되도록
    // 현재 랭킹 테이블 사용자와 내전 참여자를 모두 대상으로 삼는다.
    const [customParticipants, existingRankings] = await Promise.all([
      this.prisma.matchParticipant.findMany({
        where: {
          userId: { not: null },
          match: {
            roomId: { not: null },
          },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.nexusRanking.findMany({
        select: { userId: true },
      }),
    ]);

    const userIds = Array.from(
      new Set(
        [...customParticipants, ...existingRankings]
          .map(({ userId }) => userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    this.logger.log(`Recalculating rankings for ${userIds.length} users...`);

    let processed = 0;
    for (const userId of userIds) {
      await this.updateRanking(userId);
      processed++;
    }

    // Update global rank numbers
    await this.updateGlobalRankNumbers();

    this.logger.log(`Recalculation complete: ${processed} users processed`);
    return { processed };
  }

  /**
   * Update globalRank numbers for all eligible users
   */
  private async updateGlobalRankNumbers(): Promise<void> {
    const rankings = await this.prisma.nexusRanking.findMany({
      where: {
        totalGames: { gte: RankingService.MIN_GAMES_FOR_RANK },
      },
      orderBy: [{ winRate: "desc" }, { totalGames: "desc" }],
      select: { id: true },
    });

    // Batch update rank numbers
    for (let i = 0; i < rankings.length; i++) {
      await this.prisma.nexusRanking.update({
        where: { id: rankings[i].id },
        data: { globalRank: i + 1 },
      });
    }

    // Set null for users below minimum games
    await this.prisma.nexusRanking.updateMany({
      where: {
        totalGames: { lt: RankingService.MIN_GAMES_FOR_RANK },
      },
      data: { globalRank: null },
    });
  }
}
