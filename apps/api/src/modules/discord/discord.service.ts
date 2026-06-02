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
   * OAuth 봇 설치 후 캡처한 길드를 유저에게 PENDING 상태로 바인딩한다.
   * 이미 ACTIVE인 길드라도 소유자가 바뀌면 재승인 전까지 사용할 수 없도록 PENDING으로 내린다.
   * 활성화(PENDING→ACTIVE)는 관리자 승인 단계에서 처리.
   */
  async linkGuild(ownerId: string, guildId: string, guildName?: string) {
    const existing = await this.prisma.discordGuildLink.findUnique({
      where: { guildId },
      select: { ownerId: true },
    });
    const ownerChanged = !!existing && existing.ownerId !== ownerId;

    return this.prisma.discordGuildLink.upsert({
      where: { guildId },
      update: {
        ownerId,
        ...(guildName ? { guildName } : {}),
        ...(ownerChanged ? { status: "PENDING", activatedAt: null } : {}),
      },
      create: { guildId, ownerId, guildName, status: "PENDING" },
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
