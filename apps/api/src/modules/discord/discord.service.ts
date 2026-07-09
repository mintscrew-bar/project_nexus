import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class DiscordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // Channel pool management
  async getAvailableChannel(guildId: string, type: "voice" | "text") {
    const cacheKey = `channel_pool:${guildId}:${type}`;
    const availableChannels = await this.redis.hgetall(cacheKey);

    for (const [channelId, status] of Object.entries(availableChannels)) {
      if (status === "available") {
        await this.redis.hset(cacheKey, channelId, "in_use");
        return channelId;
      }
    }

    return null;
  }

  async releaseChannel(
    guildId: string,
    channelId: string,
    type: "voice" | "text",
  ) {
    const cacheKey = `channel_pool:${guildId}:${type}`;
    await this.redis.hset(cacheKey, channelId, "available");
  }

  async registerChannelPool(
    guildId: string,
    channelIds: string[],
    type: "voice" | "text",
  ) {
    const cacheKey = `channel_pool:${guildId}:${type}`;

    for (const channelId of channelIds) {
      await this.redis.hset(cacheKey, channelId, "available");
    }
  }

  // ========================================
  // Guild Link (멀티 길드 연동)
  // ========================================

  /**
   * OAuth 봇 설치 후 캡처한 길드를 유저에게 바인딩한다.
   * 승인은 자동(즉시 ACTIVE) — 관리자는 취소(DISABLED)만 관리한다.
   * 단, 관리자가 이미 DISABLED로 내린 길드는 재설치해도 자동 재활성화하지 않는다.
   */
  async linkGuild(ownerId: string, guildId: string, guildName?: string) {
    const existing = await this.prisma.discordGuildLink.findUnique({
      where: { guildId },
      select: { status: true },
    });
    // 관리자가 취소한 링크는 수동 재승인 전까지 비활성 유지
    const keepDisabled = existing?.status === "DISABLED";

    return this.prisma.discordGuildLink.upsert({
      where: { guildId },
      update: {
        ownerId,
        ...(guildName ? { guildName } : {}),
        ...(keepDisabled
          ? {}
          : { status: "ACTIVE", activatedAt: new Date() }),
      },
      create: {
        guildId,
        ownerId,
        guildName,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
      include: {
        owner: { select: { id: true, username: true } },
      },
    });
  }

  async getGuildLinksForUser(ownerId: string) {
    return this.prisma.discordGuildLink.findMany({
      where: { ownerId },
      orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        guildId: true,
        guildName: true,
        status: true,
        activatedAt: true,
        createdAt: true,
      },
    });
  }
}
