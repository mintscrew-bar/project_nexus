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
import {
  UserMatchesQueryDto,
  MatchHistoryQueryDto,
} from "./dto/match-query.dto";
import { VoteType } from "@nexus/database";

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
    @Query() query: UserMatchesQueryDto,
  ) {
    return this.matchService.getUserMatches(userId, {
      status: query.status,
      limit: query.limit,
      offset: query.offset,
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

    // If bracket advanced (e.g. semi-final → finals), emit updated bracket
    if (result.bracketAdvanced && result.roomId) {
      const updatedMatches = await this.matchService.getRoomMatches(
        result.roomId,
      );
      this.matchGateway.emitBracketUpdate(result.roomId, {
        matches: updatedMatches,
      });
    }

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
  // MVP / ACE 투표
  // ========================================

  @Post(":id/vote")
  @HttpCode(HttpStatus.OK)
  async submitVote(
    @CurrentUser("sub") userId: string,
    @Param("id") matchId: string,
    @Body() body: { votedForId: string; voteType: VoteType },
  ) {
    return this.matchService.submitVote(
      userId,
      matchId,
      body.votedForId,
      body.voteType,
    );
  }

  @Get(":id/votes")
  async getMatchVotes(
    @CurrentUser("sub") userId: string,
    @Param("id") matchId: string,
  ) {
    return this.matchService.getMatchVotes(matchId, userId);
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
    @Query() query: MatchHistoryQueryDto,
  ) {
    return this.matchService.getUserMatchHistory(
      userId,
      query.limit ?? 20,
      query.offset ?? 0,
    );
  }
}
