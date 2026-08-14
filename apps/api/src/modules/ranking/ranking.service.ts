import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Role } from "@nexus/database";
import { resolveWinnerSlot } from "../match/match-roster.util";

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
      const {
        totalGames,
        wins,
        losses,
        winRate,
        recentWins,
        recentLosses,
        byRole,
      } = await this.computeInternalRecord(userId);

      await this.syncRoleRecords(userId, byRole);

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
   * 내전 전적(승/패)을 계산한다.
   *
   * 예전에는 match_participants(=Riot 수집 결과)로 셌다. 그런데 수동 사설방은
   * Riot이 데이터를 주지 않아 참가자 행이 0건이고, 방장이 버튼으로 입력한 승패가
   * 랭킹에 전혀 반영되지 않았다.
   *
   * 승패는 Nexus가 자체적으로 확정하는 값이므로 Riot 수집 여부와 무관해야 한다.
   * 로스터 스냅샷(방이 삭제돼도 남는다)과 매치 결과만으로 계산한다.
   */
  private async computeInternalRecord(userId: string): Promise<{
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    recentWins: number;
    recentLosses: number;
    byRole: Map<Role, { totalGames: number; wins: number }>;
  }> {
    const rosters = await this.prisma.matchRosterSnapshot.findMany({
      where: {
        userId,
        match: { isInternal: true, status: "COMPLETED" },
      },
      select: {
        teamSlot: true,
        assignedRole: true,
        match: {
          select: {
            completedAt: true,
            winnerId: true,
            winnerIdSnapshot: true,
            teamAId: true,
            teamBId: true,
            teamAIdSnapshot: true,
            teamBIdSnapshot: true,
          },
        },
      },
      orderBy: { match: { completedAt: "desc" } },
    });

    // 승패가 확정된 경기만 집계한다 (결과 미입력 경기는 제외).
    const results = rosters
      .map((roster) => {
        const winnerSlot = resolveWinnerSlot(roster.match);
        return winnerSlot
          ? { win: winnerSlot === roster.teamSlot, role: roster.assignedRole }
          : null;
      })
      .filter(
        (result): result is { win: boolean; role: Role | null } =>
          result !== null,
      );

    const totalGames = results.length;
    const wins = results.filter((result) => result.win).length;
    const recentGames = results.slice(0, RankingService.RECENT_GAMES_COUNT);
    const recentWins = recentGames.filter((result) => result.win).length;

    // 라인별 집계. 역할 선택을 거치지 않은 경기(assignedRole 없음)는 제외한다.
    const byRole = new Map<Role, { totalGames: number; wins: number }>();
    for (const result of results) {
      if (!result.role) continue;
      const entry = byRole.get(result.role) ?? { totalGames: 0, wins: 0 };
      entry.totalGames += 1;
      if (result.win) entry.wins += 1;
      byRole.set(result.role, entry);
    }

    return {
      totalGames,
      wins,
      losses: totalGames - wins,
      winRate: totalGames > 0 ? (wins / totalGames) * 100 : 0,
      recentWins,
      recentLosses: recentGames.length - recentWins,
      byRole,
    };
  }

  /**
   * 라인별 전적을 저장한다.
   * 집계에서 사라진 라인은 남겨두면 오래된 값이 유령처럼 보이므로 지운다.
   */
  private async syncRoleRecords(
    userId: string,
    byRole: Map<Role, { totalGames: number; wins: number }>,
  ): Promise<void> {
    const activeRoles = [...byRole.keys()];

    await this.prisma.nexusRoleRecord.deleteMany({
      where: {
        userId,
        ...(activeRoles.length > 0 ? { role: { notIn: activeRoles } } : {}),
      },
    });

    for (const [role, entry] of byRole) {
      const losses = entry.totalGames - entry.wins;
      const winRate =
        entry.totalGames > 0 ? (entry.wins / entry.totalGames) * 100 : 0;
      const payload = {
        totalGames: entry.totalGames,
        wins: entry.wins,
        losses,
        winRate,
      };

      await this.prisma.nexusRoleRecord.upsert({
        where: { userId_role: { userId, role } },
        create: { userId, role, ...payload },
        update: payload,
      });
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
    const { totalGames, wins, losses, winRate } =
      await this.computeInternalRecord(userId);

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
    const [ranking, roleRecords] = await Promise.all([
      this.prisma.nexusRanking.findUnique({ where: { userId } }),
      // 라인별 전적 — 표시 순서는 라인 순(TOP→SUPPORT)으로 고정한다.
      this.prisma.nexusRoleRecord.findMany({ where: { userId } }),
    ]);

    const ROLE_ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
    const byRole = ROLE_ORDER.map(
      (role) => roleRecords.find((record) => record.role === role) ?? null,
    ).filter((record): record is (typeof roleRecords)[number] =>
      Boolean(record),
    );

    if (!ranking) {
      return {
        totalGames: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        globalRank: null,
        recentWins: 0,
        recentLosses: 0,
        byRole,
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
      byRole,
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
            isInternal: true,
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
