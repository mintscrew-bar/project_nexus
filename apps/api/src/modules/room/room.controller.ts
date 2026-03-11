import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { RoomService } from "./room.service";
import { CreateRoomDto } from "./dto";
import { SnakeDraftService } from "./snake-draft.service";
import { SnakeDraftGateway } from "./snake-draft.gateway";
import { RoomGateway } from "./room.gateway";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { RoomStatus, TeamMode } from "@nexus/database";
import { AuctionService } from "../auction/auction.service";
import { AuctionGateway } from "../auction/auction.gateway";
import { RoleSelectionService } from "../role-selection/role-selection.service";
import { RoleSelectionGateway } from "../role-selection/role-selection.gateway";
import { MatchGateway } from "../match/match.gateway";

@Controller("rooms")
@UseGuards(JwtAuthGuard)
export class RoomController {
  private readonly logger = new Logger(RoomController.name);

  constructor(
    private readonly roomService: RoomService,
    private readonly snakeDraftService: SnakeDraftService,
    private readonly snakeDraftGateway: SnakeDraftGateway,
    private readonly roomGateway: RoomGateway,
    @Inject(forwardRef(() => AuctionService))
    private readonly auctionService: AuctionService,
    @Inject(forwardRef(() => AuctionGateway))
    private readonly auctionGateway: AuctionGateway,
    @Inject(forwardRef(() => RoleSelectionService))
    private readonly roleSelectionService: RoleSelectionService,
    @Inject(forwardRef(() => RoleSelectionGateway))
    private readonly roleSelectionGateway: RoleSelectionGateway,
    private readonly matchGateway: MatchGateway,
  ) {}

