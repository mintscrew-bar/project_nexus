import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./dto";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // ========================================
  // Email Registration & Login
  // ========================================

  // 회원가입: 1분에 3회까지
  @Post("register")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const tokens = await this.authService.register(dto);

    // Set refresh token as HTTP-only cookie
    res.cookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: this.configService.get("NODE_ENV") === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/api/auth",
    });

    return res.json({
      accessToken: tokens.accessToken,
      message: "Registration successful",
    });
  }

  // 로그인: 1분에 5회까지
  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown";
    const tokens = await this.authService.login(dto, ip);

    res.cookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: this.configService.get("NODE_ENV") === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    return res.json({
      accessToken: tokens.accessToken,
      message: "Login successful",
    });
  }

  // ========================================
  // Discord OAuth
  // ========================================

  @Get("discord")
  @UseGuards(AuthGuard("discord"))
  discordAuth() {
    // Passport가 Discord로 리다이렉트함
  }

  @Get("discord/callback")
  @UseGuards(AuthGuard("discord"))
  async discordCallback(@Req() req: Request, @Res() res: Response) {
    const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";
    try {
      const { user, isNewUser } = req.user as any;
      await this.authService.checkAccountStatus(user.id);

      if (isNewUser) {
        // 신규 가입: 약관 동의 없이 임시 토큰으로 /auth/agree 페이지로 이동
        const pendingToken = await this.authService.generatePendingTermsToken(
          user.id,
        );
        return res.redirect(`${appUrl}/auth/agree?token=${pendingToken}`);
      }

      const tokens = await this.authService.generateTokens(user);
      res.redirect(
        `${appUrl}/api/auth/callback?access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}`,
      );
    } catch (error) {
      this.logger.error(`Discord OAuth 콜백 실패: ${(error as Error).message}`);
      res.redirect(`${appUrl}/auth/login?error=auth_failed`);
    }
  }

  // ========================================
  // 약관 동의 (신규 OAuth 가입자 전용)
  // ========================================

  /**
   * 신규 OAuth 가입자의 약관 동의를 처리하고 정식 JWT를 발급한다.
   * 개인정보보호법 제21조: 명시적 동의 취득 필수
   */
  @Post("agree")
  @HttpCode(HttpStatus.OK)
  async agreeToTerms(
    @Query("token") pendingToken: string,
    @Body()
    dto: {
      termsOfService: boolean;
      privacyPolicy: boolean;
      ageVerification: boolean;
      marketingConsent?: boolean;
    },
    @Res() res: Response,
  ) {
    if (!pendingToken) {
      throw new BadRequestException("약관 동의 토큰이 필요합니다.");
    }

    // 임시 토큰 검증 + userId 획득 (1회용, 검증 후 Redis에서 삭제)
    const userId = await this.authService.verifyPendingTermsToken(pendingToken);

    // 약관 동의 저장 (필수 항목 미동의 시 예외 발생)
    await this.authService.agreeToTerms(userId, dto);

    // 동의 완료 후 정식 토큰 발급
    const user = await this.authService.getUserById(userId);
    const tokens = await this.authService.generateTokens(user);

    res.cookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: this.configService.get("NODE_ENV") === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    return res.json({
      accessToken: tokens.accessToken,
      message: "약관 동의 완료",
    });
  }

  // ========================================
  // Token Management
  // ========================================

  // 토큰 갱신: 1분에 10회까지
  @Post("refresh")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtRefreshGuard)
  async refresh(@Req() req: Request, @Res() res: Response) {
    try {
      const user = req.user as any;
      const refreshToken = req.cookies?.refresh_token;

      const { accessToken } = await this.authService.refreshTokens(
        user.sub,
        refreshToken,
      );

      // Refresh token은 교체하지 않음 — 같은 토큰을 쿠키에 유지
      return res.json({ accessToken });
    } catch (err) {
      this.logger.error(
        `토큰 갱신 실패: ${err instanceof Error ? err.message : err}`,
      );
      throw err;
    }
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser("sub") userId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    await this.authService.logout(userId, refreshToken);

    res.clearCookie("refresh_token", { path: "/api/auth" });

    return res
      .status(HttpStatus.OK)
      .json({ message: "Logged out successfully" });
  }

  // ========================================
  // Account Linking (OAuth 추가 연동)
  // ========================================

  @Get("link/discord")
  @UseGuards(JwtAuthGuard)
  async linkDiscord(@CurrentUser("sub") userId: string, @Res() res: Response) {
    // Generate temporary link token (5 minutes)
    const linkToken = await this.authService.generateLinkToken(
      userId,
      "discord",
    );

    // Redirect to Discord OAuth with link token in state
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${this.configService.get("DISCORD_CLIENT_ID")}&redirect_uri=${encodeURIComponent(this.configService.get("DISCORD_LINK_CALLBACK_URL") || this.configService.get("DISCORD_CALLBACK_URL")?.replace("/callback", "/link/callback") || "")}&response_type=code&scope=identify%20email&state=${linkToken}`;

    return res.redirect(discordAuthUrl);
  }

  @Get("link/discord/callback")
  async linkDiscordCallback(
    @Query("code") code: string,
    @Query("state") linkToken: string,
    @Res() res: Response,
  ) {
    try {
      // Verify link token and get userId
      const userId = await this.authService.verifyLinkToken(
        linkToken,
        "discord",
      );

      // Exchange code for access token and get profile
      const profile = await this.authService.getDiscordProfile(code);

      // Link account
      await this.authService.linkOAuthProvider(userId, {
        provider: "discord",
        providerId: profile.id,
        email: profile.email,
        username: profile.username,
        avatar: profile.avatar,
        metadata: {},
      });

      const appUrl =
        this.configService.get("APP_URL") || "http://localhost:3000";
      return res.redirect(`${appUrl}/settings?linked=discord&success=true`);
    } catch (error: any) {
      this.logger.error(`Discord 계정 연동 실패: ${error.message}`);
      const appUrl =
        this.configService.get("APP_URL") || "http://localhost:3000";
      return res.redirect(
        `${appUrl}/settings?linked=discord&success=false&error=link_failed`,
      );
    }
  }

  // ========================================
  // User Info
  // ========================================

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser("sub") userId: string) {
    return this.authService.getUserById(userId);
  }
}
