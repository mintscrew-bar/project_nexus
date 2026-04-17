import {
  Injectable,
  CanActivate,
  ExecutionContext,
  mixin,
  Type,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

// 플레이스홀더 값인지 확인
const isPlaceholder = (value: string | undefined): boolean => {
  if (!value) return true;
  return value.includes("your-") || value.includes("YOUR_");
};

// Discord snowflake ID는 17-19자리 숫자
const isValidDiscordSnowflake = (id: string | undefined): boolean => {
  if (!id) return false;
  return /^\d{17,19}$/.test(id);
};

/**
 * OAuth 제공자가 설정되지 않은 경우 에러 페이지로 리다이렉트하는 가드
 */
export function OptionalOAuthGuard(
  provider: "google" | "discord",
): Type<CanActivate> {
  @Injectable()
  class OptionalOAuthGuardMixin extends AuthGuard(provider) {
    private readonly isEnabled: boolean;
    private readonly errorMessage: string;

    constructor() {
      super();
      if (provider === "google") {
        this.isEnabled =
          !isPlaceholder(process.env.GOOGLE_CLIENT_ID) &&
          !isPlaceholder(process.env.GOOGLE_CLIENT_SECRET);
        this.errorMessage = "Google 로그인이 설정되지 않았습니다.";
      } else {
        this.isEnabled =
          isValidDiscordSnowflake(process.env.DISCORD_CLIENT_ID) &&
          !isPlaceholder(process.env.DISCORD_CLIENT_SECRET);
        this.errorMessage = "Discord 로그인이 설정되지 않았습니다.";
      }
    }

    canActivate(context: ExecutionContext) {
      if (!this.isEnabled) {
        const response = context.switchToHttp().getResponse();
        const appUrl = process.env.APP_URL || "http://localhost:3000";
        response.redirect(
          `${appUrl}/auth/login?error=${encodeURIComponent(this.errorMessage)}`,
        );
        return false;
      }

      return super.canActivate(context);
    }
  }

  return mixin(OptionalOAuthGuardMixin);
}
