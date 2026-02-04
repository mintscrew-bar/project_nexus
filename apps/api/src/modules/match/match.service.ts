import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RiotTournamentService } from "../riot/riot-tournament.service";
import { RoomStatus, MatchStatus, BracketType } from "@nexus/database";

export interface BracketMatch {
  id: string;
  round: number;
  matchNumber: number;
  teamAId: string;
  teamBId: string;
  status: MatchStatus;
  tournamentCode?: string;
  winnerId?: string;
}

export interface Bracket {
  type: BracketType;
  matches: BracketMatch[];
}

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riotTournamentService: RiotTournamentService,
  ) {}

  // ========================================
  // Bracket Generation
  // ========================================

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

    if (room.status !== RoomStatus.TEAM_SELECTION) {
      throw new BadRequestException("Teams must be finalized first");
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

    switch (teamCount) {
      case 2:
        bracket = this.generateSingleMatch(room.teams);
        break;
      case 3:
        bracket = this.generateRoundRobin(room.teams);
        break;
      case 4:
        bracket = this.generateSingleElimination(room.teams);
        break;
      default:
        throw new BadRequestException("Invalid team count for bracket");
    }

    // Create matches in database
    await Promise.all(
      bracket.matches.map((match) =>
        this.prisma.match.create({
          data: {
            roomId,
            round: match.round,
            matchNumber: match.matchNumber,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
            status: MatchStatus.PENDING,
            bracketType: bracket.type,
          },
        }),
      ),
    );

    // Update room status
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.IN_PROGRESS },
    });

    return bracket;
  }

  // ========================================
  // Bracket Types
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
   * Match 1: Team A vs Team B
   * Match 2: Team B vs Team C
   * Match 3: Team A vs Team C
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
   * Semi-finals (Round 1):
   *   Match 1: Team 1 vs Team 2
   *   Match 2: Team 3 vs Team 4
   * Finals (Round 2):
   *   Match 3: Winner of Match 1 vs Winner of Match 2
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
      teamAId: "", // TBD
      teamBId: "", // TBD
      status: MatchStatus.PENDING,
    });

    return {
      type: BracketType.SINGLE_ELIMINATION,
      matches,
    };
  }

  // ========================================
  // Riot Tournament Code Integration
  // ========================================

  async generateTournamentCode(
    hostId: string,
    matchId: string,
  ): Promise<string> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    riotAccounts: {
                      where: { isPrimary: true },
                    },
                  },
                },
              },
            },
          },
        },
        teamB: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    riotAccounts: {
                      where: { isPrimary: true },
                    },
                  },
                },
              },
            },
          },
        },
        room: true,
      },
    });

    if (!match) {
      throw new NotFoundException("Match not found");
    }

    if (match.room.hostId !== hostId) {
      throw new ForbiddenException("Only host can generate tournament code");
    }

    if (match.tournamentCode) {
      return match.tournamentCode;
    }

    // Get all participant PUUIDs
    const teamAPuuids = match.teamA.members.map(
      (m) => m.user.riotAccounts[0]?.puuid,
    );
    const teamBPuuids = match.teamB.members.map(
      (m) => m.user.riotAccounts[0]?.puuid,
    );

    if (teamAPuuids.some((p) => !p) || teamBPuuids.some((p) => !p)) {
      throw new BadRequestException(
        "All players must have linked Riot accounts",
      );
    }

    let tournamentCode: string;

    try {
      // Call Riot Tournament API to generate code
      tournamentCode =
        await this.riotTournamentService.createTournamentCode(matchId);
      this.logger.log(
        `Generated Riot tournament code for match ${matchId}: ${tournamentCode}`,
      );
    } catch (error: any) {
      // Fallback to placeholder code if Riot API is not configured or fails
      this.logger.warn(
        `Failed to generate Riot tournament code, using placeholder: ${error.message}`,
      );
      tournamentCode = `NEXUS-${match.id.substring(0, 8).toUpperCase()}`;
    }

    // Update match with tournament code
    await this.prisma.match.update({
      where: { id: matchId },
      data: { tournamentCode },
    });

    return tournamentCode;
  }

  // ========================================
  // Match Management
  // ========================================

  async startMatch(hostId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { room: true },
    });

    if (!match) {
      throw new NotFoundException("Match not found");
    }

    if (match.room.hostId !== hostId) {
      throw new ForbiddenException("Only host can start match");
    }

    if (match.status !== MatchStatus.PENDING) {
      throw new BadRequestException("Match already started or completed");
    }

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    return { message: "Match started", tournamentCode: match.tournamentCode };
  }

  async reportMatchResult(hostId: string, matchId: string, winnerId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        room: true,
        teamA: true,
        teamB: true,
      },
    });

    if (!match) {
      throw new NotFoundException("Match not found");
    }

    if (match.room.hostId !== hostId) {
      throw new ForbiddenException("Only host can report match result");
    }

    if (match.status !== MatchStatus.IN_PROGRESS) {
      throw new BadRequestException("Match is not in progress");
    }

    if (winnerId !== match.teamAId && winnerId !== match.teamBId) {
      throw new BadRequestException("Invalid winner team");
    }

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.COMPLETED,
        winnerId,
        completedAt: new Date(),
      },
    });

    // Check if bracket is complete
    await this.checkBracketCompletion(match.roomId);

    return { message: "Match result recorded", winnerId };
  }

  private async checkBracketCompletion(roomId: string) {
    const matches = await this.prisma.match.findMany({
      where: { roomId },
    });

    const allComplete = matches.every(
      (m) => m.status === MatchStatus.COMPLETED,
    );

    if (allComplete) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.COMPLETED },
      });
    }
  }

  // ========================================
  // Query Methods
  // ========================================

  async findById(id: string) {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        teamA: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                    riotAccounts: {
                      where: { isPrimary: true },
                      select: {
                        gameName: true,
                        tagLine: true,
                        tier: true,
                        rank: true,
                        mainRole: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        teamB: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                    riotAccounts: {
                      where: { isPrimary: true },
                      select: {
                        gameName: true,
                        tagLine: true,
                        tier: true,
                        rank: true,
                        mainRole: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        winner: true,
      },
    });

    if (!match) {
      throw new NotFoundException("Match not found");
    }

    return match;
  }

  async getRoomMatches(roomId: string) {
    return this.prisma.match.findMany({
      where: { roomId },
      include: {
        teamA: true,
        teamB: true,
        winner: true,
      },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
    });
  }

  async getUserMatches(
    userId: string,
    params?: { status?: string; limit?: number; offset?: number },
  ) {
    const { status, limit = 20, offset = 0 } = params || {};

    const where: any = {
      OR: [
        { teamA: { members: { some: { userId } } } },
        { teamB: { members: { some: { userId } } } },
      ],
    };

    if (status && status !== "ALL") {
      where.status = status;
    }

    const matches = await this.prisma.match.findMany({
      where,
      include: {
        teamA: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        },
        teamB: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        },
        winner: true,
        room: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    return matches;
  }

  // ========================================
  // Legacy Methods (kept for backward compatibility)
  // ========================================

  async create(data: {
    roomId: string;
    teamAId: string;
    teamBId: string;
    tournamentCode?: string;
  }) {
    return this.prisma.match.create({
      data: {
        roomId: data.roomId,
        teamAId: data.teamAId,
        teamBId: data.teamBId,
        tournamentCode: data.tournamentCode,
        status: "PENDING",
      },
    });
  }

  async updateResult(
    matchId: string,
    data: {
      winnerId: string;
      riotMatchId?: string;
    },
  ) {
    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        winnerId: data.winnerId,
        riotMatchId: data.riotMatchId,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
  }

  async getMatchesByRoom(roomId: string) {
    return this.prisma.match.findMany({
      where: { roomId },
      include: {
        teamA: true,
        teamB: true,
        winner: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  // ========================================
  // Utility
  // ========================================

  private generateMatchId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
