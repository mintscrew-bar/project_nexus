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
import { MatchService } from "./match.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  namespace: "/match",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
})
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly matchService: MatchService,
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
      console.log(`Match client connected: ${client.username}`);
    } catch (_error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Match client disconnected: ${client.username}`);
  }

  @SubscribeMessage("join-match")
  async handleJoinMatch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string },
  ) {
    client.join(`match:${data.matchId}`);

    const match = await this.matchService.findById(data.matchId);

    return {
      success: true,
      match,
    };
  }

  @SubscribeMessage("leave-match")
  handleLeaveMatch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string },
  ) {
    client.leave(`match:${data.matchId}`);
  }

  @SubscribeMessage("join-bracket")
  async handleJoinBracket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.join(`bracket:${data.roomId}`);

    const matches = await this.matchService.getRoomMatches(data.roomId);

    return {
      success: true,
      matches,
    };
  }

  @SubscribeMessage("leave-bracket")
  handleLeaveBracket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`bracket:${data.roomId}`);
  }

  // ========================================
  // Emit Events (called from service or controller)
  // ========================================

  emitMatchStarted(matchId: string, data: { tournamentCode?: string }) {
    this.server.to(`match:${matchId}`).emit("match-started", data);
  }

  emitMatchResult(matchId: string, data: { winnerId: string }) {
    this.server.to(`match:${matchId}`).emit("match-result", data);
  }

  emitBracketGenerated(roomId: string, data: { bracket: any }) {
    this.server.to(`bracket:${roomId}`).emit("bracket-generated", data);
  }

  emitBracketUpdate(roomId: string, data: { matches: any[] }) {
    this.server.to(`bracket:${roomId}`).emit("bracket-updated", data);
  }

  emitBracketComplete(roomId: string) {
    this.server.to(`bracket:${roomId}`).emit("bracket-complete");
  }

  emitTournamentCodeGenerated(matchId: string, data: { code: string }) {
    this.server.to(`match:${matchId}`).emit("tournament-code-generated", data);
  }

  async emitTournamentCompleted(roomId: string) {
    // Get final standings
    const matches = await this.matchService.getRoomMatches(roomId);

    // Calculate final standings (teams ranked by wins)
    const teamStats = new Map<
      string,
      { teamId: string; teamName: string; wins: number; losses: number }
    >();

    for (const match of matches) {
      // Type assertion: getRoomMatches includes teamA and teamB relations
      const matchWithTeams = match as typeof match & {
        teamA: { id: string; name: string } | null;
        teamB: { id: string; name: string } | null;
      };

      if (!matchWithTeams.teamA || !matchWithTeams.teamB) continue; // Skip TBD matches
      const teamAId = matchWithTeams.teamA.id;
      const teamBId = matchWithTeams.teamB.id;
      const teamAName = matchWithTeams.teamA.name;
      const teamBName = matchWithTeams.teamB.name;

      if (!teamStats.has(teamAId)) {
        teamStats.set(teamAId, {
          teamId: teamAId,
          teamName: teamAName,
          wins: 0,
          losses: 0,
        });
      }
      if (!teamStats.has(teamBId)) {
        teamStats.set(teamBId, {
          teamId: teamBId,
          teamName: teamBName,
          wins: 0,
          losses: 0,
        });
      }

      if (match.winnerId === teamAId) {
        teamStats.get(teamAId)!.wins++;
        teamStats.get(teamBId)!.losses++;
      } else if (match.winnerId === teamBId) {
        teamStats.get(teamBId)!.wins++;
        teamStats.get(teamAId)!.losses++;
      }
    }

    // Sort by wins (descending)
    const standings = Array.from(teamStats.values()).sort(
      (a, b) => b.wins - a.wins,
    );

    // Emit to all clients watching the bracket
    this.server.to(`bracket:${roomId}`).emit("tournament-completed", {
      standings,
      completedAt: new Date(),
    });
  }
}
