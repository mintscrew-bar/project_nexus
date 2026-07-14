import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class DiscordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
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
   * 활성 연동의 소유자는 다른 Nexus 계정의 재설치로 변경할 수 없다.
   */
  async linkGuild(ownerId: string, guildId: string, guildName?: string) {
    const existing = await this.prisma.discordGuildLink.findUnique({
      where: { guildId },
      select: { ownerId: true, status: true },
    });
    if (
      existing &&
      existing.ownerId !== ownerId &&
      existing.status !== "DISABLED"
    ) {
      throw new ConflictException(
        "이미 다른 Nexus 계정에 연동된 Discord 서버입니다.",
      );
    }
    // 관리자가 취소한 링크는 수동 재승인 전까지 비활성 유지
    const keepDisabled = existing?.status === "DISABLED";

    return this.prisma.discordGuildLink.upsert({
      where: { guildId },
      update: {
        ownerId,
        ...(guildName ? { guildName } : {}),
        ...(keepDisabled ? {} : { status: "ACTIVE", activatedAt: new Date() }),
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

  async updateGuildName(guildId: string, guildName: string) {
    return this.prisma.discordGuildLink.update({
      where: { guildId },
      data: { guildName },
    });
  }

  async exchangeGuildInstallCode(
    code: string,
    redirectUri: string,
  ): Promise<{
    guild?: { id: string; name: string };
    manageableGuilds: Array<{ id: string; name: string }>;
  }> {
    const clientId = this.configService.get<string>("DISCORD_CLIENT_ID");
    const clientSecret = this.configService.get<string>(
      "DISCORD_CLIENT_SECRET",
    );
    if (!clientId || !clientSecret) {
      throw new BadRequestException("Discord 연동 설정 오류입니다.");
    }

    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      throw new BadRequestException("Discord 서버 설치 인증에 실패했습니다.");
    }

    const installation = (await response.json()) as {
      access_token?: string;
      guild?: { id: string; name: string };
    };
    if (!installation.access_token) {
      throw new BadRequestException(
        "Discord 서버 목록 접근 권한을 확인할 수 없습니다.",
      );
    }

    const guildsResponse = await fetch(
      "https://discord.com/api/v10/users/@me/guilds?limit=200",
      {
        headers: { Authorization: `Bearer ${installation.access_token}` },
      },
    );
    if (!guildsResponse.ok) {
      throw new BadRequestException(
        "Discord에서 관리 서버 목록을 불러오지 못했습니다.",
      );
    }

    const guilds = (await guildsResponse.json()) as Array<{
      id: string;
      name: string;
      owner?: boolean;
      permissions?: string;
    }>;
    const manageableGuilds = guilds.filter((guild) => {
      if (guild.owner) return true;
      try {
        const permissions = BigInt(guild.permissions || "0");
        return (permissions & 0x8n) !== 0n || (permissions & 0x20n) !== 0n;
      } catch {
        return false;
      }
    });

    return {
      guild: installation.guild,
      manageableGuilds: manageableGuilds.map(({ id, name }) => ({ id, name })),
    };
  }
}
