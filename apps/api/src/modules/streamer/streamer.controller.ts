import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { StreamerPlatform, UserRole } from "@nexus/database";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { StreamerService } from "./streamer.service";
import { StreamerVerificationService } from "./streamer-verification.service";
import { VerifyChannelDto } from "./dto";

@Controller("streamers")
export class StreamerController {
  constructor(
    private readonly streamerService: StreamerService,
    private readonly verificationService: StreamerVerificationService,
  ) {}

  // ── 공개 ──────────────────────────────────────────────────────────────

  /** 스트리머 탭 목록 — 방송 중인 스트리머가 위로 올라온다 */
  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  list() {
    return this.streamerService.listStreamers();
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
