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
   * 이미 존재하는 길드면 소유자만 갱신하고 상태(승인 여부)는 유지한다.
   * 활성화(PENDING→ACTIVE)는 관리자 승인 단계에서 처리.
   */
  async linkGuild(ownerId: string, guildId: string, guildName?: string) {
    return this.prisma.discordGuildLink.upsert({
      where: { guildId },
      update: { ownerId, ...(guildName ? { guildName } : {}) },
      create: { guildId, ownerId, guildName, status: "PENDING" },
    });
  }
}
