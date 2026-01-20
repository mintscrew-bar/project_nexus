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
    console.log(`Clan client disconnected: ${client.username}`);
  }

  @SubscribeMessage("join-clan-chat")
  async handleJoinClanChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clanId: string },
  ) {
    client.join(`clan:${data.clanId}`);

    const messages = await this.clanService.getChatMessages(
      client.userId!,
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
        client.userId,
        data.clanId,
        data.content,
      );

      // Broadcast to all clan members
      this.server.to(`clan:${data.clanId}`).emit("new-clan-message", message);

      return { success: true, message };
    } catch (error: any) {
      return { error: error.message };
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
