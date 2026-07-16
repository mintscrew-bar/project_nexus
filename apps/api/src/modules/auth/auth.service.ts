import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthProviderType } from "@nexus/database";
import * as bcrypt from "bcrypt";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const REFRESH_COOKIE_PREFIX = "v2";
const REFRESH_TOKEN_HASH_PREFIX = "sha256:";

export interface OAuthProfile {
  provider: "discord";
  providerId: string;
  email?: string;
  username: string;
  avatar?: string;
  metadata?: any;
}

export interface TokenPayload {
  sub: string; // User ID
  username: string;
  role: string; // UserRole: USER | MODERATOR | ADMIN
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

  /**
   * 필수 약관 동의(서비스/개인정보/연령)가 완료되었는지 확인
   */
  private async hasRequiredTermsAgreement(userId: string): Promise<boolean> {
    const agreement = await this.prisma.termsAgreement.findFirst({
      where: {
        userId,
        termsOfService: true,
        privacyPolicy: true,
        ageVerification: true,
      },
      select: { id: true },
    });

    return !!agreement;
  }

  /**
   * OAuth 유저 검증 및 생성
   * @returns { user, isNewUser } — isNewUser가 true이면 약관 동의 페이지로 리다이렉트 필요
   */
  async validateOAuthUser(
    profile: OAuthProfile,
  ): Promise<{ user: any; isNewUser: boolean }> {
    // 이미 연동된 OAuth 제공자가 있으면 기존 유저로 처리
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
      const hasTermsAgreement = await this.hasRequiredTermsAgreement(
        authProvider.userId,
      );

      // 재로그인 시 커스텀 아바타는 유지하되, Discord CDN URL이면 항상 최신으로 갱신
      // (Discord는 프로필 사진 변경 시 이전 CDN 해시를 삭제하므로 갱신 필수)
      const updateData: Record<string, string> = {};
      if (profile.avatar) {
        const current = authProvider.user.avatar ?? "";
        // 부분 문자열 매칭(cdn.discordapp.com.evil.com 우회)을 막기 위해
        // URL 호스트명을 파싱해 정확히 Discord CDN 도메인인지 확인한다.
        let isDiscordAvatar = false;
        try {
          const host = new URL(current).hostname.toLowerCase();
          isDiscordAvatar =
            host === "cdn.discordapp.com" || host.endsWith(".discordapp.com");
        } catch {
          // URL 파싱 실패(빈 값/상대경로 등)는 Discord 아바타가 아님
          isDiscordAvatar = false;
        }
        if (!current || isDiscordAvatar) {
          updateData.avatar = profile.avatar;
        }
      }

      if (Object.keys(updateData).length > 0) {
        const updated = await this.prisma.user.update({
          where: { id: authProvider.userId },
          data: updateData,
        });
        return { user: updated, isNewUser: !hasTermsAgreement };
      }
      return { user: authProvider.user, isNewUser: !hasTermsAgreement };
    }

    // 동일 이메일로 기존 계정이 있으면 OAuth 제공자 연결 (신규 아님)
    if (profile.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (existingUser) {
        await this.prisma.authProvider.create({
          data: {
            userId: existingUser.id,
            provider: profile.provider.toUpperCase() as AuthProviderType,
            providerId: profile.providerId,
            metadata: profile.metadata,
          },
        });
        const hasTermsAgreement = await this.hasRequiredTermsAgreement(
          existingUser.id,
        );
        return { user: existingUser, isNewUser: !hasTermsAgreement };
      }
    }

