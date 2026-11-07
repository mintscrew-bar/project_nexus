import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Put,
  Param,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
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
  BroadcastCueDto,
  UpdateBroadcastControlDto,
} from "./dto/broadcast-control.dto";
import { MatchGateway } from "../match/match.gateway";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadService } from "../upload/upload.service";
import { UpdateBroadcastSettingsDto } from "./dto/broadcast-settings.dto";

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
    private readonly uploadService: UploadService,
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

  // ── 방송 커스터마이징 (로그인 스트리머 본인) ──

  @Get("settings")
  @UseGuards(JwtAuthGuard)
  async getSettings(@CurrentUser("sub") userId: string) {
    return this.broadcastService.getSettings(userId);
  }

  /** 전체 설정을 받아 정규화해 저장한다. 송출 중이면 오버레이가 바로 다시 그린다. */
  @Put("settings")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateSettings(
    @CurrentUser("sub") userId: string,
    @Body() body: UpdateBroadcastSettingsDto,
  ) {
    const { settings, roomId } = await this.broadcastService.updateSettings(
      userId,
      body.settings,
    );
    if (roomId) {
      this.matchGateway.emitBroadcastControl(roomId, { settingsUpdated: true });
    }
    return settings;
  }

  /** 하단바·대기 화면 로고 업로드 — 주소만 돌려주고 저장은 설정 저장 때 한다 */
  @Post("settings/logo")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("logo"))
  async uploadLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("파일이 업로드되지 않았습니다.");
    }
    const url = await this.uploadService.uploadImage(file, {
      directory: "broadcast-logos",
      maxWidth: 512,
      maxHeight: 512,
      quality: 86,
    });
    return { url };
  }

  // ── 로그인 조작 패널 ──
  @Post("settings/transition")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("transition", { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async uploadTransition(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("파일이 업로드되지 않았습니다.");
    return { url: await this.uploadService.uploadBroadcastTransition(file) };
  }
  @Post("settings/background")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("background", { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadBackground(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("파일이 업로드되지 않았습니다.");
    const url = await this.uploadService.uploadImage(file, {
      directory: "broadcast-backgrounds",
      maxWidth: 2560,
      maxHeight: 1440,
      quality: 88,
    });
    return { url };
  }

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

  /** 조작 패널 송출 미리보기용 단기 토큰 (본인 화면만, 12시간) */
  @Get("control/preview-token")
  @UseGuards(JwtAuthGuard)
  async getPreviewToken(@CurrentUser("sub") userId: string) {
    return this.broadcastService.issuePreviewToken(userId);
  }

  /** 즉석 연출 — 결과 다시 보기, 선수 카드 띄우기/내리기 */
  @Post("control/cue")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sendCue(
    @CurrentUser("sub") userId: string,
    @Body() body: BroadcastCueDto,
  ) {
    const { roomId, cue } = await this.broadcastService.prepareCue(
      userId,
      body,
    );
    this.matchGateway.emitBroadcastCue(roomId, cue);
    return { ok: true, cue };
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

  /** 경매 매물 카드용 선수 프로필 — 송출 중인 방의 참가자만 (서비스 주석 참고) */
  @Get(":token/players/:userId")
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async getPlayerProfile(
    @Param("token") token: string,
    @Param("userId") userId: string,
  ) {
    return this.broadcastService.getPlayerProfile(token, userId);
  }

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
      "match-intro",
      "lineup",
      "result",
      "idle",
      "break",
    ];
    const resolvedScene = validScenes.includes(scene as BroadcastScene)
      ? (scene as BroadcastScene)
      : "room";
    return this.broadcastService.getSnapshot(token, resolvedScene, matchId);
  }
}
