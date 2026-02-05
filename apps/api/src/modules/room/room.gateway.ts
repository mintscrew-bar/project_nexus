import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Inject, forwardRef } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { RoomService } from "./room.service";
import { SnakeDraftService } from "./snake-draft.service";
import { SnakeDraftGateway } from "./snake-draft.gateway";
import { AuthService } from "../auth/auth.service";
import { AuctionService } from "../auction/auction.service";
import { AuctionGateway } from "../auction/auction.gateway";
import { TeamMode } from "@nexus/database";

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
  private typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // roomId -> Map<userId, Timeout>
  private readonly TYPING_TIMEOUT_MS = 3000; // 3 seconds

  constructor(
    private readonly roomService: RoomService,
    private readonly authService: AuthService,
    private readonly snakeDraftService: SnakeDraftService,
    private readonly snakeDraftGateway: SnakeDraftGateway,
    @Inject(forwardRef(() => AuctionService))
    private readonly auctionService: AuctionService,
    @Inject(forwardRef(() => AuctionGateway))
    private readonly auctionGateway: AuctionGateway,
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

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.userSockets.delete(client.userId);

      // Leave room if in one
      const roomId = this.socketRooms.get(client.id);
      if (roomId) {
        try {
          // Actually remove participant from database
          await this.roomService.leaveRoom(client.userId!, roomId); // Assert client.userId is string
        } catch (error) {
          // Room might already be deleted or user not in room, ignore
          console.log(`Leave room on disconnect error:`, error);
        }

        client.leave(roomId);
        this.socketRooms.delete(client.id);

        // Notify others in the room
        this.server.to(roomId).emit("user-left", {
          userId: client.userId,
          username: client.username,
        });

        // Clear typing status on disconnect
        this.stopTyping(roomId, client.userId!); // Assert client.userId is string

        // Broadcast room list update to subscribers
        this.broadcastRoomListUpdate();
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
        (p: any) => p.userId === client.userId,
      );

      // If not a participant, join the room (add to DB)
      if (!isAlreadyParticipant) {
        room = await this.roomService.joinRoom(client.userId!, { // Assert client.userId is string
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

  @SubscribeMessage("start-game")
  async handleStartGame(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      // Get room to check teamMode
      const room = await this.roomService.getRoomById(data.roomId);

      let result;
      if (room.teamMode === TeamMode.AUCTION) {
        // Start auction directly
        result = await this.auctionService.startAuction(client.userId!, data.roomId); // Assert client.userId is string

        // Emit auction-started event to auction room
        this.auctionGateway.emitAuctionStarted(data.roomId, result);
      } else if (room.teamMode === TeamMode.SNAKE_DRAFT) {
        // Start snake draft directly
        result = await this.snakeDraftService.startSnakeDraft(client.userId!, data.roomId); // Assert client.userId is string

        // Emit draft-started event to room (for lobby clients) and draft room (for draft page clients)
        this.server.to(data.roomId).emit("draft-started", result);
        this.snakeDraftGateway.emitDraftStarted(data.roomId, result);
      }

      // Notify all players that game is starting (for navigation)
      this.server.to(data.roomId).emit("game-starting", {
        roomId: data.roomId,
        teamMode: room.teamMode,
      });

      return { success: true, roomId: data.roomId, teamMode: room.teamMode };
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
