import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, MatchStatus, BracketType } from "@nexus/database";

export interface BracketMatch {
  id: string;
  round: number;
  matchNumber: number;
  teamAId?: string | undefined; // Optional for TBD bracket slots (undefined = TBD)
  teamBId?: string | undefined; // Optional for TBD bracket slots (undefined = TBD)
  bracketSection?: string; // "WB_R1" | "WB_F" | "LB_R1" | "LB_F" | "GF"
  status: MatchStatus;
  tournamentCode?: string;
  winnerId?: string;
}

export interface Bracket {
  type: BracketType;
  matches: BracketMatch[];
}

@Injectable()
export class MatchBracketService {
  private readonly logger = new Logger(MatchBracketService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate bracket for a room based on team count and bracket format
   */
  async generateBracket(hostId: string, roomId: string): Promise<Bracket> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can generate bracket");
    }

    if (room.status !== RoomStatus.ROLE_SELECTION) {
      // Check if bracket already exists (room might be in IN_PROGRESS)
      const existingMatches = await this.prisma.match.findMany({
        where: { roomId },
        select: { id: true },
      });

      if (existingMatches.length > 0) {
        // Bracket already exists, return existing bracket structure
        this.logger.log(
          `Bracket already exists for room ${roomId}, returning existing matches`,
        );
        const existingBracket = await this.getExistingBracket(roomId);
        return existingBracket;
      }

      throw new BadRequestException(
        `Room status must be ROLE_SELECTION to generate bracket. Current status: ${room.status}`,
      );
    }

    // Check if bracket already exists (prevent duplicate generation)
    const existingMatches = await this.prisma.match.findMany({
      where: { roomId },
      select: { id: true },
    });

    if (existingMatches.length > 0) {
      this.logger.warn(
        `Bracket already exists for room ${roomId} (${existingMatches.length} matches)`,
      );
      const existingBracket = await this.getExistingBracket(roomId);
      return existingBracket;
    }

    const teamCount = room.teams.length;

    // Validate all teams have 5 players
    for (const team of room.teams) {
      if (team.members.length !== 5) {
        throw new BadRequestException(
          `Team ${team.name} does not have 5 players`,
        );
      }
    }

    let bracket: Bracket;
    const isDoubleElim = room.bracketFormat === BracketType.DOUBLE_ELIMINATION;

    switch (teamCount) {
      case 2:
        bracket = this.generateSingleMatch(room.teams);
        break;
      case 3:
      case 5:
      case 6:
      case 7:
        bracket = this.generateRoundRobin(room.teams);
        break;
      case 4:
        bracket = isDoubleElim
          ? this.generateDoubleElimination4(room.teams)
          : this.generateSingleElimination(room.teams);
        break;
      case 8:
        bracket = isDoubleElim
          ? this.generateDoubleElimination8(room.teams)
          : this.generatePowerOf2Elimination(room.teams);
        break;
      default:
        throw new BadRequestException(
          `Unsupported team count: ${teamCount}. Supported: 2, 3, 4, 5, 6, 7, 8`,
        );
    }

