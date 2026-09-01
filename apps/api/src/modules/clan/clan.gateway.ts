import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { OnModuleDestroy } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { ClanService } from "./clan.service";
import { RedisService } from "../redis/redis.service";
import {
  checkChatRateLimit,
  checkTypingRateLimit,
  chatRateLimitMessage,
} from "../../common/utils/chat-rate-limit";

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
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e4,
  transports: ["websocket", "polling"],
})
export class ClanGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private typingUsers = new Map<string, Map<string, NodeJS.Timeout>>(); // clanId -> Map<userId, Timeout>
  private readonly TYPING_TIMEOUT_MS = 3000; // 3 seconds

  constructor(
    private readonly authService: AuthService,
    private readonly clanService: ClanService,
    private readonly redisService: RedisService,
  ) {}

  onModuleDestroy() {
    for (const clanTyping of this.typingUsers.values()) {
      for (const timeout of clanTyping.values()) {
        clearTimeout(timeout);
      }
    }
    this.typingUsers.clear();
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

      // Auto-join user's clan room if they have one
      const userClan = await this.clanService.getUserClan(payload.sub);
      if (userClan) {
        client.join(`clan:${userClan.id}`);
      }
    } catch (_error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      // 비동기 타이핑 상태 정리 (void로 floating promise 억제)
      void this.clanService.getUserClan(client.userId).then((userClan) => {
        if (userClan) {
          this.stopTyping(userClan.id, client.userId!);
        }
      });
    }
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

    const result = await this.clanService.getChatMessages(
      client.userId!, // Assert client.userId is string
      data.clanId,
      undefined,
      50,
    );

    return {
      success: true,
      ...result,
    };
  }

  @SubscribeMessage("leave-clan-chat")
  async handleLeaveClanChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clanId: string },
  ) {
    if (!client.userId) return;

    // 실제 클랜 멤버인지 확인 후 룸 이탈 처리
    const userClan = await this.clanService.getUserClan(client.userId);
    if (!userClan || userClan.id !== data.clanId) {
      return { error: "Unauthorized to leave this clan chat" };
    }

    client.leave(`clan:${data.clanId}`);
    this.stopTyping(data.clanId, client.userId);
  }

  @SubscribeMessage("send-clan-message")
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { clanId: string; content: string },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    // 채팅은 전역 HTTP 스로틀러가 닿지 않는 경로다. 소켓 단에서 직접 제한한다.
    const rate = await checkChatRateLimit(
      this.redisService,
      `chat:clan:${client.userId}`,
    );
    if (!rate.allowed) {
      return { error: chatRateLimitMessage(rate.retryIn) };
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

    // 타이핑 표시는 상대/방 전체 브로드캐스트를 유발한다.
    // isTyping을 false↔true로 번갈아 보내 전환을 강제하면 무제한 팬아웃이 되므로
    // 메시지보다 느슨한 별도 한도로 막는다. 막혔을 때는 조용히 무시한다 —
    // 타이핑 표시는 장식이라 사용자에게 알릴 것이 없다.
    const typingRate = await checkTypingRateLimit(
      this.redisService,
      `typing:clan:${client.userId}`,
    );
    if (!typingRate.allowed) return;

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
        // 클라이언트가 clan:${clanId} 룸에 조인하므로 동일한 룸명으로 브로드캐스트
        this.server.to(`clan:${clanId}`).emit("user-typing", {
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
      // 동일하게 clan:${clanId} 룸으로 브로드캐스트
      this.server.to(`clan:${clanId}`).emit("user-stopped-typing", { userId });

      // 클랜 내 타이핑 중인 유저가 없으면 Map 정리
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

  emitMessageDeleted(clanId: string, messageId: string) {
    this.server
      .to(`clan:${clanId}`)
      .emit("clan-message-deleted", { messageId });
  }

  emitAnnouncementCreated(clanId: string, announcement: any) {
    this.server
      .to(`clan:${clanId}`)
      .emit("clan-announcement-created", announcement);
  }

  emitAnnouncementDeleted(clanId: string, announcementId: string) {
    this.server
      .to(`clan:${clanId}`)
      .emit("clan-announcement-deleted", { announcementId });
  }

  emitJoinRequestReceived(clanId: string, data: any) {
    this.server.to(`clan:${clanId}`).emit("clan-join-request-received", data);
  }

  emitJoinRequestResolved(
    clanId: string,
    data: { requestId: string; accepted: boolean },
  ) {
    this.server.to(`clan:${clanId}`).emit("clan-join-request-resolved", data);
  }
}
