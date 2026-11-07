import { ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";
import { verify } from "jsonwebtoken";
import { getClientIp } from "../utils/client-ip";

type JwtTrackerPayload = {
  sub?: unknown;
};

@Injectable()
export class AuthAwareThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions()
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * HTTP 요청에만 건다.
   * 전역 가드(APP_GUARD)라 소켓 이벤트 핸들러에도 걸리는데, 소켓에는 응답 객체가 없어
   * 페이로드 없이 온 이벤트("unsubscribe-room-list" 등)에서 setResponseHeader 가
   * undefined.header 를 읽다 터졌다. 소켓 이벤트 제한은 게이트웨이의 guardAction 이 맡는다.
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    return super.shouldSkip(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token = this.getBearerToken(req);
    const secret = this.configService.get<string>("JWT_ACCESS_SECRET");

    if (token && secret) {
      try {
        const payload = verify(token, secret) as JwtTrackerPayload;
        if (typeof payload.sub === "string" && payload.sub.length > 0) {
          return `user:${payload.sub}`;
        }
      } catch {
        // Invalid tokens fall back to the IP tracker so anonymous abuse stays grouped.
      }
    }

    return `ip:${this.getClientIp(req)}`;
  }

  private getBearerToken(req: Record<string, any>): string | null {
    const raw = req.headers?.authorization;
    if (typeof raw !== "string") return null;
    const [scheme, token] = raw.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) return null;
    return token;
  }

  private getClientIp(req: Record<string, any>): string {
    // req.ips[0]은 X-Forwarded-For의 맨 앞 값이라 클라이언트가 위조할 수 있다.
    // trust proxy 설정을 반영한 req.ip만 사용한다. (common/utils/client-ip.ts 참고)
    return getClientIp(req);
  }
}
