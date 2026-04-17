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

  // 상태 변경을 친구들에게 브로드캐스트 (hybrid 방식)
  //
  // [채널 1] friend:${userId} 룸 — subscribe-friend를 명시적으로 호출한 구독자용
  // [채널 2] user:${friendId} 개인 룸 — 구독 여부와 무관하게 현재 연결된 모든 유저에게 전달
  //   - DB 조회(getFriendIds) 없이 userSockets Map만 사용
  //   - 클라이언트가 자신의 친구 목록과 대조해 필요 없는 이벤트를 무시할 수 있음
  //   - status(온라인/오프라인)는 공개 정보이므로 과도한 노출이 아님
  private async broadcastStatusToFriends(userId: string, status: UserStatus) {
    const payload = {
      userId,
      status,
      lastSeenAt: new Date(),
    };

    // 채널 1: 명시적으로 subscribe-friend를 호출한 클라이언트
    this.server.to(`friend:${userId}`).emit("friend-status-changed", payload);

    // 채널 2: 현재 연결된 모든 유저의 개인 룸에 추가 전달
    // userSockets Map은 게이트웨이 메모리만 사용하므로 DB 조회 없음
    for (const onlineUserId of this.userSockets.keys()) {
      // 자기 자신에게는 발송하지 않음
      if (onlineUserId === userId) continue;
      this.server
        .to(`user:${onlineUserId}`)
        .emit("friend-status-changed", payload);
    }
  }

  // Public method to broadcast status update (can be called from other services)
  async notifyStatusChange(userId: string, status: UserStatus) {
    await this.broadcastStatusToFriends(userId, status);
  }
}
