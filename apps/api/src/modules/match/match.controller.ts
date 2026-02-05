import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { MatchService } from "./match.service";
import { MatchGateway } from "./match.gateway";

@Controller("matches")
@UseGuards(JwtAuthGuard)
export class MatchController {
  constructor(
    private readonly matchService: MatchService,
    private readonly matchGateway: MatchGateway,
  ) {}

  // ========================================
  // User Matches
  // ========================================

  @Get("my")
  async getUserMatches(
    @CurrentUser("sub") userId: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.matchService.getUserMatches(userId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  // ========================================
  // Bracket Management
  // ========================================

  @Post("bracket/:roomId")
  @HttpCode(HttpStatus.CREATED)
  async generateBracket(
    @CurrentUser("sub") userId: string,
    @Param("roomId") roomId: string,
  ) {
    const bracket = await this.matchService.generateBracket(userId, roomId);

    // Emit bracket generation to all clients watching the room
    this.matchGateway.emitBracketGenerated(roomId, { bracket });

    return bracket;
  }

  @Get("bracket/:roomId")
  async getRoomMatches(@Param("roomId") roomId: string) {
    return this.matchService.getRoomMatches(roomId);
  }

  // ========================================
  // Match Management
  // ========================================

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.matchService.findById(id);
  }

  @Post(":id/tournament-code")
  @HttpCode(HttpStatus.OK)
  async generateTournamentCode(
    @CurrentUser("sub") userId: string,
    @Param("id") matchId: string,
  ) {
    const code = await this.matchService.generateTournamentCode(
      userId,
      matchId,
    );

    // Emit tournament code to all clients watching the match
    this.matchGateway.emitTournamentCodeGenerated(matchId, { code });

    return { tournamentCode: code };
  }

  @Post(":id/start")
  @HttpCode(HttpStatus.OK)
  async startMatch(
    @CurrentUser("sub") userId: string,
    @Param("id") matchId: string,
  ) {
    const result = await this.matchService.startMatch(userId, matchId);

    // Emit match start to all clients watching the match
    this.matchGateway.emitMatchStarted(matchId, {
      tournamentCode: result.tournamentCode ?? undefined,
    });

    return result;
  }

  @Post(":id/result")
  @HttpCode(HttpStatus.OK)
  async reportResult(
    @CurrentUser("sub") userId: string,
    @Param("id") matchId: string,
    @Body() body: { winnerId: string },
  ) {
    const result = await this.matchService.reportMatchResult(
      userId,
      matchId,
      body.winnerId,
    );

    // Emit match result to all clients
    this.matchGateway.emitMatchResult(matchId, { winnerId: body.winnerId });

    // If tournament is completed, emit tournament completion event
    if (result.tournamentCompleted) {
      const match = await this.matchService.findById(matchId);
      if (match?.roomId) {
        await this.matchGateway.emitTournamentCompleted(match.roomId);
      }
    }

    return result;
  }

  // ========================================
  // Match Details & Stats
  // ========================================

  @Get(":id/details")
  async getMatchDetails(@Param("id") matchId: string) {
    return this.matchService.getMatchDetails(matchId);
  }

  @Get(":id/participants")
  async getMatchParticipants(@Param("id") matchId: string) {
    return this.matchService.getMatchParticipants(matchId);
  }

  // ========================================
  // Live Match Status
  // ========================================

  @Get(":id/live-status")
  async getLiveMatchStatus(@Param("id") matchId: string) {
    return this.matchService.getLiveMatchStatus(matchId);
  }

  // ========================================
  // User Match History
  // ========================================

  @Get("user/:userId/history")
  async getUserMatchHistory(
    @Param("userId") userId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.matchService.getUserMatchHistory(
      userId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // ========================================
  // Legacy endpoints (kept for backward compatibility)
  // ========================================

  @Get("room/:roomId/matches")
  async getByRoom(@Param("roomId") roomId: string) {
    return this.matchService.getMatchesByRoom(roomId);
  }
}
