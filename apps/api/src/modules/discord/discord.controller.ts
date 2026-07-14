import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import { ConfigService } from "@nestjs/config";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthService } from "../auth/auth.service";
import { DiscordService } from "./discord.service";
import { DiscordBotService } from "./discord-bot.service";
import { DiscordAdminAlertService } from "./discord-admin-alert.service";

// 봇이 외부 길드에서 필요한 권한 비트필드:
// VIEW_CHANNEL(1024) + SEND_MESSAGES(2048) + CONNECT(1048576) +
// MOVE_MEMBERS(16777216) + MANAGE_CHANNELS(16) = 17828880
const BOT_PERMISSIONS = "17828880";

// 길드 연동 OAuth state 토큰의 purpose 식별자 (계정 연동 토큰과 분리)
const GUILD_LINK_PURPOSE = "discord_guild";

@Controller("discord")
export class DiscordController {
  private readonly logger = new Logger(DiscordController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly discordService: DiscordService,
    private readonly discordBotService: DiscordBotService,
    private readonly adminAlerts: DiscordAdminAlertService,
  ) {}

  private getGuildCallbackUrl() {
    const configured = this.configService.get<string>(
      "DISCORD_GUILD_CALLBACK_URL",
    );
    if (configured) return configured;

    const authCallback = this.configService.get<string>("DISCORD_CALLBACK_URL");
    if (authCallback) {
      try {
        return new URL(
          "/api/discord/guild-link/callback",
          authCallback,
        ).toString();
      } catch {
        // Invalid optional config falls through to the public app URL.
      }
    }

    const appUrl =
      this.configService.get<string>("APP_URL") || "http://localhost:3000";
    return `${appUrl.replace(/\/$/, "")}/api/discord/guild-link/callback`;
  }

  private async verifyInstalledGuild(guildId: string) {
    let result = await this.discordBotService.verifyGuildPermissions(guildId);

    for (const delayMs of [500, 1_000]) {
      if (result.inGuild) return result;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      result = await this.discordBotService.verifyGuildPermissions(guildId);
    }

    return result;
  }

  private async linkExistingBotGuilds(
    userId: string,
    guilds: Array<{ id: string; name: string }>,
    selectedGuildId: string,
  ) {
    const candidates = Array.from(
      new Map(
        guilds
          .filter(
            (guild) =>
              guild.id !== selectedGuildId &&
              this.discordBotService.hasGuild(guild.id),
          )
          .map((guild) => [guild.id, guild]),
      ).values(),
    );

    await Promise.allSettled(
      candidates.map(async (candidate) => {
        const guild = await this.discordBotService.verifyGuildPermissions(
          candidate.id,
        );
        if (
          !guild.inGuild ||
          !guild.hasManageChannels ||
          !guild.hasMoveMembers
        ) {
          return;
        }

        const link = await this.discordService.linkGuild(
          userId,
          candidate.id,
          guild.guildName || candidate.name,
        );
        await this.adminAlerts.notifyDiscordGuildApprovalPending({
          linkId: link.id,
          guildId: link.guildId,
          guildName: link.guildName,
          ownerId: link.ownerId,
          ownerName: link.owner?.username,
          status: link.status,
        });
      }),
    );
  }

  /**
   * 로그인한 유저에게 "내 디스코드 서버에 봇 추가" OAuth2 설치 URL을 반환한다.
   * 프론트는 이 URL로 이동시키면 된다. 설치 완료 후 authorization code를
   * 콜백에서 교환해 선택한 서버와 사용자가 관리하는 서버 목록을 확인한다.
   */
  @Get("guild-link/install-url")
  @UseGuards(JwtAuthGuard)
  async getInstallUrl(@CurrentUser("sub") userId: string) {
    const clientId = this.configService.get<string>("DISCORD_CLIENT_ID");
    const clientSecret = this.configService.get<string>(
      "DISCORD_CLIENT_SECRET",
    );
    if (!clientId || !clientSecret) {
      throw new BadRequestException("Discord 연동 설정 오류입니다.");
    }

    const redirectUri = this.getGuildCallbackUrl();

    // 5분 일회용 state 토큰(Redis) — CSRF 방지 + userId 매핑
    const state = await this.authService.generateLinkToken(
      userId,
      GUILD_LINK_PURPOSE,
    );

    const url =
      `https://discord.com/api/oauth2/authorize` +
      `?client_id=${clientId}` +
      `&scope=${encodeURIComponent("bot applications.commands identify guilds")}` +
      `&permissions=${BOT_PERMISSIONS}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&integration_type=0` +
      `&state=${state}`;

    return { url };
  }

