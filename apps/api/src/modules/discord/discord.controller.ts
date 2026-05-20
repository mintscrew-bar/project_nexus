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
  ) {}

  /**
   * 로그인한 유저에게 "내 디스코드 서버에 봇 추가" OAuth2 설치 URL을 반환한다.
   * 프론트는 이 url로 이동시키면 됨. 설치 완료 시 Discord가 callback으로
   * guild_id를 붙여 리다이렉트한다.
   */
  @Get("guild-link/install-url")
  @UseGuards(JwtAuthGuard)
  async getInstallUrl(@CurrentUser("sub") userId: string) {
    const clientId = this.configService.get<string>("DISCORD_CLIENT_ID");
    if (!clientId) {
      throw new BadRequestException("Discord 연동 설정 오류입니다.");
    }

    const apiUrl =
      this.configService.get<string>("API_URL") || "http://localhost:4000";
    const redirectUri =
      this.configService.get<string>("DISCORD_GUILD_CALLBACK_URL") ||
      `${apiUrl}/api/discord/guild-link/callback`;

    // 5분 일회용 state 토큰(Redis) — CSRF 방지 + userId 매핑
    const state = await this.authService.generateLinkToken(
      userId,
      GUILD_LINK_PURPOSE,
    );

    const url =
      `https://discord.com/api/oauth2/authorize` +
      `?client_id=${clientId}` +
      `&scope=${encodeURIComponent("bot applications.commands")}` +
      `&permissions=${BOT_PERMISSIONS}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&state=${state}`;

    return { url };
  }

  @Get("guild-links/me")
  @UseGuards(JwtAuthGuard)
  async getMyGuildLinks(@CurrentUser("sub") userId: string) {
    const guilds = await this.discordService.getGuildLinksForUser(userId);

    return {
      home: {
        guildId: this.configService.get<string>("DISCORD_GUILD_ID") || null,
        guildName: "넥서스 서버",
      },
      guilds,
    };
  }

  /**
   * Discord가 봇 설치 후 리다이렉트하는 콜백. guild_id와 state를 받아
   * 해당 길드를 유저에게 PENDING으로 바인딩한 뒤 웹 설정 페이지로 보낸다.
   * (브라우저 리다이렉트라 JWT 헤더 없음 — state 토큰으로 본인 확인)
   */
  @Get("guild-link/callback")
  async guildLinkCallback(
    @Query("guild_id") guildId: string,
    @Query("state") state: string,
    @Res() res: Response,
  ) {
    const appUrl =
      this.configService.get<string>("APP_URL") || "http://localhost:3000";

    try {
      if (!guildId || !state) {
        throw new BadRequestException("필수 파라미터 누락");
      }

      const userId = await this.authService.verifyLinkToken(
        state,
        GUILD_LINK_PURPOSE,
      );

      await this.discordService.linkGuild(userId, guildId);

      return res.redirect(`${appUrl}/settings?discord_guild=pending`);
    } catch (error: any) {
      this.logger.error(`디스코드 길드 연동 실패: ${error.message}`);
      return res.redirect(
        `${appUrl}/settings?discord_guild=error`,
      );
    }
  }
}
