import { Injectable, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, Profile } from "passport-discord";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, "discord") {
  private readonly logger = new Logger(DiscordStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const apiUrl = configService.get<string>("API_URL") || "http://localhost:4000";
    const callbackURL =
      configService.get<string>("DISCORD_CALLBACK_URL") ||
      `${apiUrl}/api/auth/discord/callback`;

    super({
      clientID: configService.get<string>("DISCORD_CLIENT_ID")!,
      clientSecret: configService.get<string>("DISCORD_CLIENT_SECRET")!,
      callbackURL,
      scope: ["identify", "email"],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    try {
      // [임시] Discord profile 객체 확인용 로그
      this.logger.log(`Discord profile: ${JSON.stringify(profile, null, 2)}`);

      const result = await this.authService.validateOAuthUser({
        provider: "discord",
        providerId: profile.id,
        email: profile.email,
        // global_name(표시 이름)이 있으면 우선 사용, 없으면 username 사용
        username:
          (profile as any).global_name ||
          (profile.discriminator !== "0"
            ? `${profile.username}#${profile.discriminator}`
            : profile.username),
        avatar: profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
          : undefined,
        metadata: {
          accessToken,
          refreshToken,
          discriminator: profile.discriminator,
        },
      });

      // { user, isNewUser } 형태로 반환하여 컨트롤러에서 신규 여부 판단
      return result;
    } catch (error) {
      this.logger.error(`Discord OAuth 검증 실패: ${(error as Error).message}`);
      throw error;
    }
  }
}