    // 완전히 새로운 유저 — 약관 동의 없이 계정만 생성
    // 약관 동의는 /auth/agree 페이지에서 명시적으로 처리 (개인정보보호법 제21조)
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
      },
    });

    return { user, isNewUser: true };
  }

  /**
   * 신규 OAuth 가입자에게 약관 동의 전용 임시 토큰 발급 (10분 유효)
   * 정식 JWT 발급 전 약관 동의를 강제하기 위해 Redis에만 저장
   */
  async generatePendingTermsToken(userId: string): Promise<string> {
    const token = randomUUID();
    // 10분 유효 (약관을 읽고 동의하기에 충분한 시간)
    await this.redis.set(`pending_terms:${token}`, userId, 600);
    return token;
  }

  /**
   * 임시 토큰을 검증하고 userId 반환 (1회용 — 검증 후 즉시 삭제)
   */
  async verifyPendingTermsToken(token: string): Promise<string> {
    const key = `pending_terms:${token}`;
    const userId = await this.redis.get(key);
    if (!userId) {
      throw new UnauthorizedException(
        "유효하지 않거나 만료된 약관 동의 토큰입니다.",
      );
    }
    await this.redis.del(key);
    return userId;
  }

  /**
   * 사용자의 약관 동의 저장 (신규 OAuth 가입자 전용)
   */
  async agreeToTerms(
    userId: string,
    dto: {
      termsOfService: boolean;
      privacyPolicy: boolean;
      ageVerification: boolean;
      marketingConsent?: boolean;
    },
  ) {
    if (!dto.termsOfService || !dto.privacyPolicy || !dto.ageVerification) {
      throw new BadRequestException(
        "이용약관, 개인정보처리방침, 연령 확인에 동의해야 합니다.",
      );
    }

    // 이미 필수 약관 동의가 존재하면 중복 생성하지 않고 성공 처리
    const hasTermsAgreement = await this.hasRequiredTermsAgreement(userId);
    if (hasTermsAgreement) return;

    await this.prisma.termsAgreement.create({
      data: {
        userId,
        termsOfService: dto.termsOfService,
        privacyPolicy: dto.privacyPolicy,
        ageVerification: dto.ageVerification,
        marketingConsent: dto.marketingConsent || false,
      },
    });
  }

  async linkOAuthProvider(userId: string, profile: OAuthProfile) {
    // Check if this OAuth account is already linked to another user
    const existingProvider = await this.prisma.authProvider.findUnique({
      where: {
        provider_providerId: {
          provider: profile.provider.toUpperCase() as AuthProviderType,
          providerId: profile.providerId,
        },
      },
    });

    if (existingProvider) {
      if (existingProvider.userId === userId) {
        throw new ConflictException("This account is already linked");
      } else {
        throw new ConflictException(
          "This account is already linked to another user",
        );
      }
    }

    // Link OAuth provider to user
    await this.prisma.authProvider.create({
      data: {
        userId,
        provider: profile.provider.toUpperCase() as AuthProviderType,
        providerId: profile.providerId,
        metadata: profile.metadata,
      },
    });

    // Update user avatar if not set
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.avatar && profile.avatar) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatar: profile.avatar },
      });
    }

    return { success: true, message: "Account linked successfully" };
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

  async login(dto: LoginDto, ip: string = "unknown") {
    const failKey = `login_fail:${dto.email}:${ip}`;
    const lockKey = `login_lock:${dto.email}`;

    // 계정 잠금 확인 (10회 이상 실패 → 30분 잠금)
    const accountLocked = await this.redis.exists(lockKey);
    if (accountLocked) {
      throw new HttpException(
        "로그인 시도가 너무 많습니다. 30분 후에 다시 시도해주세요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // IP+이메일 조합 잠금 확인 (5회 이상 실패 → 15분 잠금)
    const failCountStr = await this.redis.get(failKey);
    const failCount = failCountStr ? parseInt(failCountStr, 10) || 0 : 0;
    if (failCount >= 5) {
      throw new HttpException(
        "로그인 시도가 너무 많습니다. 15분 후에 다시 시도해주세요.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.password) {
      // 실패 카운터 증가 (유저가 없어도 타이밍 공격 방지를 위해 카운트)
      await this.incrementLoginFailure(failKey, lockKey);
      throw new UnauthorizedException("Invalid credentials");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      // 실패 카운터 증가
      await this.incrementLoginFailure(failKey, lockKey);
      throw new UnauthorizedException("Invalid credentials");
    }

    // 로그인 성공 → 실패 카운터 초기화
    await Promise.all([this.redis.del(failKey), this.redis.del(lockKey)]);

    // Check if banned
    if (user.isBanned) {
      if (user.banUntil && user.banUntil <= new Date()) {
        // Temporary ban expired — lift it
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isBanned: false,
            banReason: null,
            bannedAt: null,
            banUntil: null,
          },
        });
      } else {
        const until = user.banUntil
          ? ` until ${user.banUntil.toISOString()}`
          : " permanently";
        throw new UnauthorizedException(
          `Account is banned${until}. Reason: ${user.banReason || "N/A"}`,
        );
      }
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

  /**
   * 로그인 실패 카운터 증가 및 계정 잠금 처리
   * - IP+이메일 조합: 15분 TTL
   * - 10회 이상 실패 시 계정 자체를 30분 잠금
   */
  private async incrementLoginFailure(
    failKey: string,
    lockKey: string,
  ): Promise<void> {
    const count = await this.redis.incr(failKey);

    // 첫 번째 실패 시 TTL 설정 (15분)
    if (count === 1) {
      await this.redis.expire(failKey, 900);
    }

    // 10회 이상 실패 시 계정 잠금 (30분)
    if (count >= 10) {
      await this.redis.set(lockKey, "1", 1800);
    }
  }

  // ========================================
  // Token Management
  // ========================================

  private getRefreshCookieKey(): Buffer {
    const secret =
      this.configService.get<string>("REFRESH_COOKIE_SECRET") ||
      this.configService.get<string>("JWT_REFRESH_SECRET");

    if (!secret) {
      throw new UnauthorizedException(
        "Refresh token encryption is not configured",
      );
    }

    return createHash("sha256").update(secret).digest();
  }

  private sealSensitiveValue(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.getRefreshCookieKey(),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      REFRESH_COOKIE_PREFIX,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  private unsealSensitiveValue(value: string): string | null {
    const parts = value.split(".");
    if (parts[0] !== REFRESH_COOKIE_PREFIX || parts.length !== 4) {
      return null;
    }

    try {
      const [, iv, tag, encrypted] = parts;
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.getRefreshCookieKey(),
        Buffer.from(iv, "base64url"),
      );
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64url")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      return null;
    }
  }

  createRefreshCookieValue(refreshToken: string): string {
    return this.sealSensitiveValue(refreshToken);
  }

  readRefreshTokenCookie(cookieValue?: string | null): string | null {
    if (!cookieValue) return null;

    const parts = cookieValue.split(".");
    if (parts[0] !== REFRESH_COOKIE_PREFIX) {
      return cookieValue; // legacy plaintext refresh-token cookie
    }

    return this.unsealSensitiveValue(cookieValue);
  }

  shouldUpgradeRefreshCookie(cookieValue?: string | null): boolean {
    return (
      !!cookieValue && !cookieValue.startsWith(`${REFRESH_COOKIE_PREFIX}.`)
    );
  }

  private hashRefreshToken(refreshToken: string): string {
    return `${REFRESH_TOKEN_HASH_PREFIX}${createHash("sha256")
      .update(refreshToken)
      .digest("base64url")}`;
  }

  /**
   * Check if user is banned/restricted before issuing tokens.
   * Call this before generateTokens for OAuth flows.
   */
  async checkAccountStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isBanned: true,
        banUntil: true,
        banReason: true,
        bannedAt: true,
        isRestricted: true,
        restrictedUntil: true,
      },
    });
    if (!user) return;

    if (user.isBanned) {
      if (user.banUntil && user.banUntil <= new Date()) {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            isBanned: false,
            banReason: null,
            bannedAt: null,
            banUntil: null,
          },
        });
      } else {
        const until = user.banUntil
          ? ` until ${user.banUntil.toISOString()}`
          : " permanently";
        throw new UnauthorizedException(
          `Account is banned${until}. Reason: ${user.banReason || "N/A"}`,
        );
      }
    }

    if (user.isRestricted && user.restrictedUntil) {
      if (user.restrictedUntil > new Date()) {
        throw new UnauthorizedException(
          `Account restricted until ${user.restrictedUntil.toISOString()}`,
        );
      } else {
        await this.prisma.user.update({
          where: { id: userId },
          data: { isRestricted: false, restrictedUntil: null },
        });
      }
    }
  }

  async generateTokens(user: {
    id: string;
    email?: string | null;
    username: string;
    role?: string;
  }) {
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role || "USER",
    };

    // access token에도 jti 포함 — 로그아웃 시 블랙리스트 등록에 사용
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("JWT_ACCESS_SECRET"),
        expiresIn: this.configService.get("JWT_ACCESS_EXPIRES_IN") || "15m",
        jwtid: randomUUID(),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
        expiresIn: this.configService.get("JWT_REFRESH_EXPIRES_IN") || "7d",
        jwtid: randomUUID(),
      }),
    ]);

    // Store only a one-way hash; the raw refresh token lives only in the HTTP-only cookie.
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(userId: string, refreshToken?: string | null) {
    if (!refreshToken) {
      throw new UnauthorizedException("Missing refresh token");
    }

    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    let usedLegacyPlaintextSession = false;

    // Validate session (DB read only — no rotation)
    let session = await this.prisma.session.findUnique({
      where: { refreshToken: refreshTokenHash },
      include: { user: true },
    });

    if (!session) {
      session = await this.prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true },
      });
      usedLegacyPlaintextSession = !!session;
    }

    if (!session || session.userId !== userId) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException("Refresh token expired");
    }

    // Check if user is banned
    if (session.user.isBanned) {
      if (!session.user.banUntil || session.user.banUntil > new Date()) {
        throw new UnauthorizedException("Account is banned");
      }
    }

    // Check if user is restricted
    if (
      session.user.isRestricted &&
      session.user.restrictedUntil &&
      session.user.restrictedUntil > new Date()
    ) {
      throw new UnauthorizedException("Account is restricted");
    }

    if (usedLegacyPlaintextSession) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { refreshToken: refreshTokenHash },
      });
    }

    // Issue a new access token only — refresh token stays the same.
    // No session rotation means: no race condition with multiple tabs,
    // no unnecessary DB writes on every page refresh.
    const payload: TokenPayload = {
      sub: session.user.id,
      username: session.user.username,
      role: session.user.role || "USER",
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get("JWT_ACCESS_SECRET"),
      expiresIn: this.configService.get("JWT_ACCESS_EXPIRES_IN") || "15m",
    });

    return { accessToken };
  }

  async logout(
    userId: string,
    refreshToken?: string | null,
    accessToken?: string,
  ) {
    if (refreshToken) {
      // Delete specific session
      await this.prisma.session.deleteMany({
        where: {
          userId,
          refreshToken: {
            in: [this.hashRefreshToken(refreshToken), refreshToken],
          },
        },
      });
    } else {
      // Delete all sessions for user
      await this.prisma.session.deleteMany({
        where: { userId },
      });
    }

    // access token의 jti를 Redis 블랙리스트에 등록
    // access token 만료 시간(기본 15분) 동안 재사용 불가하도록 TTL 설정
    if (accessToken) {
      await this.blacklistAccessToken(accessToken);
    }
  }

  /**
   * Access token을 즉시 무효화한다.
   * JWT의 jti(JWT ID)를 Redis 블랙리스트에 등록하고,
   * 토큰 만료 시간까지 남은 시간을 TTL로 설정한다.
   * 관리자가 특정 사용자를 강제 로그아웃시킬 때도 사용한다.
   */
  async blacklistAccessToken(accessToken: string): Promise<void> {
    try {
      const decoded = this.jwtService.decode(accessToken) as {
        jti?: string;
        exp?: number;
      } | null;
      if (!decoded?.jti || !decoded?.exp) return;

      const now = Math.floor(Date.now() / 1000);
      const ttlSeconds = Math.max(1, decoded.exp - now);

      await this.redis.set(`blacklist:jti:${decoded.jti}`, "1", ttlSeconds);
    } catch {
      // 블랙리스트 등록 실패는 로그아웃 자체를 실패시키지 않음
    }
  }

  /**
   * Access token의 jti가 블랙리스트에 있는지 확인한다.
   * JwtAuthGuard에서 매 요청마다 호출한다.
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    return this.redis.exists(`blacklist:jti:${jti}`);
  }

  /**
   * 특정 사용자의 모든 세션을 강제 종료하고 현재 access token을 즉시 무효화.
   * 관리자가 계정 해킹 의심 시 긴급 차단에 사용한다.
   */
  async forceLogoutUser(
    targetUserId: string,
    currentAccessToken?: string,
  ): Promise<void> {
    // 모든 refresh session 삭제
    await this.prisma.session.deleteMany({ where: { userId: targetUserId } });
    // 현재 access token도 즉시 무효화
    if (currentAccessToken) {
      await this.blacklistAccessToken(currentAccessToken);
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
        // /auth/me is consumed by the browser. Keep it deliberately small:
        // identity-provider metadata, emails, Riot identifiers, and token hashes
        // must never be serialized into a normal user session response.
        select: {
          id: true,
          username: true,
          avatar: true,
          profileBanner: true,
          role: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      return user;
    } catch (e) {
      console.error("Error in getUserById:", e);
      throw e; // Re-throw the original error to trigger a 500 response
    }
  }

  // ========================================
  // OAuth 콜백 코드 교환 (토큰 URL 노출 방지)
  // ========================================

  /**
   * OAuth 인증 완료 후 토큰을 URL에 직접 노출하지 않기 위해
   * 단회용 임시 코드(UUID)를 Redis에 저장하고 반환한다. (60초 유효)
   */
  async generateOAuthCode(tokens: {
    accessToken: string;
    refreshToken: string;
  }): Promise<string> {
    const code = randomUUID();
    await this.redis.set(
      `oauth_code:${code}`,
      this.sealSensitiveValue(JSON.stringify(tokens)),
      60, // 60초 유효 — 충분히 짧아 탈취 위험 최소화
    );
    return code;
  }

  /**
   * 임시 코드로 실제 토큰을 교환한다. 단회용이므로 조회 즉시 삭제.
   */
  async exchangeOAuthCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const key = `oauth_code:${code}`;
    const data = await this.redis.get(key);
    if (!data) {
      throw new UnauthorizedException(
        "유효하지 않거나 만료된 인증 코드입니다.",
      );
    }
    // 단회용 — 조회 즉시 삭제하여 재사용 방지
    await this.redis.del(key);
    const unsealed = this.unsealSensitiveValue(data) ?? data;
    return JSON.parse(unsealed);
  }

  // ========================================
  // Account Linking Helpers
  // ========================================

  async generateLinkToken(userId: string, provider: string): Promise<string> {
    const linkToken = randomUUID();
    const key = `link_token:${linkToken}`;

    // Store userId and provider in Redis for 5 minutes
    await this.redis.set(key, JSON.stringify({ userId, provider }), 300);

    return linkToken;
  }

  async verifyLinkToken(linkToken: string, provider: string): Promise<string> {
    const key = `link_token:${linkToken}`;
    const data = await this.redis.get(key);

    if (!data) {
      throw new UnauthorizedException("Invalid or expired link token");
    }

    const { userId, provider: storedProvider } = JSON.parse(data);

    if (storedProvider !== provider) {
      throw new UnauthorizedException("Provider mismatch");
    }

    // Delete token after use (one-time use)
    await this.redis.del(key);

    return userId;
  }

  async isValidLinkToken(
    linkToken: string,
    provider: string,
  ): Promise<boolean> {
    const key = `link_token:${linkToken}`;
    const data = await this.redis.get(key);

    if (!data) return false;

    try {
      const parsed = JSON.parse(data);
      return parsed.provider === provider && typeof parsed.userId === "string";
    } catch {
      return false;
    }
  }

  async getDiscordProfile(code: string): Promise<any> {
    // Exchange code for access token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.configService.get("DISCORD_CLIENT_ID")!,
        client_secret: this.configService.get("DISCORD_CLIENT_SECRET")!,
        grant_type: "authorization_code",
        code,
        redirect_uri:
          this.configService.get("DISCORD_LINK_CALLBACK_URL") ||
          this.configService.get("DISCORD_CALLBACK_URL") ||
          "",
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException("Failed to exchange Discord code");
    }

    const { access_token } = await tokenResponse.json();

    // Get user profile
    const profileResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new BadRequestException("Failed to get Discord profile");
    }

    const profile = await profileResponse.json();

    return {
      id: profile.id,
      username:
        profile.discriminator !== "0"
          ? `${profile.username}#${profile.discriminator}`
          : profile.username,
      email: profile.email,
      avatar: profile.avatar
        ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith("a_") ? "gif" : "png"}`
        : undefined,
    };
  }
}
