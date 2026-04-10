import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Inject, forwardRef, OnModuleDestroy } from "@nestjs/common";
import { ShutdownService } from "../common/shutdown.service";
import { OnEvent } from "@nestjs/event-emitter";
import { Server, Socket } from "socket.io";
import { RoomService } from "./room.service";
import { SnakeDraftService } from "./snake-draft.service";
import { SnakeDraftGateway } from "./snake-draft.gateway";
import { AuthService } from "../auth/auth.service";
import { AuctionService } from "../auction/auction.service";
import { AuctionGateway } from "../auction/auction.gateway";
import { DiscordVoiceService } from "../discord/discord-voice.service";
import { RoomStatus, TeamMode } from "@nexus/database";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  namespace: "/room",
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e4,
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private socketRooms = new Map<string, string>(); // socketId -> roomId
  private readonly ROOM_LIST_CHANNEL = "room-list"; // Channel for room list updates
  private typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // roomId -> Map<userId, Timeout>
  private readonly TYPING_TIMEOUT_MS = 3000; // 3 seconds
  // Guard against concurrent start-game calls (double-click, race)
  private startingRooms = new Set<string>();

  constructor(
    private readonly roomService: RoomService,
    private readonly authService: AuthService,
    private readonly snakeDraftService: SnakeDraftService,
    private readonly snakeDraftGateway: SnakeDraftGateway,
    private readonly shutdownService: ShutdownService,
    @Inject(forwardRef(() => AuctionService))
    private readonly auctionService: AuctionService,
    @Inject(forwardRef(() => AuctionGateway))
    private readonly auctionGateway: AuctionGateway,
    @Inject("DISCORD_VOICE_SERVICE")
    private readonly discordVoiceService: DiscordVoiceService,
  ) {}

  onModuleDestroy() {
    // 타이핑 타이머 정리
    for (const roomTyping of this.typingUsers.values()) {
      for (const timeout of roomTyping.values()) {
        clearTimeout(timeout);
      }
    }
    this.typingUsers.clear();
    this.userSockets.clear();
    this.socketRooms.clear();
    this.startingRooms.clear();
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        client.disconnect();
        return;
      }

      // Validate token
      const payload = await this.authService.validateToken(token);
      if (!payload) {
        client.disconnect();
        return;
      }

      // Attach user info to socket
      client.userId = payload.sub;
      client.username = payload.username;

      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(client.id);

    } catch (error) {
      // 연결 실패 시 조용히 연결 해제
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const sockets = this.userSockets.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }

      // Leave room if in one
      const roomId = this.socketRooms.get(client.id);
      if (roomId) {
        let _autoLeft = false;
        let shouldNotifyOthers = false;

        try {
          // Only auto-leave from DB while room is in lobby state.
          // After game starts (e.g. DRAFT/IN_PROGRESS), navigation disconnects
          // should not remove participants.
          const status = await this.roomService.getRoomStatus(roomId);

          // leaveRoom 내부에서도 상태를 다시 체크하므로 이중 안전장치
          if (status === RoomStatus.WAITING) {
            try {
              await this.roomService.leaveRoom(client.userId!, roomId); // Assert client.userId is string
              _autoLeft = true;
              shouldNotifyOthers = true;
            } catch (_leaveError: any) {
              // leaveRoom 실패 (이미 나갔거나, 상태가 변경됨) — 무시
            }
          } else {
            // 게임 진행 중에도 호스트가 나가면 다음 참가자에게 호스트 이양
            try {
              const newHostId = await this.roomService.transferActiveRoomHost(
                roomId,
                client.userId!,
              );
              if (newHostId) {
                this.server.to(roomId).emit("host-changed", { newHostId });
              }
            } catch (_transferError) {
              // 이양 실패는 best-effort — 무시
            }
          }
        } catch (_error) {
          // Room might already be deleted or user not in room, ignore
        }

        // 소켓 방은 항상 나가기 (DB 상태와 무관)
        client.leave(roomId);
        this.socketRooms.delete(client.id);

        if (shouldNotifyOthers) {
          // Notify others in the room
          this.server.to(roomId).emit("user-left", {
            userId: client.userId,
            username: client.username,
          });

          // Broadcast room list update to subscribers
          this.broadcastRoomListUpdate();
        }

        // Clear typing status on disconnect
        this.stopTyping(roomId, client.userId!); // Assert client.userId is string
      }

    }
  }

  // ========================================
  // Room List Subscription
  // ========================================

  @SubscribeMessage("subscribe-room-list")
  async handleSubscribeRoomList(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.join(this.ROOM_LIST_CHANNEL);

    // Send current room list immediately
    const rooms = await this.roomService.listRooms();
    return { success: true, rooms };
  }

  @SubscribeMessage("unsubscribe-room-list")
  handleUnsubscribeRoomList(@ConnectedSocket() client: AuthenticatedSocket) {
    client.leave(this.ROOM_LIST_CHANNEL);
    return { success: true };
  }

  // Broadcast room list updates to all subscribers
  async broadcastRoomListUpdate() {
    try {
      const rooms = await this.roomService.listRooms();
      this.server.to(this.ROOM_LIST_CHANNEL).emit("room-list-updated", rooms);
    } catch (error) {
      console.error("[Room] Failed to broadcast room list update:", error);
    }
  }

  // ========================================
  // Room Events
  // ========================================

  @SubscribeMessage("join-room")
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; password?: string },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      // First, check if user is already a participant
      let room = await this.roomService.getRoomById(data.roomId);
      const isAlreadyParticipant = room.participants.some(
        (p: any) => p.userId === client.userId,
      );

      let isNewJoin = false;

      // If not a participant, join the room (add to DB)
      if (!isAlreadyParticipant) {
        room = await this.roomService.joinRoom(client.userId!, {
          // Assert client.userId is string
          roomId: data.roomId,
          password: data.password,
        });
        isNewJoin = true;
      } else {
        // 재입장: 최신 방 데이터 재조회 (상태가 변경되었을 수 있음)
        room = await this.roomService.getRoomById(data.roomId);
      }

      // Join Socket.IO room
      client.join(data.roomId);
      this.socketRooms.set(client.id, data.roomId);

      // Notify others only for new joins (not for reconnects)
      if (isNewJoin) {
        client.to(data.roomId).emit("user-joined", {
          userId: client.userId,
          username: client.username,
        });
      }

      // Broadcast updated room to all participants (including the joiner)
      this.server.to(data.roomId).emit("room-updated", room);

      // Broadcast room list update to subscribers (only for new joins)
      if (isNewJoin) {
        this.broadcastRoomListUpdate();
      }

      return {
        success: true,
        room,
      };
    } catch (error: any) {
      console.error(
        `[Room] join-room error for user ${client.userId}:`,
        error.message,
      );
      return { error: error.message };
    }
  }

  @SubscribeMessage("leave-room")
  async handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      await this.roomService.leaveRoom(client.userId!, data.roomId); // Assert client.userId is string

      // Leave Socket.IO room
      client.leave(data.roomId);
      this.socketRooms.delete(client.id);

      // Notify others
      this.server.to(data.roomId).emit("user-left", {
        userId: client.userId,
        username: client.username,
      });

      // Clear typing status when user explicitly leaves
      this.stopTyping(data.roomId, client.userId!); // Assert client.userId is string

      // Broadcast room list update to subscribers
      this.broadcastRoomListUpdate();

      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("toggle-ready")
  async handleToggleReady(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      const participant = await this.roomService.toggleReady(
        client.userId!, // Assert client.userId is string
        data.roomId,
      );

      // Notify all in room
      this.server.to(data.roomId).emit("ready-status-changed", {
        userId: client.userId,
        isReady: participant.isReady,
      });

      // Check if all ready
      const allReady = await this.roomService.checkAllReady(data.roomId);
      if (allReady) {
        this.server.to(data.roomId).emit("all-ready");
      }

      return { success: true, isReady: participant.isReady };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("toggle-spectator")
  async handleToggleSpectator(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      const result = await this.roomService.toggleSpectator(
        client.userId,
        data.roomId,
      );

      // 방 안의 모든 유저에게 역할 변경 알림
      this.server.to(data.roomId).emit("participant-role-changed", {
        userId: client.userId,
        newRole: result.newRole,
      });

      // 방 목록 갱신
      this.broadcastRoomListUpdate();

      return { success: true, newRole: result.newRole };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("start-game")
  async handleStartGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      // 서버 종료 진행 중이면 게임 시작 차단
      if (this.shutdownService.isShuttingDown()) {
        return { error: "서버가 점검 중입니다. 잠시 후 다시 시도해주세요." };
      }

      // Prevent concurrent start-game calls (double-click, race condition)
      if (this.startingRooms.has(data.roomId)) {
        return { error: "Game is already starting" };
      }
      this.startingRooms.add(data.roomId);

      // Get room to check teamMode
      const room = await this.roomService.getRoomById(data.roomId);

      // ─── Discord 음성채널 검증 ───
      // 방에 Discord 채널이 연동된 경우, 준비된 참가자 중 Discord 연동 유저가
      // 모두 Lobby 음성채널에 있는지 확인
      const voiceValidation =
        await this.discordVoiceService.validateVoicePresence(data.roomId);
      if (!voiceValidation.valid) {
        this.startingRooms.delete(data.roomId);
        const missing = voiceValidation.missingUsernames.join(", ");
        return {
          error: `음성채널 미참가 유저가 있습니다: ${missing}`,
          missingVoiceUsers: voiceValidation.missingUsernames,
        };
      }

      let result;
      if (room.teamMode === TeamMode.AUCTION) {
        // Start auction directly
        result = await this.auctionService.startAuction(
          client.userId!,
          data.roomId,
        ); // Assert client.userId is string

        // MANUAL/VOLUNTEER: 팀장 선정 단계 진입
        const auctionResult = result as any;
        if (auctionResult.captainSelectionPhase) {
          this.auctionGateway.emitCaptainSelectionPhase(
            data.roomId,
            auctionResult.captainSelectionPhase,
            auctionResult.participants,
            room.hostId,
          );

          // VOLUNTEER: 30초 타이머 후 자동 처리
          if (auctionResult.captainSelectionPhase.mode === "VOLUNTEER") {
            const handle = setTimeout(async () => {
              try {
                const autoResult = await this.auctionService.finalizeVolunteers(
                  client.userId!,
                  data.roomId,
                );
                await this.auctionGateway.emitCaptainsConfirmedAndStart(
                  data.roomId,
                  autoResult,
                );
              } catch (_e) {
                /* 이미 마감됐거나 방 없어진 경우 무시 */
              }
            }, 30_000);
            this.auctionService.setCaptainPhaseTimerHandle(data.roomId, handle);
          }
        } else {
          // TIER: 기존처럼 바로 auction-started emit
          this.auctionGateway.emitAuctionStarted(data.roomId, result);
        }
      } else if (room.teamMode === TeamMode.SNAKE_DRAFT) {
        // Start snake draft directly
        result = await this.snakeDraftService.startSnakeDraft(
          client.userId!,
          data.roomId,
        ); // Assert client.userId is string

        // Get client-friendly state with timerEnd at top level
        const clientState = await this.snakeDraftService.getClientDraftState(
          data.roomId,
        );
        const draftData = clientState ?? result;

        // Emit draft-started event to room (for lobby clients) and draft room (for draft page clients)
        this.server.to(data.roomId).emit("draft-started", draftData);
        this.snakeDraftGateway.emitDraftStarted(data.roomId, draftData);
      }

      // Notify all players that game is starting (for navigation)
      this.server.to(data.roomId).emit("game-starting", {
        roomId: data.roomId,
        teamMode: room.teamMode,
      });

      return { success: true, roomId: data.roomId, teamMode: room.teamMode };
    } catch (error: any) {
      // Best-effort rollback: if auction/draft start failed mid-way,
      // the room status may have been changed to DRAFT already.
      // Roll it back to WAITING so the host can retry.
      try {
        const currentRoom = await this.roomService.getRoomById(data.roomId);
        if (currentRoom && currentRoom.status !== RoomStatus.WAITING) {
          await this.roomService.rollbackToWaiting(data.roomId);
          console.warn(
            `[Room] Rolled back room ${data.roomId} to WAITING after startGame failure: ${error.message}`,
          );
        }
      } catch (rollbackError: any) {
        console.error(
          `[Room] Rollback to WAITING failed for room ${data.roomId}:`,
          rollbackError?.message ?? rollbackError,
        );
      }

      // Clean up in-memory draft/auction state on failure
      this.snakeDraftService.clearDraftState(data.roomId);

      return { error: error.message };
    } finally {
      this.startingRooms.delete(data.roomId);
    }
  }

  // ========================================
  // Chat Events
  // ========================================

  @SubscribeMessage("send-message")
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; content: string },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      const message = await this.roomService.sendChatMessage(
        client.userId!, // Assert client.userId is string
        data.roomId,
        data.content,
      );

      // Broadcast to all in room
      this.server.to(data.roomId).emit("new-message", message);

      // Stop typing after sending message
      this.stopTyping(data.roomId, client.userId!); // Assert client.userId is string

      return { success: true, message };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("is-typing")
  handleIsTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; isTyping: boolean },
  ) {
    if (!client.userId || !client.username) {
      return;
    }

    const { roomId, isTyping } = data;

    if (!this.typingUsers.has(roomId)) {
      this.typingUsers.set(roomId, new Map());
    }
    const roomTypingUsers = this.typingUsers.get(roomId)!;

    if (isTyping) {
      // Clear any existing timeout for this user in this room
      if (roomTypingUsers.has(client.userId)) {
        clearTimeout(roomTypingUsers.get(client.userId)!); // Assert timeout is not undefined
      } else {
        // User just started typing, broadcast
        this.server.to(roomId).emit("user-typing", {
          userId: client.userId,
          username: client.username,
        });
      }

      // Set a new timeout to stop typing after TYPING_TIMEOUT_MS
      const timeout = setTimeout(() => {
        this.stopTyping(roomId, client.userId!); // Assert client.userId is string
      }, this.TYPING_TIMEOUT_MS);

      roomTypingUsers.set(client.userId, timeout);
    } else {
      // User explicitly stopped typing
      this.stopTyping(roomId, client.userId!); // Assert client.userId is string
    }
  }

  private stopTyping(roomId: string, userId: string) {
    const roomTypingUsers = this.typingUsers.get(roomId);
    if (roomTypingUsers && roomTypingUsers.has(userId)) {
      clearTimeout(roomTypingUsers.get(userId)!); // Assert timeout is not undefined
      roomTypingUsers.delete(userId);
      this.server.to(roomId).emit("user-stopped-typing", { userId });

      // Clean up room entry if no one is typing in that room
      if (roomTypingUsers.size === 0) {
        this.typingUsers.delete(roomId);
      }
    }
  }

  // ========================================
  // Discord 음성채널 연동 이벤트 핸들러
  // ========================================

  /**
   * Discord 봇이 voiceStateUpdate를 감지하면 EventEmitter2를 통해 이 리스너로 전달됨
   * - discordUserId를 Nexus userId로 역변환 후 해당 방에 'voice-status-changed' 이벤트 브로드캐스트
   * @param payload { discordUserId, roomId, inVoice }
   */
  @OnEvent("discord.voice.update")
  async handleDiscordVoiceUpdate(payload: {
    discordUserId: string;
    roomId: string;
    inVoice: boolean;
  }) {
    try {
      const { discordUserId, roomId, inVoice } = payload;

      // Discord ID → Nexus userId 역방향 조회
      const nexusUserId =
        await this.discordVoiceService.getNexusUserIdByDiscordId(discordUserId);

      if (!nexusUserId) {
        // Discord 미연동 유저이면 무시
        return;
      }

      // 해당 방의 모든 클라이언트에게 음성 상태 변경 브로드캐스트
      this.server.to(roomId).emit("voice-status-changed", {
        userId: nexusUserId,
        inVoice,
      });
    } catch (error) {
      console.error("[RoomGateway] Discord 음성 상태 업데이트 처리 오류:", error);
    }
  }

  // ========================================
  // Utility Methods
  // ========================================

  notifyRoomUpdate(roomId: string, event: string, data: any) {
    this.server.to(roomId).emit(event, data);
  }

  async getRoomParticipantCount(roomId: string): Promise<number> {
    const sockets = await this.server.in(roomId).fetchSockets();
    return sockets.length;
  }
}
