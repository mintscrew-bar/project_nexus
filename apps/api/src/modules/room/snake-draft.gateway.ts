import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Inject, forwardRef, Optional, OnModuleDestroy } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { SnakeDraftService } from "./snake-draft.service";
import { RoleSelectionService } from "../role-selection/role-selection.service";
import { RoleSelectionGateway } from "../role-selection/role-selection.gateway";
import { RedisService } from "../redis/redis.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  namespace: "/snake-draft",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class SnakeDraftGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, { userId: string; roomId: string }>();
  // Pick timer per room: auto-picks when captain doesn't pick in time
  private pickTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Guard against concurrent autoPick calls
  private autoPickingRooms = new Set<string>();
  // Guard against concurrent manual pick calls
  private manualPickingRooms = new Set<string>();

  constructor(
    private readonly authService: AuthService,
    private readonly snakeDraftService: SnakeDraftService,
    @Inject(forwardRef(() => RoleSelectionService))
    private readonly roleSelectionService: RoleSelectionService,
    @Inject(forwardRef(() => RoleSelectionGateway))
    private readonly roleSelectionGateway: RoleSelectionGateway,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  onModuleDestroy() {
    for (const timer of this.pickTimers.values()) {
      clearTimeout(timer);
    }
    this.pickTimers.clear();
    this.autoPickingRooms.clear();
    this.manualPickingRooms.clear();
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
      console.log(`Snake Draft client connected: ${client.username}`);
    } catch (_error) {
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Snake Draft client disconnected: ${client.username}`);
    const trackedUser = this.connectedUsers.get(client.id);
    this.connectedUsers.delete(client.id);

    if (trackedUser) {
      try {
        await this.snakeDraftService.cleanupBotOnlyRoomOnHostDisconnect(
          trackedUser.userId,
          trackedUser.roomId,
        );
      } catch {
        // Best-effort cleanup only
      }
    }
  }

  @SubscribeMessage("join-draft-room")
  async handleJoinDraftRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      client.join(`draft:${data.roomId}`);

      if (client.userId) {
        this.connectedUsers.set(client.id, {
          userId: client.userId,
          roomId: data.roomId,
        });
      }

      // Use getClientDraftState for rich state with team/player details
      const state = await this.snakeDraftService.getClientDraftState(data.roomId);

      return {
        success: true,
        state,
      };
    } catch (error: any) {
      return { success: false, error: error?.message || "Failed to join draft room" };
    }
  }

  @SubscribeMessage("leave-draft-room")
  handleLeaveDraftRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`draft:${data.roomId}`);
    this.connectedUsers.delete(client.id);
  }

  @SubscribeMessage("make-pick")
  async handleMakePick(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      roomId: string;
      targetPlayerId: string;
    },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    // Payload validation
    if (!data.roomId || !data.targetPlayerId) {
      return { error: "Invalid pick data" };
    }

    // Rate limiting: max 3 picks per 2 seconds per user
    if (this.redisService) {
      try {
        const rateLimit = await this.redisService.checkRateLimit(
          `draft:pick:${client.userId}`,
          3,
          2,
        );
        if (!rateLimit.allowed) {
          return {
            error: `Too many picks. Try again in ${rateLimit.resetIn}s`,
          };
        }
      } catch {
        // Redis unavailable — allow pick to proceed
      }
    }

    // Race condition guard: reject if auto-pick or another manual pick is in progress
    if (this.autoPickingRooms.has(data.roomId) || this.manualPickingRooms.has(data.roomId)) {
      return { error: "A pick is already in progress, please wait" };
    }

    this.manualPickingRooms.add(data.roomId);

    // Cancel timer BEFORE making pick to prevent race condition
    this._cancelPickTimer(data.roomId);

    try {
      // Capture which team is picking BEFORE advancing state
      const pickingTeamId = this.snakeDraftService.getCurrentPickingTeam(data.roomId);

      const state = await this.snakeDraftService.makePick(
        client.userId,
        data.roomId,
        data.targetPlayerId,
      );

      // Get enriched state for player details
      const clientState = await this.snakeDraftService.getClientDraftState(data.roomId);
      const pickingTeam = clientState?.teams?.find((t: any) => t.id === pickingTeamId);
      const pickedPlayer = pickingTeam?.members?.find(
        (m: any) => m.id === data.targetPlayerId,
      );
      const nextTeamId = state.pickOrder[state.currentTeamIndex] ?? null;

      // Broadcast with frontend-expected shape
      this.server.to(`draft:${data.roomId}`).emit("pick-made", {
        teamId: pickingTeamId,
        player: pickedPlayer ?? { id: data.targetPlayerId, username: client.username },
        nextTeamId,
        timerEnd: state.timerEnd,
      });

      // Check if draft is complete
      const isComplete = await this.snakeDraftService.checkDraftComplete(
        data.roomId,
      );

      if (isComplete) {
        // Get final teams BEFORE completeDraft (which deletes in-memory state)
        const finalState = await this.snakeDraftService.getClientDraftState(data.roomId);
        await this.snakeDraftService.completeDraft(data.roomId);
        this.server.to(`draft:${data.roomId}`).emit("draft-complete", {
          teams: finalState?.teams ?? [],
        });

        // Start role selection
        const roleSelectionData =
          await this.roleSelectionService.startRoleSelection(data.roomId);
        this.roleSelectionGateway.emitRoleSelectionStarted(
          data.roomId,
          roleSelectionData,
        );
      } else {
        // Schedule auto-pick timer for next turn
        this._schedulePickTimer(data.roomId, state.timerEnd);

        // Emit next pick turn
        this.server.to(`draft:${data.roomId}`).emit("next-pick", {
          currentTeamId: nextTeamId,
          timerEnd: state.timerEnd,
        });
      }

      return { success: true, state: clientState };
    } catch (error: any) {
      return { error: error.message };
    } finally {
      this.manualPickingRooms.delete(data.roomId);
    }
  }

  @SubscribeMessage("get-draft-state")
  async handleGetDraftState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    const state = await this.snakeDraftService.getClientDraftState(data.roomId);

    if (!state) {
      return { error: "Draft not found" };
    }

    return { success: true, state };
  }

  // Emit draft state updates (called from service or controller)
  emitDraftUpdate(roomId: string, event: string, data: any) {
    this.server.to(`draft:${roomId}`).emit(event, data);
  }

  emitDraftStarted(roomId: string, data: any) {
    this.server.to(`draft:${roomId}`).emit("draft-started", data);

    // Start auto-pick timer for the first pick
    const timerEnd = data?.timerEnd ?? data?.draftState?.timerEnd;
    if (timerEnd) {
      this._schedulePickTimer(roomId, timerEnd);
    }
  }

  emitTimerExpired(roomId: string) {
    this.server.to(`draft:${roomId}`).emit("timer-expired");
  }

  emitAutoPickMade(
    roomId: string,
    data: { teamId: string; playerId: string; username: string },
  ) {
    this.server.to(`draft:${roomId}`).emit("auto-pick-made", data);
  }

  emitSessionAborted(roomId: string, data: any) {
    this.server.to(`draft:${roomId}`).emit("session-aborted", data);
  }

  private _cancelPickTimer(roomId: string) {
    const timer = this.pickTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.pickTimers.delete(roomId);
    }
  }

  private _schedulePickTimer(roomId: string, timerEnd: number) {
    this._cancelPickTimer(roomId);

    const delay = Math.max(0, timerEnd - Date.now());
    const timer = setTimeout(async () => {
      this.pickTimers.delete(roomId);

      // 중복 autoPick 방지
      if (this.autoPickingRooms.has(roomId)) return;
      this.autoPickingRooms.add(roomId);

      try {
        // autoPick 전 현재 팀 정보 저장
        const preState = this.snakeDraftService.getDraftState(roomId);
        if (!preState) return;
        const pickingTeamId = preState.pickOrder[preState.currentTeamIndex];

        const state = await this.snakeDraftService.autoPick(roomId);

        this.emitTimerExpired(roomId);

        // Get enriched state for player details
        const clientState = await this.snakeDraftService.getClientDraftState(roomId);
        const pickingTeam = clientState?.teams?.find((t: any) => t.id === pickingTeamId);
        const lastMember = pickingTeam?.members?.[pickingTeam.members.length - 1];
        const nextTeamId = state.pickOrder[state.currentTeamIndex] ?? null;

        // Emit pick-made with same shape as manual pick
        this.server.to(`draft:${roomId}`).emit("pick-made", {
          teamId: pickingTeamId,
          player: lastMember ?? { id: "unknown", username: "Auto-pick" },
          nextTeamId,
          timerEnd: state.timerEnd,
        });

        // Also emit auto-pick-made for UI notification
        this.emitAutoPickMade(roomId, {
          teamId: pickingTeamId,
          playerId: lastMember?.id ?? "unknown",
          username: lastMember?.username ?? "Auto-pick",
        });

        const isComplete = await this.snakeDraftService.checkDraftComplete(roomId);
        if (isComplete) {
          // Get final teams BEFORE completeDraft (which deletes in-memory state)
          const finalState = await this.snakeDraftService.getClientDraftState(roomId);
          await this.snakeDraftService.completeDraft(roomId);
          this.server.to(`draft:${roomId}`).emit("draft-complete", {
            teams: finalState?.teams ?? [],
          });

          const roleSelectionData =
            await this.roleSelectionService.startRoleSelection(roomId);
          this.roleSelectionGateway.emitRoleSelectionStarted(roomId, roleSelectionData);
        } else {
          if (state?.timerEnd) {
            this._schedulePickTimer(roomId, state.timerEnd);
          }
          this.server.to(`draft:${roomId}`).emit("next-pick", {
            currentTeamId: nextTeamId,
            timerEnd: state.timerEnd,
          });
        }
      } catch (error) {
        console.error(`[SnakeDraft] Auto-pick error for room ${roomId}:`, error);
      } finally {
        this.autoPickingRooms.delete(roomId);
      }
    }, delay);

    this.pickTimers.set(roomId, timer);
  }
}
