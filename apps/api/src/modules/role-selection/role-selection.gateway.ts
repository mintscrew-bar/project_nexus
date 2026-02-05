import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { RoleSelectionService } from "./role-selection.service";
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
})
export class RoleSelectionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private roomTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly authService: AuthService,
    private readonly roleSelectionService: RoleSelectionService,
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
    client.join(`room:${data.roomId}`);

    const roleSelectionData = await this.roleSelectionService.getRoleSelectionData(data.roomId);

    return {
      success: true,
      ...roleSelectionData,
    };
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
      const timeRemaining = this.roleSelectionService.getTimeRemaining(roomId);

      if (timeRemaining <= 0) {
        this.completeRoleSelection(roomId);
        this.stopTimer(roomId);
      } else {
        // Emit timer update every second
        this.server.to(`room:${roomId}`).emit("timer-tick", {
          timeRemaining,
        });
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

  // ========================================
  // Completion
  // ========================================

  async completeRoleSelection(roomId: string) {
    try {
      const room = await this.roleSelectionService.completeRoleSelection(roomId);

      this.stopTimer(roomId);

      // Notify all clients
      this.server.to(`room:${roomId}`).emit("role-selection-completed", {
        room,
      });

      return room;
    } catch (error) {
      console.error("Error completing role selection:", error);
      // If not all roles are selected, just notify clients
      this.server.to(`room:${roomId}`).emit("role-selection-timeout", {
        message: "Time's up! Please finish selecting roles.",
      });
    }
  }

  // ========================================
  // External Methods (called by other gateways)
  // ========================================

  async emitRoleSelectionStarted(roomId: string, data: any) {
    this.server.to(`room:${roomId}`).emit("role-selection-started", data);

    // Start the timer
    this.startTimer(roomId);
  }
}
