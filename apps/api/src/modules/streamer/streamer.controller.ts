import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { StreamerPlatform, UserRole } from "@nexus/database";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { StreamerService } from "./streamer.service";
import { StreamerVerificationService } from "./streamer-verification.service";
import { VerifyChannelDto } from "./dto";
import { ChzzkOAuthService } from "./chzzk-oauth.service";

@Controller("streamers")
export class StreamerController {
  constructor(
    private readonly streamerService: StreamerService,
    private readonly verificationService: StreamerVerificationService,
    private readonly chzzkOAuth: ChzzkOAuthService,
  ) {}

  // ── 공개 ──────────────────────────────────────────────────────────────

  /** 스트리머 탭 목록 — 방송 중인 스트리머가 위로 올라온다 */
  @Get()
  @UseGuards(OptionalJwtGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  list(@CurrentUser("id") viewerId?: string) {
    return this.streamerService.listStreamers(viewerId);
  }

  // ── 팔로우 ────────────────────────────────────────────────────────────

  /** 방송 시작 알림 구독 */
  @Post(":streamerId/follow")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  follow(
    @CurrentUser("id") userId: string,
    @Param("streamerId") streamerId: string,
  ) {
    return this.streamerService.follow(userId, streamerId);
  }

  @Delete(":streamerId/follow")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  unfollow(
    @CurrentUser("id") userId: string,
    @Param("streamerId") streamerId: string,
  ) {
    return this.streamerService.unfollow(userId, streamerId);
  }

  // ── 본인 채널 인증 ────────────────────────────────────────────────────

  /** 인증 코드 발급 */
  @Post("verify/code")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  issueCode(@CurrentUser("id") userId: string, @Body() dto: VerifyChannelDto) {
    return this.verificationService.issueCode(userId, dto.platform);
  }

  /** 인증 확인 — 채널 소개글의 코드를 대조한다 */
  @Post("verify/confirm")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  confirm(@CurrentUser("id") userId: string, @Body() dto: VerifyChannelDto) {
    return this.verificationService.confirm(userId, dto.platform);
  }

  /** 치지직 공식 OAuth로 로그인한 계정의 채널을 즉시 인증한다. */
  @Post("verify/chzzk/oauth")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  startChzzkOAuth(@CurrentUser("id") userId: string) {
    return this.chzzkOAuth.createAuthorizationUrl(userId);
  }

  @Get("verify/chzzk/callback")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async finishChzzkOAuth(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() response: Response,
  ) {
    try {
      await this.chzzkOAuth.completeAuthorization(code, state);
      return response.redirect(this.chzzkOAuth.getSettingsRedirect("success"));
    } catch {
      return response.redirect(this.chzzkOAuth.getSettingsRedirect("error"));
    }
  }

  // ── 관리자 ────────────────────────────────────────────────────────────

  @Get("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  listForAdmin(
    @Query("verified") verified?: "all" | "verified" | "pending",
    @Query("search") search?: string,
  ) {
    return this.streamerService.listForAdmin({ verified, search });
  }

  /** 수동 인증 승인/해제 — 자동 대조가 안 되는 플랫폼용 */
  @Patch("admin/:id/verified")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  setVerified(
    @Param("id") id: string,
    @Body("verified", ParseBoolPipe) verified: boolean,
  ) {
    return this.streamerService.setVerified(id, verified);
  }

  /** 목록 노출 토글 */
  @Patch("admin/:id/active")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  setActive(
    @Param("id") id: string,
    @Body("isActive", ParseBoolPipe) isActive: boolean,
  ) {
    return this.streamerService.setActive(id, isActive);
  }

  /** 라이브 상태 즉시 갱신 — 관리자가 폴링을 기다리지 않고 확인할 때 */
  @Post("admin/refresh")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  refresh() {
    return this.streamerService.refreshAllLiveStates();
  }

  /** 단일 채널 라이브 상태 (프로필 페이지 등에서 on-demand 조회) */
  @Get(":platform/:channelId/live")
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  liveState(
    @Param("platform") platform: StreamerPlatform,
    @Param("channelId") channelId: string,
  ) {
    return this.streamerService.getLiveState(platform, channelId);
  }
}
