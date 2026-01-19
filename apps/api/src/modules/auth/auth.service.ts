import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import * as bcrypt from "bcrypt";

export interface DiscordProfile {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
}

export interface TokenPayload {
  sub: string;
  discordId: string;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService
  ) {}

  async validateDiscordUser(profile: DiscordProfile) {
    let user = await this.prisma.user.findUnique({
      where: { discordId: profile.id },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          discordId: profile.id,
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar,
          email: profile.email,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          username: profile.username,
          discriminator: profile.discriminator,
          avatar: profile.avatar,
          email: profile.email,
        },
      });
    }

    return user;
  }

  async generateTokens(user: { id: string; discordId: string; username: string }) {
    const payload: TokenPayload = {
      sub: user.id,
      discordId: user.discordId,
      username: user.username,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
        expiresIn: this.configService.get("JWT_REFRESH_EXPIRES_IN") || "7d",
      }),
    ]);

    // Store refresh token hash in Redis
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.redis.set(
      `refresh_token:${user.id}`,
      refreshTokenHash,
      7 * 24 * 60 * 60 // 7 days
    );

    return { accessToken, refreshToken };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const storedHash = await this.redis.get(`refresh_token:${userId}`);

    if (!storedHash) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const isValid = await bcrypt.compare(refreshToken, storedHash);

    if (!isValid) {
      // Potential token reuse attack - invalidate all tokens
      await this.redis.del(`refresh_token:${userId}`);
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // Rotate refresh token
    return this.generateTokens(user);
  }

  async logout(userId: string) {
    await this.redis.del(`refresh_token:${userId}`);
  }

  async validateToken(token: string): Promise<TokenPayload | null> {
    try {
      return await this.jwtService.verifyAsync(token);
    } catch {
      return null;
    }
  }
}
