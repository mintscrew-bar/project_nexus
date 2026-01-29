import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { RoomService } from "./room.service";
import { AuthService } from "../auth/auth.service";

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
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, string>(); // userId -> socketId
  private socketRooms = new Map<string, string>(); // socketId -> roomId
  private readonly ROOM_LIST_CHANNEL = "room-list"; // Channel for room list updates

  constructor(
    private readonly roomService: RoomService,
    private readonly authService: AuthService,
  ) {}

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

      this.userSockets.set(payload.sub, client.id);

      console.log(`User ${payload.username} connected (${client.id})`);
    } catch (error) {
      console.error("Connection error:", error);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.userSockets.delete(client.userId);

      // Leave room if in one
      const roomId = this.socketRooms.get(client.id);
      if (roomId) {
        client.leave(roomId);
        this.socketRooms.delete(client.id);
        this.server.to(roomId).emit("user-left", {
          userId: client.userId,
          username: client.username,
        });
      }

      console.log(`User ${client.username} disconnected (${client.id})`);
    }
  }

  // ========================================
  // Room List Subscription
  // ========================================

  @SubscribeMessage("subscribe-room-list")
  async handleSubscribeRoomList(@ConnectedSocket() client: AuthenticatedSocket) {
    client.join(this.ROOM_LIST_CHANNEL);

    // Send current room list immediately
    const rooms = await this.roomService.listRooms({ status: "WAITING" as any });
    return { success: true, rooms };
  }

  @SubscribeMessage("unsubscribe-room-list")
  handleUnsubscribeRoomList(@ConnectedSocket() client: AuthenticatedSocket) {
    client.leave(this.ROOM_LIST_CHANNEL);
    return { success: true };
  }

  // Broadcast room list updates to all subscribers
  async broadcastRoomListUpdate() {
    const rooms = await this.roomService.listRooms({ status: "WAITING" as any });
    this.server.to(this.ROOM_LIST_CHANNEL).emit("room-list-updated", rooms);
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
        (p) => p.userId === client.userId,
      );

      // If not a participant, join the room (add to DB)
      if (!isAlreadyParticipant) {
        room = await this.roomService.joinRoom(client.userId, {
          roomId: data.roomId,
          password: data.password,
        });
      }

      // Join Socket.IO room
      client.join(data.roomId);
      this.socketRooms.set(client.id, data.roomId);

      // Notify others
      client.to(data.roomId).emit("user-joined", {
        userId: client.userId,
        username: client.username,
      });

      // Broadcast updated room to all participants
      this.server.to(data.roomId).emit("room-updated", room);

      // Broadcast room list update to subscribers
      this.broadcastRoomListUpdate();

      return {
        success: true,
        room,
      };
    } catch (error: any) {
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

      await this.roomService.leaveRoom(client.userId, data.roomId);

      // Leave Socket.IO room
      client.leave(data.roomId);
      this.socketRooms.delete(client.id);

      // Notify others
      this.server.to(data.roomId).emit("user-left", {
        userId: client.userId,
        username: client.username,
      });

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
        client.userId,
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

  @SubscribeMessage("start-game")
  async handleStartGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      const result = await this.roomService.startGame(
        client.userId,
        data.roomId,
      );

      // Notify all players that game is starting
      this.server.to(data.roomId).emit("game-starting", {
        roomId: result.roomId,
        teamMode: result.teamMode,
      });

      return result;
    } catch (error: any) {
      return { error: error.message };
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
        client.userId,
        data.roomId,
        data.content,
      );

      // Broadcast to all in room
      this.server.to(data.roomId).emit("new-message", message);

      return { success: true, message };
    } catch (error: any) {
      return { error: error.message };
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
