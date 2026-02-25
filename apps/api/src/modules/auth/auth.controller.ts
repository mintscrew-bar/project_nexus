import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { Request, Response } from "express";
import { AuthService, LoginDto, RegisterDto } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // ========================================
  // Email Registration & Login
  // ========================================

  @Post("register")
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

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const tokens = await this.authService.login(dto);

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
  // Google OAuth
  // ========================================

  @Get("google")
  @UseGuards(AuthGuard("google"))
  googleAuth() {
    // Passport가 Google로 리다이렉트함
  }

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const user = req.user as any;
      console.log("Google callback - user:", JSON.stringify(user, null, 2));
      const tokens = await this.authService.generateTokens(user);

      const appUrl =
        this.configService.get("APP_URL") || "http://localhost:3000";
      res.redirect(
        `${appUrl}/api/auth/callback?access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}`,
      );
    } catch (error) {
      console.error("Google callback error:", error);
      const appUrl =
        this.configService.get("APP_URL") || "http://localhost:3000";
      res.redirect(
        `${appUrl}/auth/login?error=${encodeURIComponent(String(error))}`,
      );
    }
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
    try {
      const user = req.user as any;
      console.log("Discord callback - user:", JSON.stringify(user, null, 2));
      const tokens = await this.authService.generateTokens(user);

      const appUrl =
        this.configService.get("APP_URL") || "http://localhost:3000";
      res.redirect(
        `${appUrl}/api/auth/callback?access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}`,
      );
    } catch (error) {
      console.error("Discord callback error:", error);
      const appUrl =
        this.configService.get("APP_URL") || "http://localhost:3000";
      res.redirect(
        `${appUrl}/auth/login?error=${encodeURIComponent(String(error))}`,
      );
    }
  }

  // ========================================
  // Token Management
  // ========================================

  @Post("refresh")
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
      console.error(
        "AuthController.refresh - error:",
        err instanceof Error ? err.stack || err.message : err,
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
    const linkToken = await this.authService.generateLinkToken(userId, "discord");

    // Redirect to Discord OAuth with link token in state
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${this.configService.get("DISCORD_CLIENT_ID")}&redirect_uri=${encodeURIComponent(this.configService.get("DISCORD_LINK_CALLBACK_URL") || this.configService.get("DISCORD_CALLBACK_URL")?.replace("/callback", "/link/callback") || "")}&response_type=code&scope=identify%20email&state=${linkToken}`;

    return res.redirect(discordAuthUrl);
  }

  @Get("link/discord/callback")
  async linkDiscordCallback(@Query("code") code: string, @Query("state") linkToken: string, @Res() res: Response) {
    try {
      // Verify link token and get userId
      const userId = await this.authService.verifyLinkToken(linkToken, "discord");

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

      const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";
      return res.redirect(`${appUrl}/settings?linked=discord&success=true`);
    } catch (error: any) {
      const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";
      return res.redirect(`${appUrl}/settings?linked=discord&success=false&error=${encodeURIComponent(error.message)}`);
    }
  }

  @Get("link/google")
  @UseGuards(JwtAuthGuard)
  async linkGoogle(@CurrentUser("sub") userId: string, @Res() res: Response) {
    const linkToken = await this.authService.generateLinkToken(userId, "google");

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.configService.get("GOOGLE_CLIENT_ID")}&redirect_uri=${encodeURIComponent(this.configService.get("GOOGLE_LINK_CALLBACK_URL") || this.configService.get("GOOGLE_CALLBACK_URL")?.replace("/callback", "/link/callback") || "")}&response_type=code&scope=email%20profile&state=${linkToken}`;

    return res.redirect(googleAuthUrl);
  }

  @Get("link/google/callback")
  async linkGoogleCallback(@Query("code") code: string, @Query("state") linkToken: string, @Res() res: Response) {
    try {
      const userId = await this.authService.verifyLinkToken(linkToken, "google");
      const profile = await this.authService.getGoogleProfile(code);

      await this.authService.linkOAuthProvider(userId, {
        provider: "google",
        providerId: profile.id,
        email: profile.email,
        username: profile.name,
        avatar: profile.picture,
        metadata: {},
      });

      const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";
      return res.redirect(`${appUrl}/settings?linked=google&success=true`);
    } catch (error: any) {
      const appUrl = this.configService.get("APP_URL") || "http://localhost:3000";
      return res.redirect(`${appUrl}/settings?linked=google&success=false&error=${encodeURIComponent(error.message)}`);
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
