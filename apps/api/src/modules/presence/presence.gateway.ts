import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { OnModuleDestroy } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { PresenceService } from "./presence.service";
import { AuthService } from "../auth/auth.service";
import { FriendService } from "../friend/friend.service";
import { UserStatus, FriendshipStatus } from "@nexus/database";

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
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e4,
})
export class PresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>(); // userId -> Set of socketIds
  private socketUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private readonly presenceService: PresenceService,
    private readonly authService: AuthService,
    private readonly friendService: FriendService,
  ) {}

  onModuleDestroy() {
    this.userSockets.clear();
    this.socketUsers.clear();
  }

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

    const friends = await this.presenceService.getFriendsStatuses(
      client.userId,
    );
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

    // 실제 친구 관계 검증 — ACCEPTED 상태가 아니면 구독 거부
    const friendship = await this.friendService.getFriendshipStatus(
      client.userId,
      data.friendId,
    );
    if (friendship.status !== FriendshipStatus.ACCEPTED) {
      return { error: "Not friends" };
    }

    // 친구 채널 구독
    client.join(`friend:${data.friendId}`);

    // 현재 상태 반환
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

  // 상태 변경을 구독 중인 친구들에게 브로드캐스트
  // friend:${userId} 룸은 subscribe-friend 핸들러에서 친구 관계 검증 후 구독되므로
  // 개별 user:${friendId} 루프 없이 단일 채널 emit만 사용한다
  private async broadcastStatusToFriends(userId: string, status: UserStatus) {
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
