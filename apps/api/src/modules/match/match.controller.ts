import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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
      tournamentCode: result.tournamentCode,
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

    // Get match to find roomId
    const match = await this.matchService.findById(matchId);

    // Emit bracket update
    const matches = await this.matchService.getRoomMatches(match.room.id);
    this.matchGateway.emitBracketUpdate(match.room.id, { matches });

    return result;
  }

  // ========================================
  // Legacy endpoints (kept for backward compatibility)
  // ========================================

  @Get("auction/:auctionId")
  async getByAuction(@Param("auctionId") auctionId: string) {
    return this.matchService.getMatchesByAuction(auctionId);
  }
}
