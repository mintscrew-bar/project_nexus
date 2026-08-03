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
  showRiotAccounts?: boolean;
  showChampionStats?: boolean;
  allowFriendRequests?: boolean;

  // Profile highlight
  highlightChampionId?: string | null;
  highlightStatType?: string | null;

  // Appearance settings
  theme?: string;

  // Onboarding — 클라이언트는 true만 보내고 시각은 서버가 찍는다
  onboardingSeen?: boolean;
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
    // onboardingSeen(boolean)은 저장 컬럼이 아니라 시각(onboardingSeenAt)으로 변환한다.
    // 되돌리기(false)는 온보딩 안내 다시 보기용으로 null 처리한다.
    const { onboardingSeen, ...rest } = data;
    const payload = {
      ...rest,
      ...(onboardingSeen === undefined
        ? {}
        : { onboardingSeenAt: onboardingSeen ? new Date() : null }),
    };

    // Upsert settings
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: payload,
      create: {
        userId,
        ...payload,
      },
    });
  }
}
