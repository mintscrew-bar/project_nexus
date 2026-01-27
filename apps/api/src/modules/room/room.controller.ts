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
} from "@nestjs/common";
import { RoomService, CreateRoomDto, JoinRoomDto } from "./room.service";
import { SnakeDraftService } from "./snake-draft.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RoomStatus, TeamMode } from "@nexus/database";

@Controller("rooms")
@UseGuards(JwtAuthGuard)
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly snakeDraftService: SnakeDraftService,
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
    return this.roomService.createRoom(userId, dto);
  }

  @Get()
  async listRooms(
    @Query("status") status?: RoomStatus,
    @Query("teamMode") teamMode?: TeamMode,
    @Query("includePrivate") includePrivate?: string,
  ) {
    return this.roomService.listRooms({
      status,
      teamMode,
      includePrivate: includePrivate === "true",
    });
  }

  @Get(":id")
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
    @Body() body: { password?: string },
  ) {
    return this.roomService.joinRoom(userId, {
      roomId,
      password: body.password,
    });
  }

  @Post(":id/leave")
  @HttpCode(HttpStatus.OK)
  async leaveRoom(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    return this.roomService.leaveRoom(userId, roomId);
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
    @Param("id") roomId: string,
    @Query("limit") limit?: string,
  ) {
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
    return this.snakeDraftService.startSnakeDraft(userId, roomId);
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
    return this.snakeDraftService.autoPick(roomId);
  }

  @Post(":id/snake-draft/complete")
  @HttpCode(HttpStatus.OK)
  async completeSnakeDraft(
    @CurrentUser("sub") userId: string,
    @Param("id") roomId: string,
  ) {
    return this.snakeDraftService.completeDraft(roomId);
  }
}
