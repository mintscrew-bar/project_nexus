import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { BroadcastService, BroadcastScene } from "./broadcast.service";

/**
 * 방송 오버레이 엔드포인트.
 * - 스냅샷은 공개(추측 불가 토큰으로만 인증, read-only) — OBS 브라우저 소스는 로그인 불가.
 * - 토큰 관리는 로그인 스트리머 본인만.
 */
@Controller("broadcast")
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  // ── 스트리머 토큰 관리 (로그인 필요) ──

  // 현재 토큰 상태(존재 여부/발급 시각). 원문은 노출하지 않음.
  @Get("token")
  @UseGuards(JwtAuthGuard)
  async getTokenStatus(@CurrentUser("sub") userId: string) {
    return this.broadcastService.getTokenStatus(userId);
  }

  // 토큰 발급 (없을 때만 원문 반환)
  @Post("token")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createToken(@CurrentUser("sub") userId: string) {
    return this.broadcastService.createToken(userId, false);
  }

  // 토큰 재생성 (기존 무효화 후 새 원문 반환)
  @Post("token/rotate")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async rotateToken(@CurrentUser("sub") userId: string) {
    return this.broadcastService.createToken(userId, true);
  }

  // 토큰 비활성화
  @Delete("token")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeToken(@CurrentUser("sub") userId: string) {
    return this.broadcastService.revokeToken(userId);
  }

  // ── 공개 스냅샷 (OBS) ──

  @Get(":token/snapshot")
  @Public()
  async getSnapshot(
    @Param("token") token: string,
    @Query("scene") scene?: string,
    @Query("matchId") matchId?: string,
  ) {
    const validScenes: BroadcastScene[] = [
      "room",
      "match",
      "bracket",
      "result",
      "break",
    ];
    const resolvedScene = validScenes.includes(scene as BroadcastScene)
      ? (scene as BroadcastScene)
      : "room";
    return this.broadcastService.getSnapshot(token, resolvedScene, matchId);
  }
}
