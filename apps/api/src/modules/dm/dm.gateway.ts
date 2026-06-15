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
import { DmService } from "./dm.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  namespace: "/dm",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e4,
  transports: ["websocket", "polling"],
})
export class DmGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  onModuleDestroy() {
    for (const timeout of this.typingTimers.values()) {
      clearTimeout(timeout);
    }
    this.typingTimers.clear();
    this.userSockets.clear();
  }

  @WebSocketServer()
  server: Server;

  // "senderId:receiverId" → Timeout
  private typingTimers = new Map<string, NodeJS.Timeout>();
  private readonly TYPING_TIMEOUT_MS = 3000;

  // userId → Set<socketId> (disconnect 시 타이핑 정리용)
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly authService: AuthService,
    private readonly dmService: DmService,
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

      // 유저별 전용 room에 조인 → 수신 이벤트 타겟팅에 사용
      client.join(`user:${payload.sub}`);

      // 소켓 추적 (disconnect 정리용)
      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(client.id);

      // 재접속 시 미읽음 수 즉시 전송 (Redis 캐시 우선)
      const unread = await this.dmService.getUnreadCount(payload.sub);
      client.emit("dm-unread-count", { total: unread });
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (!client.userId) return;

    client.leave(`user:${client.userId}`);

    // 소켓 추적에서 제거
    const sockets = this.userSockets.get(client.userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(client.userId);

        // 이 유저의 모든 타이핑 타이머 정리
        for (const [key, timer] of this.typingTimers.entries()) {
          if (key.startsWith(`${client.userId}:`)) {
            clearTimeout(timer);
            this.typingTimers.delete(key);

            // 상대에게 타이핑 중지 알림
            const receiverId = key.split(":")[1];
            this.server.to(`user:${receiverId}`).emit("dm-stopped-typing", {
              userId: client.userId,
            });
          }
        }
      }
    }
  }

  @SubscribeMessage("send-dm")
  async handleSendDm(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { receiverId: string; content: string },
  ) {
    if (!client.userId) return;
    const { receiverId, content } = data;

    // 입력 검증
    if (!receiverId || typeof receiverId !== "string") {
      return { success: false, error: "Invalid receiver" };
    }
    const trimmed = content?.trim();
    if (!trimmed) {
      return { success: false, error: "Message cannot be empty" };
    }
    if (trimmed.length > 2000) {
      return { success: false, error: "Message too long (max 2000)" };
    }

    if (receiverId === client.userId) {
      return { success: false, error: "Cannot send message to yourself" };
    }

    try {
      // 양방향 차단 확인: 내가 상대를 차단했거나, 상대가 나를 차단한 경우 모두 거부
      const [blockedByMe, blockedByThem] = await Promise.all([
        this.dmService.isBlocked(client.userId, receiverId),
        this.dmService.isBlocked(receiverId, client.userId),
      ]);
      if (blockedByMe || blockedByThem) {
        return { success: false, error: "Cannot send message to this user" };
      }

      // DB 저장 + Redis 카운트 증가 (sendMessage 내부에서 처리)
      const message = await this.dmService.sendMessage(
        client.userId,
        receiverId,
        trimmed,
        client.username ?? "Unknown",
      );

      // 즉시 양쪽에 전달
      client.emit("new-dm", message);
      this.server.to(`user:${receiverId}`).emit("new-dm", message);

      // 미읽음 카운트 업데이트 (Redis에서 즉시 조회 — DB COUNT 안 함)
      const unread = await this.dmService.getUnreadCount(receiverId);
      this.server
        .to(`user:${receiverId}`)
        .emit("dm-unread-count", { total: unread });

      // ACK 반환
      return {
        success: true,
        messageId: message.id,
        createdAt: message.createdAt,
      };
    } catch (error: any) {
      console.error(
        `[DM] Failed to send message from ${client.userId}:`,
        error?.message,
      );
      return { success: false, error: "Failed to send message" };
    }
  }

  @SubscribeMessage("is-typing")
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { receiverId: string; isTyping: boolean },
  ) {
    if (!client.userId) return;
    const { receiverId, isTyping } = data;
    const key = `${client.userId}:${receiverId}`;

    if (isTyping) {
      this.server.to(`user:${receiverId}`).emit("dm-typing", {
        userId: client.userId,
        username: client.username,
      });

      // 타이머 리셋
      if (this.typingTimers.has(key)) {
        clearTimeout(this.typingTimers.get(key)!);
      }
      this.typingTimers.set(
        key,
        setTimeout(() => {
          this.server.to(`user:${receiverId}`).emit("dm-stopped-typing", {
            userId: client.userId,
          });
          this.typingTimers.delete(key);
        }, this.TYPING_TIMEOUT_MS),
      );
    } else {
      if (this.typingTimers.has(key)) {
        clearTimeout(this.typingTimers.get(key)!);
        this.typingTimers.delete(key);
      }
      this.server.to(`user:${receiverId}`).emit("dm-stopped-typing", {
        userId: client.userId,
      });
    }
  }

  @SubscribeMessage("mark-read")
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { senderId: string },
  ) {
    if (!client.userId) return;
    try {
      await this.dmService.markAsRead(client.userId, data.senderId);

      // Redis에서 즉시 조회
      const unread = await this.dmService.getUnreadCount(client.userId);
      client.emit("dm-unread-count", { total: unread });
    } catch (error: any) {
      console.error(
        `[DM] Failed to mark-read for ${client.userId}:`,
        error?.message,
      );
    }
  }
}
