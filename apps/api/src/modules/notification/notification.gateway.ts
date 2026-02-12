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

@WebSocketGateway({
  namespace: "notification",
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
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
      // Verify JWT token
      const token =
        client.handshake.auth.token || client.handshake.headers.authorization;

      if (!token) {
        this.logger.warn("Client connection rejected: No token provided");
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get("JWT_SECRET"),
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
}
