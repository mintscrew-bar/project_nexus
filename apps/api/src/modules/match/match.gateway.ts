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
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e4,
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
    try {
      client.join(`match:${data.matchId}`);

      const match = await this.matchService.findById(data.matchId);

      return {
        success: true,
        match,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || "Failed to join match",
      };
    }
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
    try {
      client.join(`bracket:${data.roomId}`);

      const matches = await this.matchService.getRoomMatches(data.roomId);

      return {
        success: true,
        matches,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || "Failed to join bracket",
      };
    }
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

  async emitMatchResult(matchId: string, data: { winnerId: string }) {
    // Emit to individual match room
    this.server.to(`match:${matchId}`).emit("match-result", data);

    // Also emit to bracket room so bracket view gets real-time updates
    try {
      const match = await this.matchService.findById(matchId);
      if (match?.roomId) {
        this.server.to(`bracket:${match.roomId}`).emit("match-result", {
          matchId,
          winnerId: data.winnerId,
        });
      }
    } catch {
      // Best-effort: bracket view can fallback to REST polling
    }
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

  emitSessionAborted(roomId: string, data: any) {
    this.server.to(`bracket:${roomId}`).emit("session-aborted", data);
  }

  async emitTournamentCompleted(roomId: string) {
    try {
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
    } catch (error) {
      console.error(
        `[Match] Failed to emit tournament-completed for room ${roomId}:`,
        error,
      );
      this.server.to(`bracket:${roomId}`).emit("tournament-completed-error", {
        error: "Failed to calculate tournament standings",
        roomId,
      });
    }
  }
}
