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

  async getProfile(userId: string, requesterId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        riotAccounts: {
          include: { championPreferences: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        },
        clanMemberships: {
          include: {
            clan: {
              select: { id: true, name: true, tag: true },
            },
          },
        },
        settings: true,
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

    // Strip sensitive fields before returning
    const {
      password: _pw,
      isBanned: _ib,
      banReason: _br,
      bannedAt: _ba,
      banUntil: _be,
      isRestricted: _ir,
      restrictedUntil: _ru,
      emailVerified: _ev,
      ...safeUser
    } = user;

    const isOwner = requesterId === userId;

    // Apply privacy settings for non-owner viewers
    if (!isOwner && user.settings) {
      if (!user.settings.showRiotAccounts) {
        safeUser.riotAccounts = [];
      }
      if (!user.settings.showMatchHistory) {
        stats.gamesPlayed = 0;
        stats.wins = 0;
        stats.losses = 0;
        stats.winRate = 0;
      }
      if (!user.settings.showChampionStats) {
        safeUser.riotAccounts = safeUser.riotAccounts.map((acc: any) => ({
          ...acc,
          championPreferences: [],
        }));
      }
    }

    return {
      ...safeUser,
      stats,
    };
  }

  async getUserStats(userId: string, requesterId?: string) {
    // Privacy check: if not the owner, verify showMatchHistory
    if (requesterId && requesterId !== userId) {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: { showMatchHistory: true },
      });
      if (settings && !settings.showMatchHistory) {
        return { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0, participations: 0 };
      }
    }

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

  async updateProfile(userId: string, data: { username?: string; bio?: string }) {
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