  // ========================================
  // Room CRUD
  // ========================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRoom(
    @CurrentUser("sub") userId: string,
    @Body() dto: CreateRoomDto,
  ) {
    const room = await this.roomService.createRoom(userId, dto);
    // Broadcast room list update
    this.roomGateway.broadcastRoomListUpdate();
    return room;
  }

  @Get()
  @Public()
  async listRooms(
    @Query("status") status?: RoomStatus,
    @Query("teamMode") teamMode?: TeamMode,
    @Query("includePrivate") includePrivate?: string,
  ) {
    try {
      return await this.roomService.listRooms({
        status,
        teamMode,
        includePrivate: includePrivate === "true",
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `listRooms failed: ${err?.message ?? String(error)}`,
        err?.stack ?? "",
      );
      throw error;
    }
  }

  @Get(":id")
  @Public()
  async getRoom(@Param("id") id: string) {
    return this.roomService.getRoomById(id);
  }

  @Put(":id")
  async updateRoom(
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
    @Body() updates: Partial<CreateRoomDto>,
  ) {
    return this.roomService.updateRoomSettings(userId, id, updates);
  }

  // ========================================
  // Room Actions
  // ========================================

  @Post(":id/join")
  @HttpCode(HttpStatus.OK)
  async joinRoom(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
    @Body() body: { password?: string; asSpectator?: boolean },
  ) {
    return this.roomService.joinRoom(userId, {
      roomId,
      password: body.password,
      asSpectator: body.asSpectator,
    });
  }

  @Post(":id/toggle-spectator")
  @HttpCode(HttpStatus.OK)
  async toggleSpectator(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    return this.roomService.toggleSpectator(userId, roomId);
  }

  @Post(":id/leave")
  @HttpCode(HttpStatus.OK)
  async leaveRoom(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    return this.roomService.leaveRoom(userId, roomId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async closeRoom(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    const result = await this.roomService.closeRoom(userId, roomId);
    this.roomGateway.broadcastRoomListUpdate();
    return result;
  }

  // 토너먼트 완료 후 로비 복귀 (COMPLETED -> WAITING 리셋)
  @Post(":id/return-to-lobby")
  @HttpCode(HttpStatus.OK)
  async returnToLobby(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    const result = await this.roomService.returnToLobby(userId, roomId);

    // 인메모리 상태 정리 (이미 완료된 상태지만 방어적으로)
    this.snakeDraftService.clearDraftState(roomId);
    this.auctionService.clearAuctionState(roomId);
    this.roleSelectionService.clearRoleSelectionState(roomId);

    // 룸 리스트 갱신 브로드캐스트
    this.roomGateway.broadcastRoomListUpdate();

    // room-updated 이벤트로 로비에 있는 모든 클라이언트에 갱신된 방 데이터 전송
    if (result.room) {
      this.roomGateway.notifyRoomUpdate(roomId, "room-updated", result.room);
    }

    return result;
  }

  @Post(":id/abort-to-lobby")
  @HttpCode(HttpStatus.OK)
  async abortToLobby(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    const result = await this.roomService.abortActiveSession(userId, roomId);

    this.snakeDraftService.clearDraftState(roomId);
    this.auctionService.clearAuctionState(roomId);
    this.roleSelectionService.clearRoleSelectionState(roomId);

    this.snakeDraftGateway.cleanupRoom(roomId);
    this.auctionGateway.cleanupRoom(roomId);
    this.roleSelectionGateway.clearRoomTimer(roomId);

    const payload = {
      roomId,
      message: result.message,
      abortedBy: userId,
      abortedAt: new Date().toISOString(),
    };

    this.auctionGateway.emitSessionAborted(roomId, payload);
    this.snakeDraftGateway.emitSessionAborted(roomId, payload);
    this.roleSelectionGateway.emitSessionAborted(roomId, payload);
    this.matchGateway.emitSessionAborted(roomId, payload);

    this.roomGateway.broadcastRoomListUpdate();
    return result;
  }

  @Delete(":id/participants/:participantId")
  async kickParticipant(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
    @Param("participantId") participantId: string,
  ) {
    return this.roomService.kickParticipant(userId, roomId, participantId);
  }

  @Post(":id/ready")
  @HttpCode(HttpStatus.OK)
  async toggleReady(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    return this.roomService.toggleReady(userId, roomId);
  }

  // ========================================
  // Chat
  // ========================================

  @Get(":id/messages")
  async getChatMessages(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
    @Query("limit") limit?: string,
  ) {
    // 방 참여자만 채팅 메시지 조회 가능
    await this.roomService.assertParticipant(userId, roomId);
    return this.roomService.getChatMessages(
      roomId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post(":id/messages")
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
    @Body() body: { content: string },
  ) {
    return this.roomService.sendChatMessage(userId, roomId, body.content);
  }

  // ========================================
  // Snake Draft
  // ========================================

  @Post(":id/snake-draft/start")
  @HttpCode(HttpStatus.OK)
  async startSnakeDraft(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    const result = await this.snakeDraftService.startSnakeDraft(userId, roomId);

    // Broadcast draft-started to all connected clients + start auto-pick timer
    const clientState =
      await this.snakeDraftService.getClientDraftState(roomId);
    if (clientState) {
      this.snakeDraftGateway.emitDraftStarted(roomId, clientState);
    }
    this.roomGateway.broadcastRoomListUpdate();

    return result;
  }

  @Post(":id/snake-draft/pick")
  @HttpCode(HttpStatus.OK)
  async makeSnakeDraftPick(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
    @Body() body: { targetPlayerId: string },
  ) {
    return this.snakeDraftService.makePick(userId, roomId, body.targetPlayerId);
  }

  @Get(":id/snake-draft/state")
  async getSnakeDraftState(@Param("id") roomId: string) {
    const state = this.snakeDraftService.getDraftState(roomId);
    if (!state) {
      return { error: "Draft not started" };
    }
    return { state };
  }

  @Post(":id/snake-draft/auto-pick")
  @HttpCode(HttpStatus.OK)
  async autoPickSnakeDraft(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    // 호스트만 자동픽 실행 가능
    await this.roomService.assertHost(userId, roomId);
    return this.snakeDraftService.autoPick(roomId);
  }

  @Post(":id/snake-draft/complete")
  @HttpCode(HttpStatus.OK)
  async completeSnakeDraft(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    // 호스트만 드래프트 완료 가능
    await this.roomService.assertHost(userId, roomId);
    return this.snakeDraftService.completeDraft(roomId);
  }
}
