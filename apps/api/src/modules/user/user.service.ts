import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        riotAccounts: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async findByDiscordId(discordId: string) {
    return this.prisma.user.findUnique({
      where: { discordId },
      include: {
        riotAccounts: true,
      },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        riotAccounts: {
          where: { isPrimary: true },
        },
        _count: {
          select: {
            participations: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Get statistics
    const stats = await this.getUserStats(userId);

    return {
      ...user,
      stats,
    };
  }

  async getUserStats(userId: string) {
    const participations = await this.prisma.auctionParticipant.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            matchesAsTeamA: true,
            matchesAsTeamB: true,
          },
        },
      },
    });

    let wins = 0;
    let losses = 0;

    participations.forEach((p) => {
      if (!p.team) return;

      const teamMatches = [...p.team.matchesAsTeamA, ...p.team.matchesAsTeamB];

      teamMatches.forEach((match) => {
        if (match.winnerId === p.team!.id) {
          wins++;
        } else if (match.winnerId) {
          losses++;
        }
      });
    });

    return {
      gamesPlayed: wins + losses,
      wins,
      losses,
      winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
      participations: participations.length,
    };
  }

  async updateProfile(userId: string, data: { nickname?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }
}
