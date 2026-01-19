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
}
