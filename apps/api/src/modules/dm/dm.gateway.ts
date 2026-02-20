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
})
export class DmGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // otherUserId -> Map<myUserId, Timeout>
  private typingTimers = new Map<string, NodeJS.Timeout>();
  private readonly TYPING_TIMEOUT_MS = 3000;

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
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      client.leave(`user:${client.userId}`);
    }
  }

  @SubscribeMessage("send-dm")
  async handleSendDm(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { receiverId: string; content: string },
  ) {
    if (!client.userId) return;
    const { receiverId, content } = data;
    if (!receiverId || !content?.trim()) return;

    const message = await this.dmService.sendMessage(
      client.userId,
      receiverId,
      content.trim(),
    );

    // 송신자에게도 확인 전송 (멀티 디바이스 대비)
    client.emit("new-dm", message);

    // 수신자에게 전송
    this.server.to(`user:${receiverId}`).emit("new-dm", message);

    // 수신자 미읽음 수 업데이트
    const unread = await this.dmService.getUnreadCount(receiverId);
    this.server.to(`user:${receiverId}`).emit("dm-unread-count", { total: unread });
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
    await this.dmService.markAsRead(client.userId, data.senderId);

    const unread = await this.dmService.getUnreadCount(client.userId);
    client.emit("dm-unread-count", { total: unread });
  }
}
