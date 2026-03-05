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
    super({
      clientID: configService.get("DISCORD_CLIENT_ID"),
      clientSecret: configService.get("DISCORD_CLIENT_SECRET"),
      callbackURL: configService.get("DISCORD_CALLBACK_URL"),
      scope: ["identify", "email"],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    try {
      const result = await this.authService.validateOAuthUser({
        provider: "discord",
        providerId: profile.id,
        email: profile.email,
        username:
          profile.discriminator !== "0"
            ? `${profile.username}#${profile.discriminator}`
            : profile.username,
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
