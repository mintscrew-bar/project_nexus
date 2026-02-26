import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RiotTournamentService } from "../riot/riot-tournament.service";
import {
  RiotSpectatorService,
  LiveGameStatus,
} from "../riot/riot-spectator.service";
import { MatchDataCollectionService } from "./match-data-collection.service";
import { NotificationService } from "../notification/notification.service";
import { MatchBracketService, Bracket } from "./match-bracket.service";
import { MatchAdvancementService } from "./match-advancement.service";
import { RoomStatus, MatchStatus, BracketType } from "@nexus/database";

// Re-export types for backward compatibility
export type { BracketMatch, Bracket } from "./match-bracket.service";

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);
  private discordBotService: any;
  private discordVoiceService: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly riotTournamentService: RiotTournamentService,
    private readonly riotSpectatorService: RiotSpectatorService,
    @Inject(forwardRef(() => MatchDataCollectionService))
    private readonly matchDataCollectionService: MatchDataCollectionService,
    private readonly notificationService: NotificationService,
    private readonly matchBracketService: MatchBracketService,
    private readonly matchAdvancementService: MatchAdvancementService,
    @Optional() @Inject("DISCORD_BOT_SERVICE") discordBot?: any,
    @Optional() @Inject("DISCORD_VOICE_SERVICE") discordVoice?: any,
  ) {
    this.discordBotService = discordBot;
    this.discordVoiceService = discordVoice;
  }

  // ========================================
  // Bracket Generation (delegated to MatchBracketService)
  // ========================================

  async generateBracket(hostId: string, roomId: string): Promise<Bracket> {
    const bracket = await this.matchBracketService.generateBracket(hostId, roomId);

    // Auto-generate tournament codes for matches with both teams assigned
    await this.autoGenerateCodesForRoom(roomId);

    return bracket;
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
                user: true,
              },
            },
          },
        },
        teamB: {
          include: {
            members: {
              include: {
                user: true,
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

    if (!match.teamA || !match.teamB) {
      throw new BadRequestException("Match teams are not yet assigned (TBD)");
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

    // Send Discord notification
    try {
      if (this.discordBotService) {
        const guildId = this.configService.get("DISCORD_GUILD_ID");
        const channelId = this.configService.get(
          "DISCORD_NOTIFICATION_CHANNEL_ID",
        );

        if (guildId && channelId) {
          const embed = this.discordBotService.buildMatchStartEmbed(
            match.teamA!.name,
            match.teamB!.name,
            tournamentCode,
          );

          await this.discordBotService.sendEmbedNotification(
            guildId,
            channelId,
            embed,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        "Failed to send Discord match start notification:",
        error,
      );
    }

    // Send app notifications to all participants
    try {
      const allParticipants = [
        ...match.teamA.members.map((m) => m.user.id),
        ...match.teamB.members.map((m) => m.user.id),
      ];

      await Promise.all(
        allParticipants.map((userId) =>
          this.notificationService.notifyMatchStarting(
            userId,
            matchId,
            match.room.name,
          ),
        ),
      );
    } catch (error) {
      this.logger.warn("Failed to send match start notifications:", error);
    }

    return tournamentCode;
  }

  /**
   * Auto-generate tournament codes for all matches in a room
   * that have both teams assigned but no tournament code yet.
   */
  private async autoGenerateCodesForRoom(roomId: string): Promise<void> {
    const matches = await this.prisma.match.findMany({
      where: {
        roomId,
        teamAId: { not: null },
        teamBId: { not: null },
        tournamentCode: null,
      },
      select: { id: true },
    });

    for (const match of matches) {
      try {
        let code: string;
        try {
          code = await this.riotTournamentService.createTournamentCode(match.id);
        } catch {
          code = `NEXUS-${match.id.substring(0, 8).toUpperCase()}`;
        }

        await this.prisma.match.update({
          where: { id: match.id },
          data: { tournamentCode: code },
        });

        this.logger.log(`Auto-generated tournament code for match ${match.id}: ${code}`);
      } catch (error) {
        this.logger.warn(`Failed to auto-generate code for match ${match.id}:`, error);
      }
    }
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
      throw new BadRequestException(
        `Match already started or completed. Current status: ${match.status}`,
      );
    }

    // Validate teams are assigned before starting
    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException(
        "Cannot start match: teams are not yet assigned (TBD). Please wait for previous round to complete.",
      );
    }

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    this.logger.log(`Match ${matchId} started by host ${hostId}`);

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
      throw new BadRequestException(
        `Match is not in progress. Current status: ${match.status}`,
      );
    }

    // Validate teams are assigned
    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException(
        "Match teams are not yet assigned (TBD). Cannot report result.",
      );
    }

    if (winnerId !== match.teamAId && winnerId !== match.teamBId) {
      throw new BadRequestException(
        `Invalid winner team. Winner ID ${winnerId} does not match either team A (${match.teamAId}) or team B (${match.teamBId})`,
      );
    }

    // Atomic update: only update if still IN_PROGRESS (prevents race condition)
    const updateResult = await this.prisma.match.updateMany({
      where: { id: matchId, status: MatchStatus.IN_PROGRESS },
      data: {
        status: MatchStatus.COMPLETED,
        winnerId,
        completedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      throw new BadRequestException(
        "Match result was already reported by another request.",
      );
    }

    // Re-fetch match after atomic update to get fresh data
    const updatedMatch = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { room: true, teamA: true, teamB: true },
    });

    if (!updatedMatch) {
      throw new NotFoundException("Match not found after update");
    }

    // Advance winner to next round (delegated to MatchAdvancementService)
    let bracketAdvanced = false;
    if (updatedMatch.bracketType === BracketType.SINGLE_ELIMINATION) {
      if (updatedMatch.round && updatedMatch.matchNumber) {
        bracketAdvanced =
          await this.matchAdvancementService.advanceWinnerToNextRound(
            updatedMatch.roomId,
            updatedMatch.round,
            updatedMatch.matchNumber,
            winnerId,
          );
      } else {
        this.logger.warn(
          `Cannot advance winner: match ${matchId} missing round or matchNumber`,
        );
      }
    } else if (updatedMatch.bracketType === BracketType.DOUBLE_ELIMINATION) {
      const loserId =
        winnerId === updatedMatch.teamAId ? updatedMatch.teamBId : updatedMatch.teamAId;
      if (loserId) {
        await this.matchAdvancementService.advanceDoubleElimination(
          updatedMatch.roomId,
          updatedMatch.id,
          updatedMatch.bracketRound,
          winnerId,
          loserId,
        );
        bracketAdvanced = true;
      } else {
        this.logger.warn(
          `Cannot advance double elimination: match ${matchId} missing loser team ID`,
        );
      }
    }

    // Auto-generate tournament codes for newly-ready matches after advancement
    if (bracketAdvanced) {
      await this.autoGenerateCodesForRoom(updatedMatch.roomId);
    }

    // Send Discord match result notification
    try {
      if (this.discordBotService) {
        const guildId = this.configService.get("DISCORD_GUILD_ID");
        const channelId = this.configService.get(
          "DISCORD_NOTIFICATION_CHANNEL_ID",
        );

        if (guildId && channelId) {
          const winner = winnerId === updatedMatch.teamAId ? updatedMatch.teamA : updatedMatch.teamB;
          const loser = winnerId === updatedMatch.teamAId ? updatedMatch.teamB : updatedMatch.teamA;

          const embed = this.discordBotService.buildMatchResultEmbed(
            winner?.name ?? "TBD",
            loser?.name ?? "TBD",
          );

          await this.discordBotService.sendEmbedNotification(
            guildId,
            channelId,
            embed,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        "Failed to send Discord match result notification:",
        error,
      );
    }

    // Send app notifications to all participants about match result
    try {
      const matchWithMembers = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: {
          room: true,
          teamA: {
            include: {
              members: {
                include: {
                  user: true,
                },
              },
            },
          },
          teamB: {
            include: {
              members: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      if (matchWithMembers) {
        const winnerMembers =
          winnerId === matchWithMembers.teamAId
            ? (matchWithMembers.teamA?.members ?? [])
            : (matchWithMembers.teamB?.members ?? []);
        const loserMembers =
          winnerId === matchWithMembers.teamAId
            ? (matchWithMembers.teamB?.members ?? [])
            : (matchWithMembers.teamA?.members ?? []);

        // Notify winners
        await Promise.all(
          winnerMembers.map((m) =>
            this.notificationService.notifyMatchResult(
              m.user.id,
              matchId,
              true,
              matchWithMembers.room.name,
            ),
          ),
        );

        // Notify losers
        await Promise.all(
          loserMembers.map((m) =>
            this.notificationService.notifyMatchResult(
              m.user.id,
              matchId,
              false,
              matchWithMembers.room.name,
            ),
          ),
        );
      }
    } catch (error) {
      this.logger.warn("Failed to send match result notifications:", error);
    }

    // Check if bracket is complete (delegated to MatchAdvancementService)
    const allComplete =
      await this.matchAdvancementService.checkBracketCompletion(match.roomId);
    let tournamentCompleted = false;

    if (allComplete) {
      const room = await this.prisma.room.findUnique({
        where: { id: match.roomId },
        select: { status: true },
      });

      // Only update if not already completed (avoid multiple updates)
      if (room && room.status !== RoomStatus.COMPLETED) {
        // First update room status
        await this.prisma.room.update({
          where: { id: match.roomId },
          data: {
            status: RoomStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        // Then fetch winner info separately for Discord notification
        const winnerMatch = await this.prisma.match.findFirst({
          where: {
            roomId: match.roomId,
            winnerId: { not: null },
          },
          orderBy: { round: "desc" },
          select: {
            winner: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        const roomData = {
          name:
            (
              await this.prisma.room.findUnique({
                where: { id: match.roomId },
                select: { name: true },
              })
            )?.name || "",
          matches: winnerMatch ? [winnerMatch] : [],
        };

        this.logger.log(`Tournament completed for room ${match.roomId}`);

        // Send Discord tournament completion notification
        try {
          if (this.discordBotService) {
            const guildId = this.configService.get("DISCORD_GUILD_ID");
            const channelId = this.configService.get(
              "DISCORD_NOTIFICATION_CHANNEL_ID",
            );

            if (guildId && channelId && roomData.matches[0]?.winner) {
              const embed =
                this.discordBotService.buildTournamentCompletedEmbed(
                  roomData.name,
                  roomData.matches[0].winner.name,
                );

              await this.discordBotService.sendEmbedNotification(
                guildId,
                channelId,
                embed,
              );
            }
          }
        } catch (error) {
          this.logger.warn(
            "Failed to send Discord tournament completion notification:",
            error,
          );
        }

        tournamentCompleted = true;
      }
    }

    // Start collecting match data in the background (non-blocking)
    this.logger.log(`Scheduling match data collection for match ${matchId}`);
    setImmediate(() => {
      this.matchDataCollectionService
        .collectMatchData(matchId)
        .catch((error) => {
          this.logger.error(
            `Background match data collection failed for ${matchId}:`,
            error,
          );
        });
    });

    return {
      message: "Match result recorded",
      winnerId,
      tournamentCompleted,
      bracketAdvanced,
      roomId: match.roomId,
    };
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
      select: {
        id: true,
        roomId: true,
        round: true,
        matchNumber: true,
        bracketRound: true,
        bracketType: true,
        status: true,
        teamAId: true,
        teamBId: true,
        winnerId: true,
        tournamentCode: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        teamA: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        teamB: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        winner: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
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
  // Match Details (Riot API Data)
  // ========================================

  /**
   * Get match details with participant stats
   */
  async getMatchDetails(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
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
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
          orderBy: {
            teamId: "asc",
          },
        },
        teamStats: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException("Match not found");
    }

    return match;
  }

  /**
   * Get match participants
   */
  async getMatchParticipants(matchId: string) {
    return this.prisma.matchParticipant.findMany({
      where: { matchId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: {
        teamId: "asc",
      },
    });
  }

  /**
   * Get user match history with details
   */
  async getUserMatchHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ) {
    const matches = await this.prisma.matchParticipant.findMany({
      where: { userId },
      include: {
        match: {
          include: {
            teamA: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
            teamB: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
            winner: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: offset,
    });

    return matches.map((participant) => ({
      matchId: participant.matchId,
      match: participant.match,
      participant: {
        championId: participant.championId,
        championName: participant.championName,
        position: participant.position,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        win: participant.win,
        kda:
          participant.deaths === 0
            ? participant.kills + participant.assists
            : (participant.kills + participant.assists) / participant.deaths,
      },
      team: participant.team,
    }));
  }

  // ========================================
  // Live Match Status (Spectator API)
  // ========================================

  /**
   * Get live match status using Riot Spectator-V5 API
   * Checks if any participants are currently in a live game
   */
  async getLiveMatchStatus(matchId: string): Promise<LiveGameStatus> {
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
                      select: {
                        puuid: true,
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
                  include: {
                    riotAccounts: {
                      where: { isPrimary: true },
                      select: {
                        puuid: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException("Match not found");
    }

    // Only check for live games if match is in progress
    if (match.status !== MatchStatus.IN_PROGRESS) {
      return { isLive: false };
    }

    // Collect all participant PUUIDs
    const puuids: string[] = [];

    for (const member of match.teamA?.members ?? []) {
      const puuid = member.user.riotAccounts[0]?.puuid;
      if (puuid) {
        puuids.push(puuid);
      }
    }

    for (const member of match.teamB?.members ?? []) {
      const puuid = member.user.riotAccounts[0]?.puuid;
      if (puuid) {
        puuids.push(puuid);
      }
    }

    if (puuids.length === 0) {
      this.logger.warn(`No PUUIDs found for match ${matchId} participants`);
      return { isLive: false };
    }

    // Check if any participant is in an active game
    try {
      const liveStatus =
        await this.riotSpectatorService.findActiveGameByPUUIDs(puuids);
      return liveStatus;
    } catch (error) {
      this.logger.error(
        `Error checking live match status for ${matchId}:`,
        error,
      );
      return { isLive: false };
    }
  }
}