    // Create matches in database with transaction for atomicity
    await this.prisma.$transaction(async (tx) => {
      // Create all matches
      await Promise.all(
        bracket.matches.map((match) =>
          tx.match.create({
            data: {
              roomId,
              round: match.round,
              matchNumber: match.matchNumber,
              teamAId: match.teamAId || null,
              teamBId: match.teamBId || null,
              status: MatchStatus.PENDING,
              bracketType: bracket.type,
              bracketRound: match.bracketSection || null,
            },
          }),
        ),
      );

      // Update room status atomically
      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.IN_PROGRESS },
      });
    });

    this.logger.log(
      `Generated ${bracket.type} bracket for room ${roomId} with ${bracket.matches.length} matches`,
    );

    return bracket;
  }

  /**
   * Get existing bracket structure from database
   */
  private async getExistingBracket(roomId: string): Promise<Bracket> {
    const matches = await this.prisma.match.findMany({
      where: { roomId },
      select: {
        id: true,
        round: true,
        matchNumber: true,
        teamAId: true,
        teamBId: true,
        bracketRound: true,
        status: true,
        bracketType: true,
      },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
    });

    if (matches.length === 0) {
      throw new NotFoundException("No matches found for room");
    }

    const bracketType = matches[0].bracketType || BracketType.SINGLE;

    return {
      type: bracketType,
      matches: matches.map((m) => ({
        id: m.id,
        round: m.round || 1,
        matchNumber: m.matchNumber || 1,
        teamAId: m.teamAId || undefined,
        teamBId: m.teamBId || undefined,
        bracketSection: m.bracketRound || undefined,
        status: m.status,
      })),
    };
  }

  // ========================================
  // Bracket Type Generators
  // ========================================

  /**
   * 10-player (2 teams): Single match
   */
  private generateSingleMatch(teams: any[]): Bracket {
    return {
      type: BracketType.SINGLE,
      matches: [
        {
          id: this.generateMatchId(),
          round: 1,
          matchNumber: 1,
          teamAId: teams[0].id,
          teamBId: teams[1].id,
          status: MatchStatus.PENDING,
        },
      ],
    };
  }

  /**
   * 15-player (3 teams): Round Robin (리그전)
   * Each team plays every other team once
   */
  private generateRoundRobin(teams: any[]): Bracket {
    const matches: BracketMatch[] = [];
    let matchNumber = 1;

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          id: this.generateMatchId(),
          round: 1,
          matchNumber: matchNumber++,
          teamAId: teams[i].id,
          teamBId: teams[j].id,
          status: MatchStatus.PENDING,
        });
      }
    }

    return {
      type: BracketType.ROUND_ROBIN,
      matches,
    };
  }

  /**
   * 20-player (4 teams): Single Elimination Tournament
   */
  private generateSingleElimination(teams: any[]): Bracket {
    const matches: BracketMatch[] = [];

    // Semi-finals
    matches.push({
      id: this.generateMatchId(),
      round: 1,
      matchNumber: 1,
      teamAId: teams[0].id,
      teamBId: teams[1].id,
      status: MatchStatus.PENDING,
    });

    matches.push({
      id: this.generateMatchId(),
      round: 1,
      matchNumber: 2,
      teamAId: teams[2].id,
      teamBId: teams[3].id,
      status: MatchStatus.PENDING,
    });

    // Finals - will be populated after semi-finals complete
    matches.push({
      id: this.generateMatchId(),
      round: 2,
      matchNumber: 3,
      teamAId: undefined, // TBD - will be populated after semi-finals
      teamBId: undefined, // TBD - will be populated after semi-finals
      status: MatchStatus.PENDING,
    });

    return {
      type: BracketType.SINGLE_ELIMINATION,
      matches,
    };
  }

  /**
   * N-team (N = power of 2, e.g. 8) Single Elimination
   */
  private generatePowerOf2Elimination(teams: any[]): Bracket {
    const n = teams.length;
    const totalRounds = Math.log2(n);
    const matches: BracketMatch[] = [];
    let matchNumber = 1;

    // Round 1: n/2 actual matches
    for (let i = 0; i < n / 2; i++) {
      matches.push({
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        teamAId: teams[i * 2].id,
        teamBId: teams[i * 2 + 1].id,
        status: MatchStatus.PENDING,
      });
    }

    // Rounds 2..totalRounds: TBD slots
    for (let round = 2; round <= totalRounds; round++) {
      const matchesInRound = n / Math.pow(2, round);
      for (let i = 0; i < matchesInRound; i++) {
        matches.push({
          id: this.generateMatchId(),
          round,
          matchNumber: matchNumber++,
          teamAId: undefined, // TBD - will be populated from previous round
          teamBId: undefined, // TBD - will be populated from previous round
          status: MatchStatus.PENDING,
        });
      }
    }

    return {
      type: BracketType.SINGLE_ELIMINATION,
      matches,
    };
  }

  /**
   * 4-team Double Elimination
   */
  private generateDoubleElimination4(teams: any[]): Bracket {
    let matchNumber = 1;
    const matches: BracketMatch[] = [
      // WB Round 1
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        teamAId: teams[0].id,
        teamBId: teams[1].id,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        teamAId: teams[2].id,
        teamBId: teams[3].id,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      // WB Final (TBD)
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "WB_F",
      },
      // LB Round 1 (TBD - losers from WB R1)
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R1",
      },
      // LB Final (TBD)
      {
        id: this.generateMatchId(),
        round: 3,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_F",
      },
      // Grand Final (TBD)
      {
        id: this.generateMatchId(),
        round: 4,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "GF",
      },
    ];
    return { type: BracketType.DOUBLE_ELIMINATION, matches };
  }

  /**
   * 8-team Double Elimination
   */
  private generateDoubleElimination8(teams: any[]): Bracket {
    let matchNumber = 1;
    const matches: BracketMatch[] = [
      // WB Round 1 (4 matches)
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        teamAId: teams[0].id,
        teamBId: teams[1].id,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        teamAId: teams[2].id,
        teamBId: teams[3].id,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        teamAId: teams[4].id,
        teamBId: teams[5].id,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 1,
        matchNumber: matchNumber++,
        teamAId: teams[6].id,
        teamBId: teams[7].id,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R1",
      },
      // WB Semi (2 TBD)
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R2",
      },
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "WB_R2",
      },
      // WB Final (1 TBD)
      {
        id: this.generateMatchId(),
        round: 3,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "WB_F",
      },
      // LB Round 1 (2 TBD - WB R1 losers)
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R1",
      },
      {
        id: this.generateMatchId(),
        round: 2,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R1",
      },
      // LB Round 2 (2 TBD - LB R1 winners vs WB Semi losers)
      {
        id: this.generateMatchId(),
        round: 3,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R2",
      },
      {
        id: this.generateMatchId(),
        round: 3,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_R2",
      },
      // LB Semi (1 TBD)
      {
        id: this.generateMatchId(),
        round: 4,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_SEMI",
      },
      // LB Final (1 TBD)
      {
        id: this.generateMatchId(),
        round: 5,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "LB_F",
      },
      // Grand Final
      {
        id: this.generateMatchId(),
        round: 6,
        matchNumber: matchNumber++,
        status: MatchStatus.PENDING,
        bracketSection: "GF",
      },
    ];
    return { type: BracketType.DOUBLE_ELIMINATION, matches };
  }

  /**
   * Generate a temporary match ID for bracket structure
   * Note: Actual match ID is generated by Prisma (cuid) when saved to database
   */
  private generateMatchId(): string {
    // Use timestamp + random for uniqueness in bracket structure
    // This is only used temporarily before DB save
    return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
