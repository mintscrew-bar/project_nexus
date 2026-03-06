import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface UpdateSettingsDto {
  // Notification settings
  notifyFriendRequest?: boolean;
  notifyFriendAccepted?: boolean;
  notifyMatchStart?: boolean;
  notifyMatchResult?: boolean;
  notifyTeamInvite?: boolean;
  notifyMention?: boolean;
  notifyComment?: boolean;
  notifyClanActivity?: boolean;
  notifySystem?: boolean;

  // Privacy settings
  showOnlineStatus?: boolean;
  showMatchHistory?: boolean;
  showRiotAccounts?: boolean;
  showChampionStats?: boolean;
  allowFriendRequests?: boolean;

  // Profile highlight
  highlightChampionId?: string | null;
  highlightStatType?: string | null;

  // Appearance settings
  theme?: string;
}

@Injectable()
export class UserSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(userId: string) {
    // Get or create settings
    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.userSettings.create({
        data: { userId },
      });
    }

    return settings;
  }

  async updateSettings(userId: string, data: UpdateSettingsDto) {
    // Upsert settings
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }
}
