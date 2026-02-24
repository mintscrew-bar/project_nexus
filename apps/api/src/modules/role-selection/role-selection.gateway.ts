import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { OnModuleDestroy, Inject, forwardRef } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { RoleSelectionService } from "./role-selection.service";
import { MatchGateway } from "../match/match.gateway";
import { MatchService } from "../match/match.service";
import { Role } from "@nexus/database";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  namespace: "/role-selection",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class RoleSelectionGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private roomTimers = new Map<string, NodeJS.Timeout>();
  // Guard against duplicate completeRoleSelection calls (timer + all-roles-selected race)
  private completingRooms = new Set<string>();

  constructor(
    private readonly authService: AuthService,
    private readonly roleSelectionService: RoleSelectionService,
    @Inject(forwardRef(() => MatchGateway))
    private readonly matchGateway: MatchGateway,
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
  ) {}

  onModuleDestroy() {
    for (const timer of this.roomTimers.values()) {
      clearInterval(timer);
    }
    this.roomTimers.clear();
    this.completingRooms.clear();
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
      console.log(`Role selection client connected: ${client.username}`);
    } catch (_error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Role selection client disconnected: ${client.username}`);
  }

  @SubscribeMessage("join-room")
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      client.join(`room:${data.roomId}`);

      const roleSelectionData =
        await this.roleSelectionService.getRoleSelectionData(data.roomId);

      return {
        success: true,
        ...roleSelectionData,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || "Failed to join role selection room",
      };
    }
  }

  @SubscribeMessage("select-role")
  async handleSelectRole(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; role: Role },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      const result = await this.roleSelectionService.selectRole(
        client.userId,
        data.roomId,
        data.role,
      );

      // Broadcast role selection to all in room
      this.server.to(`room:${data.roomId}`).emit("role-selected", {
        userId: client.userId,
        username: client.username,
        teamId: result.teamId,
        role: data.role,
        memberId: result.member.id,
      });

      // If all roles are selected, complete role selection
      if (result.allRolesSelected) {
        await this.completeRoleSelection(data.roomId);
      }

      return { success: true, member: result.member };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // ========================================
  // Timer Management
  // ========================================

  startTimer(roomId: string) {
    // Clear existing timer if any
    this.stopTimer(roomId);

    const interval = setInterval(() => {
      try {
        const timeRemaining = this.roleSelectionService.getTimeRemaining(roomId);

        if (timeRemaining <= 0) {
          this.stopTimer(roomId);
          this.completeRoleSelection(roomId).catch((error) => {
            console.error(`[RoleSelection] Timer-triggered completion failed for room ${roomId}:`, error);
          });
        } else {
          // Emit timer update every second
          this.server.to(`room:${roomId}`).emit("timer-tick", {
            timeRemaining,
          });
        }
      } catch (error) {
        console.error(`[RoleSelection] Timer tick error for room ${roomId}:`, error);
        this.stopTimer(roomId);
      }
    }, 1000);

    this.roomTimers.set(roomId, interval);
  }

  stopTimer(roomId: string) {
    const timer = this.roomTimers.get(roomId);
    if (timer) {
      clearInterval(timer);
      this.roomTimers.delete(roomId);
    }
  }

  clearRoomTimer(roomId: string) {
    this.stopTimer(roomId);
  }

  // ========================================
  // Completion
  // ========================================

  async completeRoleSelection(roomId: string) {
    // Prevent duplicate completion (timer expiry + all-roles-selected can race)
    if (this.completingRooms.has(roomId)) {
      console.log(`[RoleSelection] Already completing room ${roomId}, skipping`);
      return;
    }
    this.completingRooms.add(roomId);

    try {
      // Stop timer first to prevent further tick callbacks
      this.stopTimer(roomId);

      // Auto-assign any unselected roles before completing
      await this.roleSelectionService.autoAssignRemainingRoles(roomId);

      const room =
        await this.roleSelectionService.completeRoleSelection(roomId);

      // Notify all clients
      this.server.to(`room:${roomId}`).emit("role-selection-completed", {
        room,
      });

      // Emit bracket-generated so bracket page clients receive the data
      try {
        const matches = await this.matchService.getRoomMatches(roomId);
        this.matchGateway.emitBracketGenerated(roomId, { bracket: matches });
      } catch (bracketError) {
        console.error(`[RoleSelection] Failed to emit bracket-generated for room ${roomId}:`, bracketError);
      }

      return room;
    } catch (error: any) {
      console.error("Error completing role selection:", error);

      // Send error message to clients
      const errorMessage = error?.message || "Role selection completion failed";
      this.server.to(`room:${roomId}`).emit("role-selection-error", {
        message: errorMessage,
        error: error?.response?.message || errorMessage,
      });

      // Also emit timeout event for backward compatibility
      this.server.to(`room:${roomId}`).emit("role-selection-timeout", {
        message: errorMessage,
      });

      throw error; // Re-throw to let caller handle it
    } finally {
      this.completingRooms.delete(roomId);
    }
  }

  // ========================================
  // External Methods (called by other gateways)
  // ========================================

  async emitRoleSelectionStarted(roomId: string, _data: any) {
    // Auto-assign roles by preference (mainRole → subRole → random) before notifying clients
    await this.roleSelectionService.autoAssignRolesByPreference(roomId);

    // Re-fetch data so clients receive the pre-assigned roles immediately
    const data = await this.roleSelectionService.getRoleSelectionData(roomId);
    this.server.to(`room:${roomId}`).emit("role-selection-started", data);

    // Start the countdown timer
    this.startTimer(roomId);
  }

  emitSessionAborted(roomId: string, data: any) {
    this.stopTimer(roomId);
    this.completingRooms.delete(roomId);
    this.server.to(`room:${roomId}`).emit("session-aborted", data);
  }
}
