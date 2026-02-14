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
    return this.matchBracketService.generateBracket(hostId, roomId);
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

    if (!match.teamA || !match.teamB) {
      throw new BadRequestException("Match teams are not yet assigned (TBD)");
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

    await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: MatchStatus.COMPLETED,
        winnerId,
        completedAt: new Date(),
      },
    });

    // Advance winner to next round (delegated to MatchAdvancementService)
    let bracketAdvanced = false;
    if (match.bracketType === BracketType.SINGLE_ELIMINATION) {
      if (match.round && match.matchNumber) {
        bracketAdvanced =
          await this.matchAdvancementService.advanceWinnerToNextRound(
            match.roomId,
            match.round,
            match.matchNumber,
            winnerId,
          );
      } else {
        this.logger.warn(
          `Cannot advance winner: match ${matchId} missing round or matchNumber`,
        );
      }
    } else if (match.bracketType === BracketType.DOUBLE_ELIMINATION) {
      const loserId =
        winnerId === match.teamAId ? match.teamBId : match.teamAId;
      if (loserId) {
        await this.matchAdvancementService.advanceDoubleElimination(
          match.roomId,
          match.id,
          match.bracketRound,
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

    // Send Discord match result notification
    try {
      if (this.discordBotService) {
        const guildId = this.configService.get("DISCORD_GUILD_ID");
        const channelId = this.configService.get(
          "DISCORD_NOTIFICATION_CHANNEL_ID",
        );

        if (guildId && channelId) {
          const winner = winnerId === match.teamAId ? match.teamA : match.teamB;
          const loser = winnerId === match.teamAId ? match.teamB : match.teamA;

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

  private async advanceWinnerToNextRound(
    roomId: string,
    currentRound: number,
    currentMatchNumber: number,
    winnerId: string,
  ): Promise<boolean> {
    const nextRound = currentRound + 1;

    const nextRoundMatches = await this.prisma.match.findMany({
      where: { roomId, round: nextRound },
      select: {
        id: true,
        matchNumber: true,
        teamAId: true,
        teamBId: true,
      },
      orderBy: { matchNumber: "asc" },
    });

    if (nextRoundMatches.length === 0) return false; // Already the final round

    // Determine position among current round matches to know which slot to fill
    const currentRoundMatches = await this.prisma.match.findMany({
      where: { roomId, round: currentRound },
      select: {
        id: true,
        matchNumber: true,
      },
      orderBy: { matchNumber: "asc" },
    });

    const currentMatchIndex = currentRoundMatches.findIndex(
      (m) => m.matchNumber === currentMatchNumber,
    );

    if (currentMatchIndex === -1) return false;

    // Every 2 current-round matches map to 1 next-round match
    const nextMatchIndex = Math.floor(currentMatchIndex / 2);
    const nextMatch = nextRoundMatches[nextMatchIndex];

    if (!nextMatch) return false;

    // Even index → teamA slot, odd index → teamB slot
    const isTeamA = currentMatchIndex % 2 === 0;

    try {
      await this.prisma.match.update({
        where: { id: nextMatch.id },
        data: isTeamA ? { teamAId: winnerId } : { teamBId: winnerId },
      });

      this.logger.log(
        `Advanced winner ${winnerId} to round ${nextRound} match ${nextMatch.id} (matchNumber: ${nextMatch.matchNumber}) as team${isTeamA ? "A" : "B"}`,
      );

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to advance winner ${winnerId} to next round:`,
        error,
      );
      return false;
    }
  }

  /**
   * Routes winner and loser to correct next matches in a Double Elimination bracket.
   * Uses bracketRound (bracketSection) field to determine routing.
   */
  private async advanceDoubleElimination(
    roomId: string,
    matchId: string,
    bracketSection: string | null,
    winnerId: string,
    loserId: string,
  ): Promise<void> {
    if (!bracketSection) {
      this.logger.warn(
        `Cannot advance double elimination: match ${matchId} has no bracketSection`,
      );
      return;
    }

    const findMatch = async (section: string) => {
      const match = await this.prisma.match.findFirst({
        where: { roomId, bracketRound: section },
        select: {
          id: true,
          bracketRound: true,
          matchNumber: true,
        },
      });
      if (!match) {
        this.logger.warn(
          `Match not found for bracket section ${section} in room ${roomId}`,
        );
      }
      return match;
    };

    const setTeam = async (
      targetMatchId: string,
      isTeamA: boolean,
      teamId: string,
    ) => {
      try {
        await this.prisma.match.update({
          where: { id: targetMatchId },
          data: isTeamA ? { teamAId: teamId } : { teamBId: teamId },
        });
        this.logger.log(
          `Set team ${teamId} as team${isTeamA ? "A" : "B"} in match ${targetMatchId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to set team ${teamId} in match ${targetMatchId}:`,
          error,
        );
        throw error;
      }
    };

    // Helper to get index among sibling matches (same bracketSection, ordered by matchNumber)
    const getIndexAmongSiblings = async (section: string): Promise<number> => {
      const siblings = await this.prisma.match.findMany({
        where: { roomId, bracketRound: section },
        select: {
          id: true,
          matchNumber: true,
        },
        orderBy: { matchNumber: "asc" },
      });
      return siblings.findIndex((m) => m.id === matchId);
    };

    switch (bracketSection) {
      case "WB_R1": {
        // 4-team: Winner → WB_F, Loser → LB_R1
        // 8-team: Winner → WB_R2, Loser → LB_R1
        const idx = await getIndexAmongSiblings("WB_R1");
        const wbNext = (await findMatch("WB_R2")) ?? (await findMatch("WB_F"));
        if (wbNext && wbNext.bracketRound) {
          // Find the correct WB_R2/WB_F match for this winner
          const wbNextMatches = await this.prisma.match.findMany({
            where: { roomId, bracketRound: wbNext.bracketRound },
            select: {
              id: true,
              matchNumber: true,
            },
            orderBy: { matchNumber: "asc" },
          });
          const targetWb = wbNextMatches[Math.floor(idx / 2)];
          if (targetWb) {
            await setTeam(targetWb.id, idx % 2 === 0, winnerId);
          } else {
            this.logger.warn(
              `Target WB match not found for WB_R1 match ${matchId} at index ${idx}`,
            );
          }
        }
        // Loser → LB_R1 (same index or cross-bracket slot)
        const lbR1Matches = await this.prisma.match.findMany({
          where: { roomId, bracketRound: "LB_R1" },
          select: {
            id: true,
            matchNumber: true,
            teamAId: true,
            teamBId: true,
          },
          orderBy: { matchNumber: "asc" },
        });
        // 4-team: 2 WB_R1 losers go into 1 LB_R1 match (idx 0→teamA, idx 1→teamB)
        // 8-team: 4 WB_R1 losers go into 2 LB_R1 matches (cross-bracket)
        if (lbR1Matches.length === 1) {
          await setTeam(lbR1Matches[0].id, idx === 0, loserId);
        } else if (lbR1Matches.length > 1) {
          // Cross-bracket: 0↔3, 1↔2 → idx 0 & 3 → match 0, idx 1 & 2 → match 1
          const lbMatchIdx = idx < 2 ? idx : 3 - idx;
          const isTeamA = idx < 2;
          await setTeam(lbR1Matches[lbMatchIdx].id, isTeamA, loserId);
        }
        break;
      }

      case "WB_R2": {
        // 8-team: Winner → WB_F, Loser → LB_R2
        const idx = await getIndexAmongSiblings("WB_R2");
        const wbFinal = await findMatch("WB_F");
        if (wbFinal) await setTeam(wbFinal.id, idx === 0, winnerId);
        // Loser → LB_R2 (drop down)
        const lbR2Matches = await this.prisma.match.findMany({
          where: { roomId, bracketRound: "LB_R2" },
          select: {
            id: true,
            matchNumber: true,
            teamAId: true,
            teamBId: true,
          },
          orderBy: { matchNumber: "asc" },
        });
        if (lbR2Matches[idx])
          await setTeam(lbR2Matches[idx].id, false, loserId); // teamB slot
        break;
      }

      case "WB_F": {
        // Winner → GF (teamA), Loser → LB_F
        const gf = await findMatch("GF");
        if (gf) await setTeam(gf.id, true, winnerId);
        const lbFinal = await findMatch("LB_F");
        if (lbFinal) await setTeam(lbFinal.id, false, loserId); // teamB slot
        break;
      }

      case "LB_R1": {
        // 4-team: Winner → LB_F (teamA), Loser → eliminated
        // 8-team: Winner → LB_R2 (teamA), Loser → eliminated
        const lbNext = (await findMatch("LB_R2")) ?? (await findMatch("LB_F"));
        if (lbNext && lbNext.bracketRound) {
          const idx = await getIndexAmongSiblings("LB_R1");
          const lbNextMatches = await this.prisma.match.findMany({
            where: { roomId, bracketRound: lbNext.bracketRound },
            select: {
              id: true,
              matchNumber: true,
            },
            orderBy: { matchNumber: "asc" },
          });
          const target = lbNextMatches[Math.floor(idx / 2)] ?? lbNextMatches[0];
          if (target) {
            await setTeam(target.id, true, winnerId);
          } else {
            this.logger.warn(
              `Target LB match not found for LB_R1 match ${matchId} at index ${idx}`,
            );
          }
        }
        break;
      }

      case "LB_R2": {
        // 8-team: Winner → LB_SEMI (teamA), Loser → eliminated
        const lbSemi = await findMatch("LB_SEMI");
        if (lbSemi) {
          const idx = await getIndexAmongSiblings("LB_R2");
          await setTeam(lbSemi.id, idx === 0, winnerId);
        }
        break;
      }

      case "LB_SEMI": {
        // 8-team: Winner → LB_F (teamA), Loser → eliminated
        const lbFinal = await findMatch("LB_F");
        if (lbFinal) await setTeam(lbFinal.id, true, winnerId);
        break;
      }

      case "LB_F": {
        // Winner → GF (teamB), Loser → eliminated
        const gf = await findMatch("GF");
        if (gf) await setTeam(gf.id, false, winnerId);
        break;
      }

      case "GF":
        // Tournament over — handled by checkBracketCompletion
        this.logger.log(
          `Grand Final completed. Tournament winner: ${winnerId}`,
        );
        break;

      default:
        this.logger.warn(
          `Unknown bracketSection: ${bracketSection} for match ${matchId}. Cannot route teams.`,
        );
        throw new BadRequestException(
          `Unknown bracket section: ${bracketSection}. Cannot advance teams.`,
        );
    }

    this.logger.log(
      `[DE] Successfully routed winner=${winnerId} loser=${loserId} from section=${bracketSection} in match ${matchId}`,
    );
  }

  private async checkBracketCompletion(roomId: string): Promise<boolean> {
    // Only fetch status field for performance
    const matches = await this.prisma.match.findMany({
      where: { roomId },
      select: {
        id: true,
        status: true,
      },
    });

    const allComplete = matches.every(
      (m) => m.status === MatchStatus.COMPLETED,
    );

    if (allComplete) {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: { status: true },
      });

      // Only update if not already completed (avoid multiple updates)
      if (room && room.status !== RoomStatus.COMPLETED) {
        // First update room status
        await this.prisma.room.update({
          where: { id: roomId },
          data: {
            status: RoomStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        // Then fetch winner info separately for Discord notification
        const winnerMatch = await this.prisma.match.findFirst({
          where: {
            roomId,
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
                where: { id: roomId },
                select: { name: true },
              })
            )?.name || "",
          matches: winnerMatch ? [winnerMatch] : [],
        };

        this.logger.log(`Tournament completed for room ${roomId}`);

        // Discord 봇: 토너먼트 완료 시 대기실로 이동 및 채널 삭제
        try {
          if (this.discordVoiceService) {
            // 1. 모든 참가자를 대기실로 이동
            await this.discordVoiceService.moveAllToLobby(roomId);

            // 2. 팀장 역할 제거
            const room = await this.prisma.room.findUnique({
              where: { id: roomId },
              include: {
                teams: {
                  include: {
                    captain: {
                      include: {
                        authProviders: {
                          where: { provider: "DISCORD" },
                        },
                      },
                    },
                  },
                },
              },
            });

            if (room) {
              await Promise.all(
                room.teams.map(async (team) => {
                  const discordProvider = team.captain.authProviders.find(
                    (p) => p.provider === "DISCORD",
                  );
                  if (discordProvider) {
                    await this.discordVoiceService.removeCaptainRole(
                      discordProvider.providerId,
                    );
                  }
                }),
              );
            }

            // 3. 팀 채널만 삭제 (대기실+카테고리 유지 - 참가자들이 대기실에 있으므로)
            await this.discordVoiceService.deleteRoomChannels(roomId, true);
          }
        } catch (error) {
          this.logger.warn(
            "Failed to handle Discord cleanup on tournament completion:",
            error,
          );
        }

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

        return true; // Tournament just completed
      }
    }

    return false; // Not completed or already was completed
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
