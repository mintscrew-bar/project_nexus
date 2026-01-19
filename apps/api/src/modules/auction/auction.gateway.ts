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
}

@WebSocketGateway({
  namespace: "/auction",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
})
export class AuctionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly auctionService: AuctionService
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = client.handshake.auth?.token;

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
      console.log(`Client connected: ${client.userId}`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Client disconnected: ${client.userId}`);
  }

  @SubscribeMessage("join-auction")
  async handleJoinAuction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { auctionId: string }
  ) {
    client.join(`auction:${data.auctionId}`);

    const auction = await this.auctionService.findById(data.auctionId);

    return {
      event: "auction-state",
      data: auction,
    };
  }

  @SubscribeMessage("leave-auction")
  handleLeaveAuction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { auctionId: string }
  ) {
    client.leave(`auction:${data.auctionId}`);
  }

  @SubscribeMessage("place-bid")
  async handleBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      auctionId: string;
      participantId: string;
      teamId: string;
      amount: number;
    }
  ) {
    if (!client.userId) {
      return { error: "Unauthorized" };
    }

    try {
      const bid = await this.auctionService.placeBid({
        ...data,
        bidderId: client.userId,
      });

      // Broadcast to all clients in the auction room
      this.server.to(`auction:${data.auctionId}`).emit("new-bid", {
        participantId: bid.participantId,
        teamId: bid.teamId,
        amount: bid.amount,
        timestamp: new Date().toISOString(),
      });

      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // Emit auction state updates
  emitAuctionUpdate(auctionId: string, event: string, data: any) {
    this.server.to(`auction:${auctionId}`).emit(event, data);
  }
}
