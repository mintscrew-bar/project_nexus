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
import { PresenceService } from "./presence.service";
import { AuthService } from "../auth/auth.service";
import { UserStatus } from "@nexus/database";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  namespace: "/presence",
})
export class PresenceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private socketUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private readonly presenceService: PresenceService,
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

      // Track socket connection
      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(client.id);
      this.socketUsers.set(client.id, payload.sub);

      // Set user online
      await this.presenceService.setUserOnline(payload.sub, client.id);

      // Join personal room for receiving friend updates
      client.join(`user:${payload.sub}`);

      // Notify friends about status change
      await this.broadcastStatusToFriends(payload.sub, UserStatus.ONLINE);

      console.log(`[Presence] User ${payload.username} connected (${client.id})`);
    } catch (error) {
      console.error("[Presence] Connection error:", error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      // Remove socket tracking
      const sockets = this.userSockets.get(client.userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
      this.socketUsers.delete(client.id);

      // Set user offline (only if no more connections)
      const isFullyOffline = await this.presenceService.setUserOffline(
        client.userId,
        client.id,
      );

      // Only broadcast offline if user has no more connections
      if (isFullyOffline) {
        await this.broadcastStatusToFriends(client.userId, UserStatus.OFFLINE);
      }

      console.log(`[Presence] User ${client.username} disconnected (${client.id})`);
    }
  }

  @SubscribeMessage("set-status")
  async handleSetStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { status: "ONLINE" | "AWAY" },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    const status = data.status === "AWAY" ? UserStatus.AWAY : UserStatus.ONLINE;

    await this.presenceService.updateStatus(client.userId, status);
    await this.broadcastStatusToFriends(client.userId, status);

    return { success: true, status };
  }

  @SubscribeMessage("get-friends-status")
  async handleGetFriendsStatus(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    const friends = await this.presenceService.getFriendsStatuses(client.userId);
    return { success: true, friends };
  }

  @SubscribeMessage("subscribe-friend")
  async handleSubscribeFriend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { friendId: string },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    // Join the friend's channel to receive their status updates
    client.join(`friend:${data.friendId}`);

    // Get and return current status
    const status = await this.presenceService.getUserStatus(data.friendId);
    return { success: true, ...status };
  }

  @SubscribeMessage("unsubscribe-friend")
  handleUnsubscribeFriend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { friendId: string },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    client.leave(`friend:${data.friendId}`);
    return { success: true };
  }

  // Broadcast status change to all friends
  private async broadcastStatusToFriends(userId: string, status: UserStatus) {
    const friendIds = await this.presenceService.getFriendIds(userId);

    // Emit to each friend's personal room
    for (const friendId of friendIds) {
      this.server.to(`user:${friendId}`).emit("friend-status-changed", {
        userId,
        status,
        lastSeenAt: new Date(),
      });
    }

    // Also emit to anyone subscribed to this user
    this.server.to(`friend:${userId}`).emit("friend-status-changed", {
      userId,
      status,
      lastSeenAt: new Date(),
    });
  }

  // Public method to broadcast status update (can be called from other services)
  async notifyStatusChange(userId: string, status: UserStatus) {
    await this.broadcastStatusToFriends(userId, status);
  }
}
