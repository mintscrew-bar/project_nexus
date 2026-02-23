import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { TokenPayload } from "../auth.service";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  constructor(private readonly configService: ConfigService) {
    // Extractor with logging to help diagnose missing/invalid refresh tokens
    const extractor = (req: Request) => {
      try {
        const val = req?.cookies?.refresh_token;
        console.log('JwtRefreshStrategy - extracted refresh_token:', val ? '[REDACTED]' : null);
        return val;
      } catch (e) {
        console.error('JwtRefreshStrategy extractor error:', e);
        return null;
      }
    };

    const secret = configService.get("JWT_REFRESH_SECRET");
    if (!secret) {
      console.warn('JWT_REFRESH_SECRET is not set in config');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractor]),
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: TokenPayload) {
    return payload;
  }
}
