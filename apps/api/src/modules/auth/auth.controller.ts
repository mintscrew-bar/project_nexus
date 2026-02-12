import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpStatus,
  HttpCode,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { AuthService, RegisterDto, LoginDto } from "./auth.service";
import { JwtRefreshGuard } from "./guards/jwt-refresh.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";

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
    const user = req.user as any;
    const refreshToken = req.cookies?.refresh_token;

    const tokens = await this.authService.refreshTokens(user.sub, refreshToken);

    res.cookie("refresh_token", tokens.refreshToken, {
      httpOnly: true,
      secure: this.configService.get("NODE_ENV") === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    return res.json({ accessToken: tokens.accessToken });
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
  // User Info
  // ========================================

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser("sub") userId: string) {
    return this.authService.getUserById(userId);
  }
}
