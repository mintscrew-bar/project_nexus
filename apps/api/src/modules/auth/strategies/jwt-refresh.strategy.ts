import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { TokenPayload } from "../auth.service";

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  constructor(private readonly configService: ConfigService) {
    const extractor = (req: Request) => {
      try {
        return req?.cookies?.refresh_token;
      } catch (_e) {
        return null;
      }
    };

    const secret = configService.get("JWT_REFRESH_SECRET");
    if (!secret) {
      console.warn("JWT_REFRESH_SECRET is not set in config");
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
