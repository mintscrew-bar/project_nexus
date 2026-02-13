import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Inject, forwardRef, Optional } from "@nestjs/common";
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
})
export class SnakeDraftGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly snakeDraftService: SnakeDraftService,
    @Inject(forwardRef(() => RoleSelectionService))
    private readonly roleSelectionService: RoleSelectionService,
    @Inject(forwardRef(() => RoleSelectionGateway))
    private readonly roleSelectionGateway: RoleSelectionGateway,
    @Optional() private readonly redisService?: RedisService,
  ) {}

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

  handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Snake Draft client disconnected: ${client.username}`);
  }

  @SubscribeMessage("join-draft-room")
  async handleJoinDraftRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(`draft:${data.roomId}`);

    const state = this.snakeDraftService.getDraftState(data.roomId);

    return {
      success: true,
      state,
    };
  }

  @SubscribeMessage("leave-draft-room")
  handleLeaveDraftRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`draft:${data.roomId}`);
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

    try {
      const state = await this.snakeDraftService.makePick(
        client.userId,
        data.roomId,
        data.targetPlayerId,
      );

      // Get the team that made the pick
      const currentTeamId = this.snakeDraftService.getCurrentPickingTeam(
        data.roomId,
      );

      // Broadcast to all clients in the draft room
      this.server.to(`draft:${data.roomId}`).emit("pick-made", {
        userId: client.userId,
        username: client.username,
        targetPlayerId: data.targetPlayerId,
        currentTeamId,
        timerEnd: state.timerEnd,
        timestamp: new Date().toISOString(),
      });

      // Check if draft is complete
      const isComplete = await this.snakeDraftService.checkDraftComplete(
        data.roomId,
      );

      if (isComplete) {
        await this.snakeDraftService.completeDraft(data.roomId);
        this.server.to(`draft:${data.roomId}`).emit("draft-complete");

        // Start role selection
        const roleSelectionData =
          await this.roleSelectionService.startRoleSelection(data.roomId);
        this.roleSelectionGateway.emitRoleSelectionStarted(
          data.roomId,
          roleSelectionData,
        );
      } else {
        // Emit next pick turn
        this.server.to(`draft:${data.roomId}`).emit("next-pick", {
          currentTeamId: state.pickOrder[state.currentTeamIndex],
          timerEnd: state.timerEnd,
        });
      }

      return { success: true, state };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("get-draft-state")
  async handleGetDraftState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    const state = this.snakeDraftService.getDraftState(data.roomId);

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
}
