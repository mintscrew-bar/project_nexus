import { Injectable } from "@nestjs/common";
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
    if (Array.isArray(req.ips) && req.ips.length > 0) {
      return req.ips[0];
    }
    return req.ip ?? req.socket?.remoteAddress ?? "unknown";
  }
}
