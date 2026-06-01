import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Inject, forwardRef, OnModuleDestroy, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ShutdownService } from "../common/shutdown.service";
import { OnEvent } from "@nestjs/event-emitter";
import { Server, Socket } from "socket.io";
import { RoomService } from "./room.service";
import { SnakeDraftService } from "./snake-draft.service";
import { SnakeDraftGateway } from "./snake-draft.gateway";
import { AuthService } from "../auth/auth.service";
import { AuctionService } from "../auction/auction.service";
import { AuctionGateway } from "../auction/auction.gateway";
import { RoleSelectionService } from "../role-selection/role-selection.service";
import { RoleSelectionGateway } from "../role-selection/role-selection.gateway";
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
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e4,
})
export class RoomGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>
  private socketRooms = new Map<string, string>(); // socketId -> roomId
  private readonly ROOM_LIST_CHANNEL = "room-list"; // Channel for room list updates
  private typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // roomId -> Map<userId, Timeout>
  private readonly TYPING_TIMEOUT_MS = 3000; // 3 seconds
  // Guard against concurrent start-game calls (double-click, race)
  private startingRooms = new Set<string>();
  // 새로고침/잠깐 끊김 보호용 grace 타이머 — key: `${userId}:${roomId}`
  // 소켓 disconnect 즉시 leaveRoom을 호출하면 새로고침만 해도 방에서 빠지므로,
  // 이 시간 안에 같은 방에 join-room이 다시 들어오면 leave를 취소한다.
  private disconnectGraceTimers = new Map<string, NodeJS.Timeout>();
  private readonly DISCONNECT_GRACE_MS = 30_000; // 30 seconds

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
    @Inject(forwardRef(() => RoleSelectionService))
    private readonly roleSelectionService: RoleSelectionService,
    @Inject(forwardRef(() => RoleSelectionGateway))
    private readonly roleSelectionGateway: RoleSelectionGateway,
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
    // grace 타이머도 정리
    for (const timer of this.disconnectGraceTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectGraceTimers.clear();
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
    } catch {
      // 연결 실패 시 조용히 연결 해제
      client.disconnect();
    }
  }

  private hasActiveSocketInRoom(userId: string, roomId: string): boolean {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return false;

    let hasActive = false;
    for (const socketId of Array.from(sockets)) {
      const socketRoomId = this.socketRooms.get(socketId);
      if (!socketRoomId) {
        sockets.delete(socketId);
        continue;
      }
      if (socketRoomId === roomId) {
        hasActive = true;
      }
    }

    if (sockets.size === 0) {
      this.userSockets.delete(userId);
    }

    return hasActive;
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (!client.userId) return;

    const userId = client.userId;
    const username = client.username;

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    const roomId = this.socketRooms.get(client.id);
    if (!roomId) return;

    // 소켓 단위 정리는 즉시 (이미 끊긴 소켓이라 leave는 의미상 noop이지만 안전)
    client.leave(roomId);
    this.socketRooms.delete(client.id);
    // 타이핑 상태도 즉시 해제 (재연결 시 알아서 다시 emit)
    this.stopTyping(roomId, userId);

    // 같은 방에 같은 유저의 다른 활성 소켓이 남아 있으면 (멀티탭 등)
    // grace 발동 없이 종료. 다른 탭에서 그대로 방에 남아 있다고 보면 됨.
    if (this.hasActiveSocketInRoom(userId, roomId)) {
      return;
    }

    // 새로고침/잠깐 끊김 대비 grace timer.
    // DISCONNECT_GRACE_MS 안에 같은 방에 join-room이 다시 들어오면 leave 취소.
    const graceKey = `${userId}:${roomId}`;
    const existing = this.disconnectGraceTimers.get(graceKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.disconnectGraceTimers.delete(graceKey);

      // grace 만료 시점에 같은 유저가 같은 방에 다시 연결돼 있으면 leave 취소.
      if (this.hasActiveSocketInRoom(userId, roomId)) return;

      let shouldNotifyOthers = false;
      try {
        const status = await this.roomService.getRoomStatus(roomId);
        if (status === RoomStatus.WAITING || status === RoomStatus.COMPLETED) {
          // WAITING/COMPLETED 상태: 실제로 참가자 제거
          try {
            await this.roomService.leaveRoom(userId, roomId);
            shouldNotifyOthers = true;
          } catch {
            // 이미 나갔거나 상태가 변경됨 — 무시
          }
        } else {
          // 게임 진행 중에도 호스트가 30초 안에 안 돌아오면 다음 참가자에게 이양
          try {
            const newHostId = await this.roomService.transferActiveRoomHost(
              roomId,
              userId,
            );
            if (newHostId) {
              this.server.to(roomId).emit("host-changed", { newHostId });
              // host-changed 만으로는 클라 currentRoom.hostId 가 갱신되지 않으므로
              // 변경된 방 전체를 함께 푸시해 "방장" 배지/권한 UI 정합성 확보.
              try {
                const updatedRoom = await this.roomService.getRoomById(roomId);
                this.server.to(roomId).emit("room-updated", updatedRoom);
              } catch {
                // 조회 실패 시 host-changed 만으로 폴백
              }
            }
          } catch {
            // best-effort — 무시
          }
        }
      } catch {
        // 방이 이미 삭제되었거나 알 수 없는 상태 — 무시
      }

      if (shouldNotifyOthers) {
        this.server.to(roomId).emit("user-left", { userId, username });
        this.broadcastRoomDelta("update", roomId);
      }
    }, this.DISCONNECT_GRACE_MS);

    this.disconnectGraceTimers.set(graceKey, timer);
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

  /**
   * 방 목록 delta update 브로드캐스트
   * - type: 'add' | 'update' | 'remove'
   * - 생성/수정 시 해당 방 요약 데이터만 조회해 전송 (전체 목록 재조회 불필요)
   * - 삭제 시에는 roomId만 전송
   */
  async broadcastRoomDelta(type: "add" | "update" | "remove", roomId: string) {
    try {
      if (type === "remove") {
        // 삭제된 방: roomId만 전송
        this.server.to(this.ROOM_LIST_CHANNEL).emit("room-list-updated", {
          type: "remove",
          roomId,
        });
        return;
      }

      // 생성/수정된 방: 요약 데이터만 조회해 전송
      const room = await this.roomService.getRoomSummary(roomId);
      if (!room) {
        // 조회 타이밍에 방이 이미 삭제됐으면 remove delta 전송
        this.server.to(this.ROOM_LIST_CHANNEL).emit("room-list-updated", {
          type: "remove",
          roomId,
        });
        return;
      }

      this.server.to(this.ROOM_LIST_CHANNEL).emit("room-list-updated", {
        type,
        room,
      });
    } catch (error) {
      console.error("[Room] Failed to broadcast room list delta:", error);
    }
  }

  // ========================================
  // Room Events
  // ========================================

  @SubscribeMessage("join-room")
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { roomId: string; password?: string; asSpectator?: boolean },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      // 다른 방에 소켓이 연결돼 있으면 먼저 정리한다.
      // (방을 명시적으로 나가지 않고 바로 다른 방에 join-room을 보낼 때 발생하는
      //  "한 사람이 여러 방에 동시 존재" 현상 방지)
      const previousRoomId = this.socketRooms.get(client.id);
      if (previousRoomId && previousRoomId !== data.roomId) {
        client.leave(previousRoomId);
        this.socketRooms.delete(client.id);

        // 이전 방의 grace 타이머가 남아 있으면 취소 (새 방으로 이동했으므로 불필요)
        const prevGraceKey = `${client.userId}:${previousRoomId}`;
        const prevPending = this.disconnectGraceTimers.get(prevGraceKey);
        if (prevPending) {
          clearTimeout(prevPending);
          this.disconnectGraceTimers.delete(prevGraceKey);
        }

        // WAITING 방이면 즉시 퇴장 처리 (슬롯 해제 + 방 목록 갱신)
        try {
          const prevStatus =
            await this.roomService.getRoomStatus(previousRoomId);
          if (prevStatus === RoomStatus.WAITING) {
            await this.roomService.leaveRoom(client.userId!, previousRoomId);
            this.server.to(previousRoomId).emit("user-left", {
              userId: client.userId,
              username: client.username,
            });
            this.broadcastRoomDelta("update", previousRoomId);
          }
        } catch {
          // 이전 방이 이미 삭제됐거나 오류 — 무시
        }
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
          roomId: data.roomId,
          password: data.password,
          asSpectator: data.asSpectator,
        });
        isNewJoin = true;
      } else {
        // 재입장: 최신 방 데이터 재조회 (상태가 변경되었을 수 있음)
        room = await this.roomService.getRoomById(data.roomId);
      }

      // Join Socket.IO room
      client.join(data.roomId);
      this.socketRooms.set(client.id, data.roomId);

      // 새로고침/재연결로 grace 진행 중이면 leave 예약 취소
      const graceKey = `${client.userId}:${data.roomId}`;
      const pendingLeave = this.disconnectGraceTimers.get(graceKey);
      if (pendingLeave) {
        clearTimeout(pendingLeave);
        this.disconnectGraceTimers.delete(graceKey);
      }

      // Notify others only for new joins (not for reconnects)
      if (isNewJoin) {
        const joinedParticipant = room.participants.find(
          (p: any) => p.userId === client.userId,
        );
        client.to(data.roomId).emit("user-joined", {
          userId: client.userId,
          username: client.username,
          isReady: joinedParticipant?.isReady ?? false,
          participant: joinedParticipant,
        });
      }

      // Broadcast room changes only for actual new joins. Reconnects receive the
      // latest room in the ACK below and should not refresh every other client.
      if (isNewJoin) {
        this.server.to(data.roomId).emit("room-updated", room);
      }

      // 신규 입장 시 참가자 수 변경 → 방 요약 delta 전송
      if (isNewJoin) {
        this.broadcastRoomDelta("update", data.roomId);
      }

      // 재접속 시 현재 진행 중인 게임 상태를 해당 클라이언트에게 복원
      if (!isNewJoin) {
        await this.emitCurrentGameStateToClient(client, data.roomId, room);
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

      const leaveResult: any = await this.roomService.leaveRoom(
        client.userId!,
        data.roomId,
      ); // Assert client.userId is string

      // 명시적 나가기 시 grace 예약 취소
      const graceKey = `${client.userId}:${data.roomId}`;
      const pending = this.disconnectGraceTimers.get(graceKey);
      if (pending) {
        clearTimeout(pending);
        this.disconnectGraceTimers.delete(graceKey);
      }

      // Leave Socket.IO room
      client.leave(data.roomId);
      this.socketRooms.delete(client.id);

      // 참가자 슬롯이 보존된 경우(게임 진행 중)에는 다른 클라이언트에 user-left 알리지 않음.
      // user-left 를 받으면 클라 화면에서 해당 참가자가 사라져 실제 DB 상태(보존됨)와 어긋남.
      if (!leaveResult?.preserved) {
        this.server.to(data.roomId).emit("user-left", {
          userId: client.userId,
          username: client.username,
        });
      }

      // 호스트 이양이 발생했으면 변경된 방 데이터를 모두에게 푸시.
      // host-changed 만 발행하면 클라 currentRoom.hostId 가 갱신되지 않아 "방장" 표시가 어긋남.
      if (leaveResult?.newHostId) {
        this.server.to(data.roomId).emit("host-changed", {
          newHostId: leaveResult.newHostId,
        });
        try {
          const updatedRoom = await this.roomService.getRoomById(data.roomId);
          this.server.to(data.roomId).emit("room-updated", updatedRoom);
        } catch {
          // 방이 그 사이 삭제됐거나 조회 실패 — host-changed 만으로 fallback
        }
      }

      // Clear typing status when user explicitly leaves
      this.stopTyping(data.roomId, client.userId!); // Assert client.userId is string

      // 퇴장 시 참가자 수 변경 → 방 요약 delta 전송
      this.broadcastRoomDelta("update", data.roomId);

      return { success: true, preserved: !!leaveResult?.preserved };
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
      this.server.to(data.roomId).emit("room-updated", result.room);

      // 관전자↔플레이어 전환 → 방 요약 delta 전송
      this.broadcastRoomDelta("update", data.roomId);

      return { success: true, newRole: result.newRole };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("select-team")
  async handleSelectTeam(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; teamId: string | null },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }
      const room = await this.roomService.selectManualTeam(
        client.userId,
        data.roomId,
        data.teamId,
      );
      this.server.to(data.roomId).emit("room-updated", room);
      return { success: true, room };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("start-game")
  async handleStartGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    let coreStartSucceeded = false;
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

      // 서비스 레이어의 호스트/레디/최소인원 검증을 반드시 거치도록 통합
      const startResult = await this.roomService.startGame(
        client.userId,
        data.roomId,
      );

      // Get room to check teamMode (latest)
      const room = await this.roomService.getRoomById(data.roomId);

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
          try {
            this.auctionGateway.emitCaptainSelectionPhase(
              data.roomId,
              auctionResult.captainSelectionPhase,
              auctionResult.participants,
              room.hostId,
            );
          } catch (emitError) {
            console.error(
              `[Room] Failed to emit captain-selection-phase for room ${data.roomId}:`,
              emitError,
            );
          }

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
          try {
            this.auctionGateway.emitAuctionStarted(data.roomId, result);
          } catch (emitError) {
            console.error(
              `[Room] Failed to emit auction-started for room ${data.roomId}:`,
              emitError,
            );
          }
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
        try {
          this.server.to(data.roomId).emit("draft-started", draftData);
          this.snakeDraftGateway.emitDraftStarted(data.roomId, draftData);
        } catch (emitError) {
          console.error(
            `[Room] Failed to emit draft-started for room ${data.roomId}:`,
            emitError,
          );
        }
      } else if (room.teamMode === TeamMode.AUTO_BALANCE) {
        result = await this.roomService.createAutoBalancedTeams(
          client.userId!,
          data.roomId,
        );
        const roleData = await this.roleSelectionService.startRoleSelection(
          data.roomId,
        );
        await this.roleSelectionGateway.emitRoleSelectionStarted(
          data.roomId,
          roleData,
        );
      } else if (room.teamMode === TeamMode.MANUAL_TEAM) {
        result = await this.roomService.finalizeManualTeams(
          client.userId!,
          data.roomId,
        );
        const roleData = await this.roleSelectionService.startRoleSelection(
          data.roomId,
        );
        await this.roleSelectionGateway.emitRoleSelectionStarted(
          data.roomId,
          roleData,
        );
      }

      coreStartSucceeded = true;

      // Notify all players that game is starting (for navigation)
      try {
        this.server.to(data.roomId).emit("game-starting", {
          roomId: data.roomId,
          teamMode: room.teamMode,
        });
      } catch (emitError) {
        console.error(
          `[Room] Failed to emit game-starting for room ${data.roomId}:`,
          emitError,
        );
      }

      return {
        success: true,
        roomId: data.roomId,
        teamMode: startResult.teamMode,
      };
    } catch (error: any) {
      // Best-effort rollback: if auction/draft start failed mid-way,
      // the room status may have been changed to DRAFT already.
      // Roll it back to WAITING so the host can retry.
      try {
        const currentRoom = await this.roomService.getRoomById(data.roomId);
        if (
          !coreStartSucceeded &&
          currentRoom &&
          currentRoom.status !== RoomStatus.WAITING
        ) {
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

      // 시작 실패 시 in-memory draft/auction state 정리
      this.snakeDraftService.clearDraftState(data.roomId);
      this.auctionService.clearAuctionState(data.roomId);

      const errorResponse =
        typeof error?.getResponse === "function" ? error.getResponse() : null;
      const errorMessage =
        typeof errorResponse === "object" &&
        errorResponse !== null &&
        "message" in errorResponse
          ? Array.isArray(errorResponse.message)
            ? errorResponse.message.join(", ")
            : String(errorResponse.message)
          : error.message;
      const missingVoiceUsers =
        typeof errorResponse === "object" &&
        errorResponse !== null &&
        "missingVoiceUsers" in errorResponse
          ? errorResponse.missingVoiceUsers
          : undefined;

      return {
        error: errorMessage,
        ...(missingVoiceUsers ? { missingVoiceUsers } : {}),
      };
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

  // 재접속한 클라이언트에게 현재 진행 중인 게임 상태를 개별 전송한다.
  // 새로고침/렉으로 끊겼다 돌아온 참가자가 현재 화면으로 복귀할 수 있도록 한다.
  private async emitCurrentGameStateToClient(
    client: AuthenticatedSocket,
    roomId: string,
    room: any,
  ): Promise<void> {
    try {
      const { status, teamMode } = room;

      if (status === RoomStatus.DRAFT) {
        // DRAFT 상태는 경매(AUCTION) 또는 스네이크 드래프트(SNAKE_DRAFT) 두 가지.
        // teamMode로 구분한다.
        if (teamMode === TeamMode.AUCTION) {
          const auctionState = this.auctionService.getAuctionState(roomId);
          if (auctionState) {
            client.emit("auction-started", { roomId, state: auctionState });
          }
        } else {
          const draftState = this.snakeDraftService.getDraftState(roomId);
          if (draftState) {
            client.emit("snake-draft-started", { roomId, state: draftState });
          }
        }
      } else if (status === RoomStatus.ROLE_SELECTION) {
        const roleData =
          await this.roleSelectionService.getRoleSelectionData(roomId);
        if (roleData) {
          client.emit("role-selection-started", roleData);
        }
      }
    } catch {
      // 상태 복원 실패는 치명적이지 않으므로 조용히 무시
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
      console.error(
        "[RoomGateway] Discord 음성 상태 업데이트 처리 오류:",
        error,
      );
    }
  }

  // ========================================
  // Scheduled Cleanup
  // ========================================

  private readonly gatewayLogger = new Logger(RoomGateway.name);

  /** 매 5분마다 소켓 없는 좀비 참가자를 DB에서 제거한다 */
  @Cron("*/5 * * * *")
  async cleanupZombieParticipants() {
    try {
      const [waitingRooms, completedRooms] = await Promise.all([
        this.roomService.getWaitingRoomsWithParticipants(),
        this.roomService.getCompletedRoomsWithParticipants(),
      ]);
      const roomsToCheck = [...waitingRooms, ...completedRooms];
      for (const room of roomsToCheck) {
        // /room 네임스페이스 소켓 기준이 아닌 Socket.IO room 멤버십 기준으로 판단.
        // userSockets는 /room 네임스페이스만 추적하므로 다른 네임스페이스에
        // 연결된 관전자를 좀비로 오인하는 문제를 방지한다.
        const activeSockets = await this.server.in(room.id).fetchSockets();
        const activeUserIds = new Set(
          activeSockets
            .map((s) => (s as any).userId as string | undefined)
            .filter(Boolean),
        );
        const zombies = room.participants.filter(
          (p) => !activeUserIds.has(p.userId),
        );
        if (zombies.length === 0) continue;

        this.gatewayLogger.debug(
          `[Cleanup] Room ${room.id}: ${zombies.length}명 좀비 제거`,
        );

        for (const zombie of zombies) {
          try {
            await this.roomService.leaveRoom(zombie.userId, room.id);
          } catch (_) {
            // 이미 제거됐거나 방이 삭제된 경우 무시
          }
        }

        // 방 상태 변경을 방 목록 구독자에게 알림 (삭제됐으면 remove로 폴백)
        this.broadcastRoomDelta("update", room.id);
      }
    } catch (error) {
      this.gatewayLogger.error("[Cleanup] 좀비 참가자 정리 실패:", error);
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
