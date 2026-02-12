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
import { ClanService } from "./clan.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  namespace: "/clan",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
})
export class ClanGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // clanId -> Map<userId, Timeout>
  private readonly TYPING_TIMEOUT_MS = 3000; // 3 seconds

  constructor(
    private readonly authService: AuthService,
    private readonly clanService: ClanService,
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

      // Auto-join user's clan room if they have one
      const userClan = await this.clanService.getUserClan(payload.sub);
      if (userClan) {
        client.join(`clan:${userClan.id}`);
        console.log(
          `Clan client connected: ${client.username} (joined clan:${userClan.id})`,
        );
      } else {
        console.log(`Clan client connected: ${client.username} (no clan)`);
      }
    } catch (_error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      // Find what clan the user was in to clear typing status
      // This is a bit more complex for clans as users can be in only one clan.
      // We need to fetch the user's clan to know which room to clear from.
      this.clanService.getUserClan(client.userId).then((userClan) => {
        if (userClan) {
          // Check if userClan is not null
          this.stopTyping(userClan.id, client.userId!); // Assert client.userId is string
        }
      });
    }
    console.log(`Clan client disconnected: ${client.username}`);
  }

  @SubscribeMessage("join-clan-chat")
  async handleJoinClanChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clanId: string },
  ) {
    // Verify user is a member of this clan
    const userClan = await this.clanService.getUserClan(client.userId!); // Assert client.userId is string
    if (!userClan || userClan.id !== data.clanId) {
      return { error: "Unauthorized to join this clan chat" };
    }

    client.join(`clan:${data.clanId}`);

    const messages = await this.clanService.getChatMessages(
      client.userId!, // Assert client.userId is string
      data.clanId,
      50,
    );

    return {
      success: true,
      messages,
    };
  }

  @SubscribeMessage("leave-clan-chat")
  handleLeaveClanChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clanId: string },
  ) {
    client.leave(`clan:${data.clanId}`);
    // Clear typing status when user leaves chat
    if (client.userId) {
      this.stopTyping(data.clanId, client.userId!); // Assert client.userId is string
    }
  }

  @SubscribeMessage("send-clan-message")
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clanId: string; content: string },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    try {
      const message = await this.clanService.sendChatMessage(
        client.userId!, // Assert client.userId is string
        data.clanId,
        data.content,
      );

      // Broadcast to all clan members
      this.server.to(`clan:${data.clanId}`).emit("new-clan-message", message);

      // Stop typing after sending message
      this.stopTyping(data.clanId, client.userId!); // Assert client.userId is string

      return { success: true, message };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("is-typing")
  async handleIsTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clanId: string; isTyping: boolean },
  ) {
    if (!client.userId || !client.username) {
      return;
    }

    // Verify user is a member of this clan
    const userClan = await this.clanService.getUserClan(client.userId!); // Assert client.userId is string
    if (!userClan || userClan.id !== data.clanId) {
      return { error: "Unauthorized to send typing events in this clan" };
    }

    const { clanId, isTyping } = data;

    if (!this.typingUsers.has(clanId)) {
      this.typingUsers.set(clanId, new Map());
    }
    const clanTypingUsers = this.typingUsers.get(clanId)!;

    if (isTyping) {
      // Clear any existing timeout for this user in this clan
      if (clanTypingUsers.has(client.userId)) {
        clearTimeout(clanTypingUsers.get(client.userId)!); // Assert timeout is not undefined
      } else {
        // User just started typing, broadcast
        this.server.to(clanId).emit("user-typing", {
          userId: client.userId,
          username: client.username,
        });
      }

      // Set a new timeout to stop typing after TYPING_TIMEOUT_MS
      const timeout = setTimeout(() => {
        this.stopTyping(clanId, client.userId!); // Assert client.userId is string
      }, this.TYPING_TIMEOUT_MS);

      clanTypingUsers.set(client.userId, timeout);
    } else {
      // User explicitly stopped typing
      this.stopTyping(clanId, client.userId!); // Assert client.userId is string
    }
  }

  private stopTyping(clanId: string, userId: string) {
    const clanTypingUsers = this.typingUsers.get(clanId);
    if (clanTypingUsers && clanTypingUsers.has(userId)) {
      clearTimeout(clanTypingUsers.get(userId));
      clanTypingUsers.delete(userId);
      this.server.to(clanId).emit("user-stopped-typing", { userId });

      // Clean up clan entry if no one is typing in that clan
      if (clanTypingUsers.size === 0) {
        this.typingUsers.delete(clanId);
      }
    }
  }

  // ========================================
  // Emit Events (called from service or controller)
  // ========================================

  emitMemberJoined(clanId: string, data: { user: any }) {
    this.server.to(`clan:${clanId}`).emit("member-joined", data);
  }

  emitMemberLeft(clanId: string, data: { userId: string; username: string }) {
    this.server.to(`clan:${clanId}`).emit("member-left", data);
  }

  emitMemberKicked(
    clanId: string,
    data: { userId: string; username: string; kickedBy: string },
  ) {
    this.server.to(`clan:${clanId}`).emit("member-kicked", data);
  }

  emitMemberPromoted(
    clanId: string,
    data: { userId: string; username: string; newRole: string },
  ) {
    this.server.to(`clan:${clanId}`).emit("member-promoted", data);
  }

  emitOwnershipTransferred(
    clanId: string,
    data: { oldOwnerId: string; newOwnerId: string },
  ) {
    this.server.to(`clan:${clanId}`).emit("ownership-transferred", data);
  }

  emitClanUpdated(clanId: string, data: any) {
    this.server.to(`clan:${clanId}`).emit("clan-updated", data);
  }

  emitClanDeleted(clanId: string) {
    this.server.to(`clan:${clanId}`).emit("clan-deleted");
  }
}
