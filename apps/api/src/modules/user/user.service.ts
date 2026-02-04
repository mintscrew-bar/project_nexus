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
    const authProvider = await this.prisma.authProvider.findFirst({
      where: {
        provider: "DISCORD",
        providerId: discordId,
      },
      include: {
        user: {
          include: {
            riotAccounts: true,
          },
        },
      },
    });

    return authProvider?.user || null;
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
            roomParticipations: true,
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
    const teamMembers = await this.prisma.teamMember.findMany({
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

    teamMembers.forEach((tm) => {
      if (!tm.team) return;

      const teamMatches = [
        ...tm.team.matchesAsTeamA,
        ...tm.team.matchesAsTeamB,
      ];

      teamMatches.forEach((match) => {
        if (match.winnerId === tm.team!.id) {
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
      participations: teamMembers.length,
    };
  }

  async updateProfile(userId: string, data: { nickname?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
    });
  }

  async getAvatarUrl(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });
    return user?.avatar || null;
  }
}
