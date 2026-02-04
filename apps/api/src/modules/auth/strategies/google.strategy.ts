import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "../auth.service";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const clientID = configService.get("GOOGLE_CLIENT_ID");
    const clientSecret = configService.get("GOOGLE_CLIENT_SECRET");
    const callbackURL = configService.get("GOOGLE_CALLBACK_URL");

    console.log("Google Strategy - clientID:", clientID);
    console.log("Google Strategy - callbackURL:", callbackURL);

    super({
      clientID,
      clientSecret,
      callbackURL,
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
      console.log("Google strategy - profile:", JSON.stringify(profile, null, 2));

      const { id, displayName, emails, photos } = profile;

      const user = await this.authService.validateOAuthUser({
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

      console.log("Google strategy - validated user:", JSON.stringify(user, null, 2));
      done(null, user);
    } catch (error) {
      console.error("Google strategy error:", error);
      done(error as Error, undefined);
    }
  }
}
