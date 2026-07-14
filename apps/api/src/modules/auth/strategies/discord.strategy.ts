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
    const apiUrl =
      configService.get<string>("API_URL") || "http://localhost:4000";
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
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    try {
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
        // 애니메이션 아바타(해시 a_ 시작)는 .gif, 나머지는 .png
        avatar: profile.avatar
          ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith("a_") ? "gif" : "png"}`
          : undefined,
        // 주의: accessToken/refreshToken은 DB에 저장하지 않는다.
        // 저장된 토큰을 사용하는 코드가 없고, 평문 저장 시 DB 유출 = Discord 계정 토큰 유출.
        metadata: {
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
