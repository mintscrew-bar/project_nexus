import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Inject, forwardRef, OnModuleDestroy, Optional } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { AuctionService } from "./auction.service";
import { RoleSelectionService } from "../role-selection/role-selection.service";
import { RoleSelectionGateway } from "../role-selection/role-selection.gateway";
import { RedisService } from "../redis/redis.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  namespace: "/auction",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e4,
})
export class AuctionGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  // Track connected users per room for disconnect handling
  private connectedUsers = new Map<
    string,
    { userId: string; roomId: string }
  >();

  // Bot auto-bid timers: key = `${roomId}_${botCaptainId}`
  private botBidTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private bidResolveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Guard against concurrent _resolveCurrentBidAndAdvance calls
  private resolvingRooms = new Set<string>();
  // In-memory rate limit fallback when Redis is unavailable
  private bidRateLimits = new Map<string, number[]>();
  private rateLimitCleanupTimer: ReturnType<typeof setInterval> | null = null;
  // 방별 입찰 mutex — 동시 입찰 race condition 방지
  private bidLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly authService: AuthService,
    private readonly auctionService: AuctionService,
    @Inject(forwardRef(() => RoleSelectionService))
    private readonly roleSelectionService: RoleSelectionService,
    @Inject(forwardRef(() => RoleSelectionGateway))
    private readonly roleSelectionGateway: RoleSelectionGateway,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  onModuleDestroy() {
    // 서버 종료 시 모든 타이머 정리
    for (const timer of this.botBidTimers.values()) {
      clearTimeout(timer);
    }
    this.botBidTimers.clear();

    for (const timer of this.bidResolveTimers.values()) {
      clearTimeout(timer);
    }
    this.bidResolveTimers.clear();
    this.resolvingRooms.clear();

    if (this.rateLimitCleanupTimer) {
      clearInterval(this.rateLimitCleanupTimer);
      this.rateLimitCleanupTimer = null;
    }
    this.bidRateLimits.clear();
    this.bidLocks.clear();
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.authService.validateToken(token);

      if (!payload) {
        client.disconnect();
        return;
      }

      client.userId = payload.sub;
      client.username = payload.username;
      console.log(`Auction client connected: ${client.username}`);
    } catch (_error) {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Auction client disconnected: ${client.username}`);
    const trackedUser = this.connectedUsers.get(client.id);
    this.connectedUsers.delete(client.id);

    if (trackedUser) {
      try {
        const deleted =
          await this.auctionService.cleanupBotOnlyRoomOnHostDisconnect(
            trackedUser.userId,
            trackedUser.roomId,
          );
        if (deleted) {
          this.cleanupRoom(trackedUser.roomId);
        }
      } catch {
        // Best-effort cleanup only
      }
    }

    // Note: Auction continues even if a captain disconnects.
    // The timer will still expire and resolve normally (yuchal or auto-assign).
  }

  @SubscribeMessage("join-room")
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      // 방 참여자 검증 — 비참여자의 실시간 이벤트 구독 차단
      if (client.userId) {
        const isParticipant = await this.auctionService.isRoomParticipant(
          client.userId,
          data.roomId,
        );
        if (!isParticipant) {
          return { success: false, error: "방 참여자만 입장할 수 있습니다." };
        }
      }

      client.join(`room:${data.roomId}`);

      // Track user connection for disconnect handling
      if (client.userId) {
        this.connectedUsers.set(client.id, {
          userId: client.userId,
          roomId: data.roomId,
        });
      }

      const state = this.auctionService.getAuctionState(data.roomId);
      // 팀장 선정 단계 중일 수 있으므로 captainPhase도 포함 (재연결 시 복원용)
      const captainPhase = this.auctionService.getCaptainPhase(data.roomId);

      if (!state && !captainPhase) {
        return {
          success: true,
          state: null,
          teams: [],
          players: [],
          captainSelectionPhase: null,
        };
      }

      if (captainPhase && !state) {
        // 팀장 선정 단계: 경매 아직 시작 안 됨
        return {
          success: true,
          state: null,
          teams: [],
          players: [],
          captainSelectionPhase: {
            mode: captainPhase.mode,
            requiredCount: captainPhase.requiredCount,
            volunteers: captainPhase.volunteers,
            timerEnd: captainPhase.timerEnd,
          },
        };
      }

      // Only schedule bid resolve if timer hasn't expired yet
      if (state && state.timerEnd > Date.now()) {
        this._scheduleBidResolve(data.roomId, state.timerEnd);
      }

      try {
        const { teams, players } = await this.auctionService.getFullAuctionData(
          data.roomId,
        );
        return {
          success: true,
          state,
          teams,
          players,
          captainSelectionPhase: null,
        };
      } catch (error) {
        console.warn(
          `[Auction] Failed to load full join payload for room ${data.roomId}:`,
          error,
        );
        return {
          success: true,
          state,
          teams: [],
          players: [],
          captainSelectionPhase: null,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || "Failed to join auction room",
      };
    }
  }

  @SubscribeMessage("leave-room")
  handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`room:${data.roomId}`);
    this.connectedUsers.delete(client.id);
  }

  // ========================================
  // Captain Selection Events
  // ========================================

  @SubscribeMessage("volunteer-captain")
  async handleVolunteerCaptain(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!client.userId) return { error: "Unauthorized" };
    try {
      const result = await this.auctionService.handleVolunteer(
        client.userId,
        data.roomId,
      );
      this.server
        .to(`room:${data.roomId}`)
        .emit("volunteer-list-updated", result);
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("finalize-volunteers")
  async handleFinalizeVolunteers(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; selectedUserIds?: string[] },
  ) {
    if (!client.userId) return { error: "Unauthorized" };
    try {
      const result = await this.auctionService.finalizeVolunteers(
        client.userId,
        data.roomId,
        data.selectedUserIds,
      );
      await this.emitCaptainsConfirmedAndStart(data.roomId, result);
      return { success: true };
    } catch (error: any) {
      // 이미 finalize된 경우 (타이머와 수동 호출 동시) → 이미 진행 중이므로 OK 반환
      if (error.message?.includes("Not in volunteer phase")) {
        return { success: true, alreadyFinalized: true };
      }
      return { error: error.message };
    }
  }

  @SubscribeMessage("select-manual-captains")
  async handleSelectManualCaptains(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; userIds: string[] },
  ) {
    if (!client.userId) return { error: "Unauthorized" };
    try {
      const result = await this.auctionService.selectManualCaptains(
        client.userId,
        data.roomId,
        data.userIds,
      );
      await this.emitCaptainsConfirmedAndStart(data.roomId, result);
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  emitCaptainSelectionPhase(
    roomId: string,
    phase: any,
    participants: any[],
    hostId: string,
  ) {
    this.server
      .to(`room:${roomId}`)
      .emit("captain-selection-phase", { ...phase, participants, hostId });
  }

  /** 팀장 확정 후 경매 시작 이벤트 발행 (room.gateway에서도 호출) */
  async emitCaptainsConfirmedAndStart(roomId: string, result: any) {
    this.server.to(`room:${roomId}`).emit("captains-confirmed", {
      captainUserIds: result.captainUserIds,
      teams: result.teams,
    });
    this.server.to(`room:${roomId}`).emit("auction-started", {
      teams: result.teams,
      players: result.players,
      auctionState: result.auctionState,
    });
    if (result.auctionState?.timerEnd) {
      this._scheduleBidResolve(roomId, result.auctionState.timerEnd);
    }
    // 봇 자동입찰 스케줄링
    this._scheduleBotBids(roomId).catch((e) => {
      console.warn(
        `[Auction] _scheduleBotBids failed for room ${roomId}:`,
        e?.message,
      );
    });
  }

  @SubscribeMessage("place-bid")
  async handleBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      roomId: string;
      amount: number;
    },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    // Payload validation
    if (!data.roomId || typeof data.amount !== "number" || data.amount <= 0) {
      return { error: "Invalid bid data" };
    }

    // Rate limiting: max 5 bids per 3 seconds per user
    if (this.redisService) {
      try {
        const rateLimit = await this.redisService.checkRateLimit(
          `auction:bid:${client.userId}`,
          5,
          3,
        );
        if (!rateLimit.allowed) {
          return {
            error: `Too many bids. Try again in ${rateLimit.resetIn}s`,
          };
        }
      } catch {
        // Redis unavailable — use in-memory fallback
        const key = `bid:${client.userId}`;
        const now = Date.now();
        const timestamps = (this.bidRateLimits.get(key) ?? []).filter(
          (t) => now - t < 3000,
        );
        if (timestamps.length >= 5) {
          return { error: "Too many bids. Try again shortly." };
        }
        timestamps.push(now);
        this.bidRateLimits.set(key, timestamps);

        // Schedule periodic cleanup if not already running
        if (!this.rateLimitCleanupTimer) {
          this.rateLimitCleanupTimer = setInterval(() => {
            const cleanupNow = Date.now();
            for (const [k, v] of this.bidRateLimits.entries()) {
              const valid = v.filter((t) => cleanupNow - t < 3000);
              if (valid.length === 0) {
                this.bidRateLimits.delete(k);
              } else {
                this.bidRateLimits.set(k, valid);
              }
            }
            if (this.bidRateLimits.size === 0) {
              clearInterval(this.rateLimitCleanupTimer!);
              this.rateLimitCleanupTimer = null;
            }
          }, 10_000);
        }
      }
    }

    // resolve 진행 중이면 입찰 차단
    if (this.resolvingRooms.has(data.roomId)) {
      return { error: "현재 낙찰 처리 중입니다. 잠시 후 다시 시도해주세요." };
    }

    // 방별 mutex: 동시 입찰 직렬화
    const prevLock = this.bidLocks.get(data.roomId) ?? Promise.resolve();
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.bidLocks.set(data.roomId, lockPromise);

    try {
      await prevLock;

      const state = await this.auctionService.placeBid(
        client.userId,
        data.roomId,
        data.amount,
      );

      // Broadcast to all clients in the room
      this.server.to(`room:${data.roomId}`).emit("bid-placed", {
        userId: client.userId,
        teamId: state.currentHighestBidder,
        username: client.username,
        amount: data.amount,
        timerEnd: state.timerEnd,
        timestamp: new Date().toISOString(),
      });
      this._scheduleBidResolve(data.roomId, state.timerEnd);

      return { success: true, state };
    } catch (error: any) {
      return { error: error.message };
    } finally {
      releaseLock!();
      // 체인이 끝나면 lock 정리
      if (this.bidLocks.get(data.roomId) === lockPromise) {
        this.bidLocks.delete(data.roomId);
      }
    }
  }

  @SubscribeMessage("resolve-bid")
  async handleResolveBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    // 호스트만 수동 resolve 가능
    const isHost = await this.auctionService.isRoomHost(
      client.userId,
      data.roomId,
    );
    if (!isHost) {
      return { error: "호스트만 경매를 수동 진행할 수 있습니다." };
    }

    try {
      const result = await this._resolveCurrentBidAndAdvance(data.roomId);
      if (result === null) {
        // 이미 다른 resolve가 진행 중 (타이머 만료와 수동 resolve 동시 호출)
        return { success: true, alreadyResolved: true };
      }
      return { success: true, result };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // ========================================
  // Emit Methods (called from service or external)
  // ========================================

  emitAuctionStarted(roomId: string, data: any) {
    this.server.to(`room:${roomId}`).emit("auction-started", data);
    if (data?.auctionState?.timerEnd) {
      this._scheduleBidResolve(roomId, data.auctionState.timerEnd);
    }
    // 봇 자동입찰 스케줄링
    this._scheduleBotBids(roomId).catch((e) => {
      console.warn(
        `[Auction] _scheduleBotBids failed for room ${roomId}:`,
        e?.message,
      );
    });
  }

  emitPlayerSold(
    roomId: string,
    data: {
      player: any;
      team: any;
      price: number;
    },
  ) {
    this.server.to(`room:${roomId}`).emit("player-sold", data);
  }

  emitPlayerUnsold(roomId: string, data: { player: any }) {
    this.server.to(`room:${roomId}`).emit("player-unsold", data);
  }

  emitTimerUpdate(roomId: string, timeLeft: number) {
    this.server.to(`room:${roomId}`).emit("timer-update", { timeLeft });
  }

  emitTimerExpired(roomId: string) {
    this.server.to(`room:${roomId}`).emit("timer-expired");
  }

  emitAuctionUpdate(roomId: string, event: string, data: any) {
    this.server.to(`room:${roomId}`).emit(event, data);
  }

  /** 역할 선택 시작 (최대 2회 재시도, 500ms 간격) */
  private async _startRoleSelectionWithRetry(
    roomId: string,
    attempt = 1,
  ): Promise<void> {
    try {
      const roleSelectionData =
        await this.roleSelectionService.startRoleSelection(roomId);
      this.roleSelectionGateway.emitRoleSelectionStarted(
        roomId,
        roleSelectionData,
      );
    } catch (error) {
      console.error(
        `[Auction] Failed to start role selection for room ${roomId} (attempt ${attempt}):`,
        error,
      );
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return this._startRoleSelectionWithRetry(roomId, attempt + 1);
      }
      // 모든 재시도 실패 → 호스트에게 수동 시작 안내
      this.server.to(`room:${roomId}`).emit("auction-error", {
        error:
          "역할 선택 시작에 실패했습니다. 호스트가 소켓 이벤트 'retry-role-selection'을 전송해 재시도하세요.",
        retryable: true,
      });
    }
  }

  /**
   * 역할 선택 수동 재시작 요청.
   * 상태 가드: roleSelectionService.startRoleSelection이 DRAFT_COMPLETED 상태만 허용하므로
   * 잘못된 상태에서의 호출은 자동으로 거부됨.
   */
  @SubscribeMessage("retry-role-selection")
  async handleRetryRoleSelection(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!client.userId) return { error: "Unauthorized" };

    // 호스트만 역할 선택 재시작 가능
    const isHost = await this.auctionService.isRoomHost(
      client.userId,
      data.roomId,
    );
    if (!isHost) {
      return { error: "호스트만 역할 선택을 재시작할 수 있습니다." };
    }

    try {
      await this._startRoleSelectionWithRetry(data.roomId);
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  cleanupRoom(roomId: string): void {
    this._cancelBotTimers(roomId);
    this._cancelBidResolve(roomId);
    // resolvingRooms guard도 정리 (abort 후 재진입 시 블로킹 방지)
    this.resolvingRooms.delete(roomId);
  }

  emitSessionAborted(roomId: string, data: any): void {
    this.cleanupRoom(roomId);
    this.server.to(`room:${roomId}`).emit("session-aborted", data);
  }

  // ========================================
  // Bot Auto-Bid
  // ========================================

  /** 봇 자동입찰 타이머 스케줄링 */
  private async _scheduleBotBids(roomId: string): Promise<void> {
    const state = this.auctionService.getAuctionState(roomId);
    if (!state || state.botCaptainIds.length === 0) return;

    this._cancelBotTimers(roomId);

    const candidates = await this.auctionService.getBotBidCandidates(roomId);

    for (const bot of candidates) {
      if (bot.memberCount >= 5) continue;
      // Skip if this bot team is already leading.
      if (state.currentHighestBidder === bot.teamId) continue;

      const delay = 2000 + Math.random() * 6000;
      const timerId = setTimeout(() => {
        this._autoBotBid(roomId, bot.captainId, bot.username)
          .then(() => this._scheduleBotBids(roomId))
          .catch((e) => {
            console.warn(
              `[Auction] Bot bid/reschedule failed for room ${roomId}:`,
              e?.message,
            );
          });
      }, delay);

      this.botBidTimers.set(`${roomId}_${bot.captainId}`, timerId);
    }
  }

  /** 봇 자동입찰 실행 (최소 입찰 단위로 입찰, 방별 mutex 사용) */
  private async _autoBotBid(
    roomId: string,
    botCaptainId: string,
    botUsername: string,
  ): Promise<void> {
    const state = this.auctionService.getAuctionState(roomId);
    if (!state) return;

    // Ignore if timer already expired; resolver will handle progression.
    if (Date.now() > state.timerEnd) return;

    // 60% chance to bid, 40% chance to pass.
    if (Math.random() > 0.6) return;

    const candidates = await this.auctionService.getBotBidCandidates(roomId);
    const bot = candidates.find((c) => c.captainId === botCaptainId);
    if (!bot) return;

    // Avoid self-outbidding current highest bid.
    if (state.currentHighestBidder === bot.teamId) return;

    const bidIncrement = 50;
    const minBid = state.currentHighestBid + bidIncrement;

    if (bot.memberCount >= 5) return;
    if (minBid > bot.availableToBid) return;

    // resolve 진행 중이면 봇 입찰도 차단
    if (this.resolvingRooms.has(roomId)) return;

    // 방별 mutex — handleBid와 동일한 lock 사용
    const prevLock = this.bidLocks.get(roomId) ?? Promise.resolve();
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.bidLocks.set(roomId, lockPromise);

    try {
      await prevLock;

      const newState = await this.auctionService.placeBid(
        botCaptainId,
        roomId,
        minBid,
      );

      this.server.to(`room:${roomId}`).emit("bid-placed", {
        userId: botCaptainId,
        teamId: newState.currentHighestBidder,
        username: botUsername,
        amount: minBid,
        timerEnd: newState.timerEnd,
        timestamp: new Date().toISOString(),
      });
      this._scheduleBidResolve(roomId, newState.timerEnd);

      console.log(`[BotBid] ${botUsername} bid ${minBid}G in room ${roomId}`);
    } catch {
      // Ignore races such as timer expiry or stale state.
    } finally {
      releaseLock!();
      if (this.bidLocks.get(roomId) === lockPromise) {
        this.bidLocks.delete(roomId);
      }
    }
  }

  private _cancelBotTimers(roomId: string): void {
    for (const [key, timerId] of this.botBidTimers.entries()) {
      if (key.startsWith(`${roomId}_`)) {
        clearTimeout(timerId);
        this.botBidTimers.delete(key);
      }
    }
  }

  private _cancelBidResolve(roomId: string): void {
    const timer = this.bidResolveTimers.get(roomId);
    if (!timer) return;

    clearTimeout(timer);
    this.bidResolveTimers.delete(roomId);
  }

  private _scheduleBidResolve(roomId: string, timerEnd: number): void {
    this._cancelBidResolve(roomId);

    const delayMs = Math.max(0, timerEnd - Date.now());
    const timer = setTimeout(() => {
      this._handleBidTimerExpired(roomId).catch((error) => {
        console.error(
          `[Auction] Failed to handle timer expiry for room ${roomId}:`,
          error,
        );
      });
    }, delayMs);

    this.bidResolveTimers.set(roomId, timer);
  }

  private async _handleBidTimerExpired(roomId: string): Promise<void> {
    const state = this.auctionService.getAuctionState(roomId);
    if (!state) {
      this._cancelBidResolve(roomId);
      return;
    }

    const remainingMs = state.timerEnd - Date.now();
    if (remainingMs > 50) {
      this._scheduleBidResolve(roomId, state.timerEnd);
      return;
    }

    this.emitTimerExpired(roomId);
    await this._resolveCurrentBidAndAdvance(roomId);
  }

  private async _resolveCurrentBidAndAdvance(roomId: string): Promise<any> {
    // Prevent concurrent resolve calls (timer expiry + client resolve-bid race)
    if (this.resolvingRooms.has(roomId)) {
      console.log(`[Auction] Already resolving room ${roomId}, skipping`);
      return null;
    }
    this.resolvingRooms.add(roomId);

    try {
      this._cancelBidResolve(roomId);

      const result = await this.auctionService.resolveCurrentBid(roomId);
      const state = this.auctionService.getAuctionState(roomId) ?? null;
      const { teams, players } =
        await this.auctionService.getFullAuctionData(roomId);
      const payload = { ...result, state, teams, players };

      this.server.to(`room:${roomId}`).emit("bid-resolved", payload);

      if (result.sold && result.player && result.team) {
        this.emitPlayerSold(roomId, {
          player: result.player,
          team: result.team,
          price: result.price ?? 0,
        });
      } else if (!result.sold && result.player) {
        this.emitPlayerUnsold(roomId, { player: result.player });
      }

      const isComplete = await this.auctionService.checkAuctionComplete(roomId);

      if (isComplete) {
        this._cancelBotTimers(roomId);
        this._cancelBidResolve(roomId);

        try {
          await this.auctionService.completeAuction(roomId);
        } catch (error) {
          console.error(
            `[Auction] Failed to complete auction for room ${roomId}:`,
            error,
          );
          this.server.to(`room:${roomId}`).emit("auction-error", {
            error: "경매 완료 처리 중 오류가 발생했습니다.",
          });
          return payload;
        }

        const finalData = await this.auctionService.getFullAuctionData(roomId);
        this.server.to(`room:${roomId}`).emit("auction-complete", {
          teams: finalData.teams,
        });

        await this._startRoleSelectionWithRetry(roomId);

        return payload;
      }

      if (state) {
        this._scheduleBidResolve(roomId, state.timerEnd);
        this._scheduleBotBids(roomId).catch((e) => {
          console.warn(
            `[Auction] _scheduleBotBids failed for room ${roomId}:`,
            e?.message,
          );
        });
      }

      return payload;
    } finally {
      this.resolvingRooms.delete(roomId);
    }
  }
}
