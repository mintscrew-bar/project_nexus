import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { BroadcastService, BroadcastScene } from "./broadcast.service";
import {
  BroadcastControlActionDto,
  UpdateBroadcastControlDto,
} from "./dto/broadcast-control.dto";
import { MatchGateway } from "../match/match.gateway";

/**
 * 방송 오버레이 엔드포인트.
 * - 스냅샷은 공개(추측 불가 토큰으로만 인증, read-only) — OBS 브라우저 소스는 로그인 불가.
 * - 토큰 관리는 로그인 스트리머 본인만.
 */
@Controller("broadcast")
export class BroadcastController {
  constructor(
    private readonly broadcastService: BroadcastService,
    private readonly matchGateway: MatchGateway,
  ) {}

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

  // ── 조작 패널/외부 장비용 컨트롤 토큰 ──

  @Post("control-token")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createControlToken(@CurrentUser("sub") userId: string) {
    return this.broadcastService.createControlToken(userId, false);
  }

  @Post("control-token/rotate")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async rotateControlToken(@CurrentUser("sub") userId: string) {
    return this.broadcastService.createControlToken(userId, true);
  }

  @Delete("control-token")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeControlToken(@CurrentUser("sub") userId: string) {
    return this.broadcastService.revokeControlToken(userId);
  }

  // ── 로그인 조작 패널 ──

  @Get("control")
  @UseGuards(JwtAuthGuard)
  async getControlState(@CurrentUser("sub") userId: string) {
    return this.broadcastService.getControlState(userId);
  }

  @Patch("control")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateControlState(
    @CurrentUser("sub") userId: string,
    @Body() body: UpdateBroadcastControlDto,
  ) {
    const result = await this.broadcastService.updateControlState(userId, body);
    this.matchGateway.emitBroadcastControl(result.roomId, result);
    return result;
  }

  // ── Stream Deck / Ulanzi bridge 등 외부 장비용 webhook ──

  @Post("control/:controlToken/action")
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async controlAction(
    @Param("controlToken") controlToken: string,
    @Body() body: BroadcastControlActionDto,
  ) {
    const result = await this.broadcastService.updateControlStateByToken(
      controlToken,
      body,
    );
    this.matchGateway.emitBroadcastControl(result.roomId, result);
    return { ok: true, ...result };
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
      "control",
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
