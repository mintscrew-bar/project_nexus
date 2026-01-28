import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import * as bcrypt from "bcrypt";
import { AuthProviderType } from "@nexus/database";

export interface OAuthProfile {
  provider: "google" | "discord";
  providerId: string;
  email?: string;
  username: string;
  avatar?: string;
  metadata?: any;
}

export interface TokenPayload {
  sub: string; // User ID
  email?: string;
  username: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  username: string;
  termsOfService: boolean;
  privacyPolicy: boolean;
  ageVerification: boolean;
  marketingConsent?: boolean;
}

export interface LoginDto {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  // ========================================
  // OAuth (Google, Discord)
  // ========================================

  async validateOAuthUser(profile: OAuthProfile) {
    // Check if auth provider exists
    const authProvider = await this.prisma.authProvider.findUnique({
      where: {
        provider_providerId: {
          provider: profile.provider.toUpperCase() as AuthProviderType,
          providerId: profile.providerId,
        },
      },
      include: { user: true },
    });

    if (authProvider) {
      // Update user info
      const user = await this.prisma.user.update({
        where: { id: authProvider.userId },
        data: {
          username: profile.username,
          avatar: profile.avatar,
        },
      });
      return user;
    }

    // Check if email already exists
    if (profile.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (existingUser) {
        // Link OAuth provider to existing user
        await this.prisma.authProvider.create({
          data: {
            userId: existingUser.id,
            provider: profile.provider.toUpperCase() as AuthProviderType,
            providerId: profile.providerId,
            metadata: profile.metadata,
          },
        });
        return existingUser;
      }
    }

    // Create new user with OAuth provider
    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        emailVerified: !!profile.email,
        username: profile.username,
        avatar: profile.avatar,
        authProviders: {
          create: {
            provider: profile.provider.toUpperCase() as AuthProviderType,
            providerId: profile.providerId,
            metadata: profile.metadata,
          },
        },
        // Auto-agree to terms for OAuth users
        termsAgreements: {
          create: {
            termsOfService: true,
            privacyPolicy: true,
            ageVerification: true,
            marketingConsent: false,
          },
        },
      },
    });

    return user;
  }

  // ========================================
  // Email Registration & Login
  // ========================================

  async register(dto: RegisterDto) {
    // Validate terms agreement
    if (!dto.termsOfService || !dto.privacyPolicy || !dto.ageVerification) {
      throw new BadRequestException("Must agree to required terms");
    }

    // Check if email exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException("Email already registered");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        username: dto.username,
        authProviders: {
          create: {
            provider: AuthProviderType.EMAIL,
            providerId: dto.email,
          },
        },
        termsAgreements: {
          create: {
            termsOfService: dto.termsOfService,
            privacyPolicy: dto.privacyPolicy,
            ageVerification: dto.ageVerification,
            marketingConsent: dto.marketingConsent || false,
          },
        },
      },
    });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto) {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Check if restricted
    if (user.isRestricted && user.restrictedUntil) {
      if (user.restrictedUntil > new Date()) {
        throw new UnauthorizedException(
          `Account restricted until ${user.restrictedUntil.toISOString()}`,
        );
      } else {
        // Lift restriction
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isRestricted: false, restrictedUntil: null },
        });
      }
    }

    return this.generateTokens(user);
  }

  // ========================================
  // Token Management
  // ========================================

  async generateTokens(user: {
    id: string;
    email?: string | null;
    username: string;
  }) {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email || undefined,
      username: user.username,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("JWT_ACCESS_SECRET"),
        expiresIn: this.configService.get("JWT_ACCESS_EXPIRES_IN") || "15m",
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
        expiresIn: this.configService.get("JWT_REFRESH_EXPIRES_IN") || "7d",
      }),
    ]);

    // Store refresh token in database
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    // Find session
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.userId !== userId) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException("Refresh token expired");
    }

    // Check if user is restricted
    if (
      session.user.isRestricted &&
      session.user.restrictedUntil &&
      session.user.restrictedUntil > new Date()
    ) {
      throw new UnauthorizedException("Account is restricted");
    }

    // Delete old session
    await this.prisma.session.delete({ where: { id: session.id } });

    // Generate new tokens
    return this.generateTokens(session.user);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      // Delete specific session
      await this.prisma.session.deleteMany({
        where: { userId, refreshToken },
      });
    } else {
      // Delete all sessions for user
      await this.prisma.session.deleteMany({
        where: { userId },
      });
    }
  }

  async validateToken(token: string): Promise<TokenPayload | null> {
    try {
      return await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.configService.get("JWT_ACCESS_SECRET"),
      });
    } catch {
      return null;
    }
  }

  // ========================================
  // User Retrieval
  // ========================================

  async getUserById(id: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: {
          authProviders: true,
          riotAccounts: {
            where: { isPrimary: true },
            include: {
              championPreferences: {
                orderBy: { order: "asc" },
              },
            },
          },
          clanMemberships: {
            include: {
              clan: true,
            },
          },
        },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // Remove sensitive fields
      const { password: _password, ...safeUser } = user;
      return safeUser;

    } catch (e) {
      console.error("Error in getUserById:", e);
      throw e; // Re-throw the original error to trigger a 500 response
    }
  }
}