  @Get("guild-links/me")
  @UseGuards(JwtAuthGuard)
  async getMyGuildLinks(@CurrentUser("sub") userId: string) {
    const storedGuilds = await this.discordService.getGuildLinksForUser(userId);
    const guilds = await Promise.all(
      storedGuilds.map(async (guild) => {
        const metadata = await this.discordBotService
          .verifyGuildPermissions(guild.guildId)
          .catch(() => null);

        if (
          !metadata?.inGuild ||
          !metadata.guildName ||
          metadata.guildName === guild.guildName
        ) {
          return guild;
        }

        await this.discordService.updateGuildName(
          guild.guildId,
          metadata.guildName,
        );
        return { ...guild, guildName: metadata.guildName };
      }),
    );

    return {
      home: {
        guildId: this.configService.get<string>("DISCORD_GUILD_ID") || null,
        guildName: "넥서스 서버",
      },
      guilds,
    };
  }

  /**
   * Discord가 봇 설치 후 리다이렉트하는 콜백. authorization code를 교환해
   * 설치 길드를 확정하고 유저에게 바인딩(자동 승인=ACTIVE)한 뒤 설정 페이지로 보낸다.
   * (브라우저 리다이렉트라 JWT 헤더 없음 — state 토큰으로 본인 확인)
   */
  @Get("guild-link/callback")
  async guildLinkCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    const appUrl =
      this.configService.get<string>("APP_URL") || "http://localhost:3000";

    try {
      if (!code || !state) {
        throw new BadRequestException("필수 파라미터 누락");
      }

      const userId = await this.authService.verifyLinkToken(
        state,
        GUILD_LINK_PURPOSE,
      );

      const redirectUri = this.getGuildCallbackUrl();
      const installation = await this.discordService.exchangeGuildInstallCode(
        code,
        redirectUri,
      );
      const guildId = installation.guild?.id;
      if (!guildId) {
        throw new BadRequestException(
          "Discord 설치 서버 정보를 확인할 수 없습니다.",
        );
      }

      const guild = await this.verifyInstalledGuild(guildId);
      if (!guild.inGuild || !guild.guildName) {
        throw new BadRequestException(
          "봇이 Discord 서버에 추가되지 않았습니다. 다시 설치해주세요.",
        );
      }

      const missingPermissions = [
        !guild.hasManageChannels ? "채널 관리" : null,
        !guild.hasMoveMembers ? "멤버 이동" : null,
      ].filter(Boolean);
      if (missingPermissions.length > 0) {
        throw new BadRequestException(
          `봇에게 필요한 권한이 없습니다: ${missingPermissions.join(", ")}`,
        );
      }

      const link = await this.discordService.linkGuild(
        userId,
        guildId,
        guild.guildName,
      );
      await this.adminAlerts.notifyDiscordGuildApprovalPending({
        linkId: link.id,
        guildId: link.guildId,
        guildName: link.guildName,
        ownerId: link.ownerId,
        ownerName: link.owner?.username,
        status: link.status,
      });
      await this.linkExistingBotGuilds(
        userId,
        installation.manageableGuilds,
        guildId,
      );

      const result = link.status === "ACTIVE" ? "active" : "error";
      return res.redirect(`${appUrl}/settings?discord_guild=${result}`);
    } catch (error: any) {
      this.logger.error(`디스코드 길드 연동 실패: ${error.message}`);
      return res.redirect(`${appUrl}/settings?discord_guild=error`);
    }
  }
}
