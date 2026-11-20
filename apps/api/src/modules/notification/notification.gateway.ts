import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { MEDAL_BALANCE_EVENT } from "../medal/medal.service";

@WebSocketGateway({
  namespace: "notification",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e4,
  transports: ["websocket", "polling"],
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const raw =
        client.handshake.auth?.token || client.handshake.headers?.authorization;
      const token = raw?.startsWith("Bearer ")
        ? raw.slice(7).trim()
        : raw?.trim();

      if (!token) {
        this.logger.warn("Client connection rejected: No token provided");
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get("JWT_ACCESS_SECRET"),
      });

      const userId = payload.sub;

      // Join user-specific room
      await client.join(`user:${userId}`);

      this.logger.log(`Client connected to notification: ${userId}`);
    } catch (error) {
      this.logger.error("WebSocket connection error:", error);
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {
    this.logger.log("Client disconnected from notification");
  }

  /**
   * Send notification to a specific user
   */
  sendToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit("notification", notification);
  }

  /**
   * Send unread count update to a user
   */
  sendUnreadCount(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit("unread-count", { count });
  }

  /**
   * 친구 내전 초대 팝업. 알림(종) 목록에는 쌓지 않는다 — 친구창 대기 탭이
   * 같은 초대를 보여준다(RoomInviteService).
   */
  sendRoomInvite(userId: string, invite: unknown) {
    this.server.to(`user:${userId}`).emit("room-invite", invite);
  }

  /**
   * 메달 잔액이 바뀌면(운영자 지급·일괄 지급·경기 정산·구매·환불) 그 사람에게 바로 알린다.
   * 헤더 메달 칩이 받아 잔액·내역을 다시 읽는다 — 새로고침 없이 반영되게.
   */
  @OnEvent(MEDAL_BALANCE_EVENT)
  sendMedalBalance(payload: { userId: string; balance: number }) {
    this.server
      ?.to(`user:${payload.userId}`)
      .emit("medal-balance", { balance: payload.balance });
  }
}
