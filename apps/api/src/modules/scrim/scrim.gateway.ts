import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

/**
 * 배틀로얄 스크림 진행 상황을 참가자 전원에게 밀어준다.
 *
 * 라운드가 시작되고 결과가 들어오는 걸 방장 화면에서만 볼 수 있으면,
 * 나머지 사람들은 새로고침을 눌러가며 리더보드를 확인해야 한다.
 */
@WebSocketGateway({
  namespace: "/scrim",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e4,
  transports: ["websocket"],
})
export class ScrimGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly authService: AuthService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = await this.authService
        .validateToken(token)
        .catch(() => null);
      if (!payload) {
        client.disconnect();
        return;
      }
      client.userId = payload.sub;
      client.username = payload.username;
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage("join-scrim")
  handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!client.userId || !data?.roomId) return;
    client.join(this.room(data.roomId));
  }

  @SubscribeMessage("leave-scrim")
  handleLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!data?.roomId) return;
    client.leave(this.room(data.roomId));
  }

  /** 스크림 상태가 바뀔 때마다 방 전체에 알린다. */
  broadcastScrimUpdate(roomId: string, event: string, payload: unknown) {
    this.server?.to(this.room(roomId)).emit(event, payload);
  }

  private room(roomId: string) {
    return `scrim:${roomId}`;
  }
}
