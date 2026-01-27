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
import { AuctionService } from "./auction.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  namespace: "/auction",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
})
export class AuctionGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly auctionService: AuctionService,
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
      console.log(`Auction client connected: ${client.username}`);
    } catch (_error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Auction client disconnected: ${client.username}`);
  }

  @SubscribeMessage("join-room")
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(`room:${data.roomId}`);

    const state = this.auctionService.getAuctionState(data.roomId);

    return {
      success: true,
      state,
    };
  }

  @SubscribeMessage("leave-room")
  handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`room:${data.roomId}`);
  }

  @SubscribeMessage("place-bid")
  async handleBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      roomId: string;
      amount: number;
    },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    try {
      const state = await this.auctionService.placeBid(
        client.userId,
        data.roomId,
        data.amount,
      );

      // Broadcast to all clients in the room
      this.server.to(`room:${data.roomId}`).emit("bid-placed", {
        userId: client.userId,
        username: client.username,
        amount: data.amount,
        timerEnd: state.timerEnd,
        timestamp: new Date().toISOString(),
      });

      return { success: true, state };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  @SubscribeMessage("resolve-bid")
  async handleResolveBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    try {
      const result = await this.auctionService.resolveCurrentBid(data.roomId);

      // Broadcast result
      this.server.to(`room:${data.roomId}`).emit("bid-resolved", result);

      // Emit specific event based on result
      if (result.sold && result.player && result.team) {
        this.emitPlayerSold(data.roomId, {
          player: result.player,
          team: result.team,
          price: result.price!,
        });
      } else if (!result.sold && result.player) {
        this.emitPlayerUnsold(data.roomId, { player: result.player });
      }

      // Check if auction is complete
      const isComplete = await this.auctionService.checkAuctionComplete(
        data.roomId,
      );

      if (isComplete) {
        await this.auctionService.completeAuction(data.roomId);
        this.server.to(`room:${data.roomId}`).emit("auction-complete");
      }

      return { success: true, result };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // ========================================
  // Emit Methods (called from service or external)
  // ========================================

  emitAuctionStarted(roomId: string, data: any) {
    this.server.to(`room:${roomId}`).emit("auction-started", data);
  }

  emitPlayerSold(
    roomId: string,
    data: {
      player: any;
      team: any;
      price: number;
    },
  ) {
    this.server.to(`room:${roomId}`).emit("player-sold", data);
  }

  emitPlayerUnsold(roomId: string, data: { player: any }) {
    this.server.to(`room:${roomId}`).emit("player-unsold", data);
  }

  emitTimerUpdate(roomId: string, timeLeft: number) {
    this.server.to(`room:${roomId}`).emit("timer-update", { timeLeft });
  }

  emitTimerExpired(roomId: string) {
    this.server.to(`room:${roomId}`).emit("timer-expired");
  }

  emitAuctionUpdate(roomId: string, event: string, data: any) {
    this.server.to(`room:${roomId}`).emit(event, data);
  }
}
