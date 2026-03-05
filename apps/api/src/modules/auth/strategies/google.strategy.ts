import { Injectable, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get("GOOGLE_CLIENT_ID"),
      clientSecret: configService.get("GOOGLE_CLIENT_SECRET"),
      callbackURL: configService.get("GOOGLE_CALLBACK_URL"),
      scope: ["email", "profile"],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { id, displayName, emails, photos } = profile;

      const result = await this.authService.validateOAuthUser({
        provider: "google",
        providerId: id,
        email: emails?.[0]?.value,
        username: displayName || `Google_${id.slice(0, 8)}`,
        avatar: photos?.[0]?.value,
        metadata: {
          accessToken,
          refreshToken,
        },
      });

      // { user, isNewUser } 형태로 반환하여 컨트롤러에서 신규 여부 판단
      done(null, result);
    } catch (error) {
      this.logger.error(`Google OAuth 검증 실패: ${(error as Error).message}`);
      done(error as Error, undefined);
    }
  }
}
