import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { TokenPayload } from "../auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>("JWT_ACCESS_SECRET")!,
    });
  }

  async validate(payload: TokenPayload & { jti?: string }) {
    // jti 블랙리스트 확인 — 로그아웃된 토큰 즉시 차단
    // 탈취된 토큰을 admin이 강제 무효화한 경우도 여기서 차단됨
    if (payload.jti) {
      const isBlacklisted = await this.redis.exists(
        `blacklist:jti:${payload.jti}`,
      );
      if (isBlacklisted) {
        throw new UnauthorizedException(
          "토큰이 만료되었습니다. 다시 로그인해주세요.",
        );
      }
    }

    return payload;
  }
}
