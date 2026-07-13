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
import { RankingService } from "../ranking/ranking.service";
import {
  Prisma,
  RoomStatus,
  MatchStatus,
  BracketType,
  VoteType,
} from "@nexus/database";
import {
  getChampionKoreanName,
  getSummonerSpellKoreanName,
} from "@nexus/types";

// Re-export types for backward compatibility
export type { BracketMatch, Bracket } from "./match-bracket.service";

@Injectable()
export class MatchService {
  private readonly logger = new Logger(MatchService.name);
  private discordBotService: any;
  private discordVoiceService: any;

  // Tournament API 활성화 여부 — 환경변수 TOURNAMENT_API_ENABLED=true 로 제어
  private readonly tournamentApiEnabled: boolean;

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
    private readonly rankingService: RankingService,
    @Optional() @Inject("DISCORD_BOT_SERVICE") discordBot?: any,
    @Optional() @Inject("DISCORD_VOICE_SERVICE") discordVoice?: any,
  ) {
    this.discordBotService = discordBot;
    this.discordVoiceService = discordVoice;
    this.tournamentApiEnabled =
      this.configService.get<string>("TOURNAMENT_API_ENABLED") === "true";
  }

  private async sendRoomEmbedNotification(
    roomId: string,
    embed: any,
  ): Promise<void> {
    if (!this.discordBotService) return;

    const notificationTarget =
      await this.discordVoiceService?.getRoomNotificationTarget?.(roomId);
    if (!notificationTarget) return;

    await this.discordBotService.sendEmbedNotification(
      notificationTarget.guildId,
      notificationTarget.channelId,
      embed,
    );
  }

  // ========================================
  // Bracket Generation (delegated to MatchBracketService)
  // ========================================

  async generateBracket(hostId: string, roomId: string): Promise<Bracket> {
    const bracket = await this.matchBracketService.generateBracket(
      hostId,
      roomId,
    );

    if (this.tournamentApiEnabled) {
      await this.autoGenerateCodesForRoom(roomId);
    }

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

    // 토너먼트 코드 발급은 내부(roomId 있는) 매치에만 적용 — 외부 인제스트 매치는 해당 없음
    if (!match.room) {
      throw new BadRequestException(
        "Tournament code requires an internal match",
      );
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
        // 진영 정렬: blueSideTeamId 기준(미설정이면 teamA=블루 기본)
        const blueIsA = match.blueSideTeamId
          ? match.blueSideTeamId === match.teamA!.id
          : true;
        const blueName = blueIsA ? match.teamA!.name : match.teamB!.name;
        const redName = blueIsA ? match.teamB!.name : match.teamA!.name;
        const embed = this.discordBotService.buildMatchStartEmbed(
          blueName,
          redName,
          tournamentCode,
        );

        await this.sendRoomEmbedNotification(match.room.id, embed);
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
        ...match.teamA.members.map((m: { user: { id: string } }) => m.user.id),
        ...match.teamB.members.map((m: { user: { id: string } }) => m.user.id),
      ];
      // 클로저 안에서 좁힘 유실 방지 — 위에서 match.room 검증 완료
      const roomName = match.room.name;

      await Promise.all(
        allParticipants.map((userId) =>
          this.notificationService.notifyMatchStarting(
            userId,
            matchId,
            roomName,
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
          code = await this.riotTournamentService.createTournamentCode(
            match.id,
          );
        } catch {
          code = `NEXUS-${match.id.substring(0, 8).toUpperCase()}`;
        }

        await this.prisma.match.update({
          where: { id: match.id },
          data: { tournamentCode: code },
        });

        this.logger.log(
          `Auto-generated tournament code for match ${match.id}: ${code}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to auto-generate code for match ${match.id}:`,
          error,
        );
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

    // 매치 시작은 내부(roomId 있는) 매치에만 적용 — 외부 인제스트 매치는 시작 개념이 없음
    if (!match.room) {
      throw new BadRequestException(
        "Cannot start an external (ingested) match",
      );
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

    await this.prisma.room.update({
      where: { id: match.room.id },
      data: { broadcastFocusMatchId: matchId },
    });

    this.logger.log(`Match ${matchId} started by host ${hostId}`);

    return {
      message: "Match started",
      tournamentCode: match.tournamentCode,
      matchId,
      roomId: match.room.id,
    };
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

    // 결과 보고는 내부(roomId 있는) 매치에만 적용 — 외부 인제스트 매치는 결과가 이미 확정 상태
    if (!match.room || !match.roomId) {
      throw new BadRequestException(
        "Cannot report result for an external (ingested) match",
      );
    }

    const captainAId = match.teamA?.captainId;
    const captainBId = match.teamB?.captainId;
    const isAuthorized =
      match.room.hostId === hostId ||
      (captainAId && captainAId === hostId) ||
      (captainBId && captainBId === hostId);
    if (!isAuthorized) {
      throw new ForbiddenException(
        "호스트 또는 팀장만 결과를 보고할 수 있습니다.",
      );
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

    // 위에서 roomId는 이미 검증됨 — 동일 매치이므로 updatedMatch.roomId도 NULL이 아님
    const roomId = updatedMatch.roomId;
    if (!roomId) {
      throw new BadRequestException("Internal match required for reporting");
    }

    await this.prisma.room.update({
      where: { id: roomId },
      data: { broadcastFocusMatchId: matchId },
    });

    // Advance winner to next round (delegated to MatchAdvancementService)
    let bracketAdvanced = false;
    if (updatedMatch.bracketType === BracketType.SINGLE_ELIMINATION) {
      if (updatedMatch.round && updatedMatch.matchNumber) {
        try {
          bracketAdvanced =
            await this.matchAdvancementService.advanceWinnerToNextRound(
              roomId,
              updatedMatch.round,
              updatedMatch.matchNumber,
              winnerId,
            );
        } catch (advanceError) {
          // 브래킷 진급 실패: 매치 결과는 이미 기록됐으므로 롤백하지 않고 에러만 기록
          this.logger.error(
            `[Match] 브래킷 진급 실패 — matchId=${matchId}, round=${updatedMatch.round}, matchNumber=${updatedMatch.matchNumber}`,
            advanceError,
          );
        }
      } else {
        this.logger.warn(
          `Cannot advance winner: match ${matchId} missing round or matchNumber`,
        );
      }
    } else if (updatedMatch.bracketType === BracketType.DOUBLE_ELIMINATION) {
      const loserId =
        winnerId === updatedMatch.teamAId
          ? updatedMatch.teamBId
          : updatedMatch.teamAId;
      if (loserId) {
        await this.matchAdvancementService.advanceDoubleElimination(
          roomId,
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

    if (this.tournamentApiEnabled && bracketAdvanced) {
      await this.autoGenerateCodesForRoom(roomId);
    }

    // Send Discord match result notification
    try {
      if (this.discordBotService) {
        const winner =
          winnerId === updatedMatch.teamAId
            ? updatedMatch.teamA
            : updatedMatch.teamB;
        const loser =
          winnerId === updatedMatch.teamAId
            ? updatedMatch.teamB
            : updatedMatch.teamA;

        const embed = this.discordBotService.buildMatchResultEmbed(
          winner?.name ?? "TBD",
          loser?.name ?? "TBD",
        );

        await this.sendRoomEmbedNotification(roomId, embed);
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

      if (matchWithMembers && matchWithMembers.room) {
        const winnerMembers =
          winnerId === matchWithMembers.teamAId
            ? (matchWithMembers.teamA?.members ?? [])
            : (matchWithMembers.teamB?.members ?? []);
        const loserMembers =
          winnerId === matchWithMembers.teamAId
            ? (matchWithMembers.teamB?.members ?? [])
            : (matchWithMembers.teamA?.members ?? []);
        // 클로저 안에서 좁힘 유실 방지
        const roomName = matchWithMembers.room.name;

        // Notify winners
        await Promise.all(
          winnerMembers.map((m: { user: { id: string } }) =>
            this.notificationService.notifyMatchResult(
              m.user.id,
              matchId,
              true,
              roomName,
            ),
          ),
        );

        // Notify losers
        await Promise.all(
          loserMembers.map((m: { user: { id: string } }) =>
            this.notificationService.notifyMatchResult(
              m.user.id,
              matchId,
              false,
              roomName,
            ),
          ),
        );
      }
    } catch (error) {
      this.logger.warn("Failed to send match result notifications:", error);
    }

    // Check if bracket is complete (delegated to MatchAdvancementService)
    const allComplete =
      await this.matchAdvancementService.checkBracketCompletion(roomId);
    let tournamentCompleted = false;

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
            roomId: roomId,
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

        // Send Discord tournament completion notification
        try {
          if (this.discordBotService) {
            if (roomData.matches[0]?.winner) {
              const embed =
                this.discordBotService.buildTournamentCompletedEmbed(
                  roomData.name,
                  roomData.matches[0].winner.name,
                );

              await this.sendRoomEmbedNotification(roomId, embed);
            }
          }
        } catch (error) {
          this.logger.warn(
            "Failed to send Discord tournament completion notification:",
            error,
          );
        }

        // Move all participants back to lobby voice channel
        try {
          if (this.discordVoiceService) {
            const moveResult =
              await this.discordVoiceService.moveAllToLobby(roomId);
            this.logger.log(
              `Moved participants to lobby for room ${roomId}: ${moveResult.success} success, ${moveResult.failed} failed`,
            );
          }
        } catch (error) {
          this.logger.warn(
            "Failed to move participants to lobby after tournament completion:",
            error,
          );
        }

        tournamentCompleted = true;
      }
    }

    if (this.tournamentApiEnabled) {
      // Tournament API 활성화: 토너먼트 코드로 Riot 매치 ID 조회
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
    } else {
      // Tournament API 비활성화: PUUID 크로스레퍼런스로 커스텀 게임 전적 수집
      setImmediate(() => {
        this.matchDataCollectionService
          .collectMatchDataByPuuidCrossref(matchId)
          .catch((error) => {
            this.logger.error(
              `[PuuidCrossref] Background 전적 수집 실패 matchId=${matchId}:`,
              error,
            );
          });
      });
    }

    // Update rankings for all participants (non-blocking)
    setImmediate(async () => {
      try {
        const participantUsers = await this.prisma.teamMember.findMany({
          where: {
            teamId: { in: [match.teamAId!, match.teamBId!].filter(Boolean) },
          },
          select: { userId: true },
          distinct: ["userId"],
        });

        for (const { userId: uid } of participantUsers) {
          await this.rankingService.updateRanking(uid);
        }
        this.logger.log(
          `Updated rankings for ${participantUsers.length} participants of match ${matchId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update rankings for match ${matchId}:`,
          error,
        );
      }
    });

    return {
      message: "Match result recorded",
      winnerId,
      tournamentCompleted,
      bracketAdvanced,
      roomId: roomId,
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

  /**
   * 가위바위보 진영 결정에 필요한 매치 컨텍스트 (팀/팀장/호스트/상태).
   */
  async getRpsContext(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        teamAId: true,
        teamBId: true,
        status: true,
        blueSideTeamId: true,
        teamA: {
          select: {
            captainId: true,
            name: true,
            captain: { select: { id: true, username: true } },
          },
        },
        teamB: {
          select: {
            captainId: true,
            name: true,
            captain: { select: { id: true, username: true } },
          },
        },
        room: { select: { hostId: true } },
      },
    });
    if (!match) {
      throw new NotFoundException("Match not found");
    }
    return {
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      teamAName: match.teamA?.name ?? null,
      teamBName: match.teamB?.name ?? null,
      captainAId: match.teamA?.captainId ?? null,
      captainBId: match.teamB?.captainId ?? null,
      captainAUsername: match.teamA?.captain?.username ?? null,
      captainBUsername: match.teamB?.captain?.username ?? null,
      captainAIsBot: /^testbot_\d+$/.test(match.teamA?.captain?.username ?? ""),
      captainBIsBot: /^testbot_\d+$/.test(match.teamB?.captain?.username ?? ""),
      hostId: match.room?.hostId ?? null,
      status: match.status,
      blueSideTeamId: match.blueSideTeamId,
    };
  }

  /**
   * 진영(블루 사이드) 팀 저장. 가위바위보 결과로 호출.
   */
  async setBlueSide(matchId: string, blueSideTeamId: string) {
    await this.prisma.match.update({
      where: { id: matchId },
      data: { blueSideTeamId },
    });
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
            captain: { select: { id: true, username: true } },
          },
        },
        teamB: {
          select: {
            id: true,
            name: true,
            color: true,
            captain: { select: { id: true, username: true } },
          },
        },
        winner: {
          select: {
            id: true,
            name: true,
            color: true,
            captain: { select: { id: true, username: true } },
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

  // ========================================
  // Match Details (Riot API Data)
  // ========================================

  /**
   * Get match details with participant stats
   */
  async getMatchDetails(matchId: string) {
    // 라인별 로스터/호버 툴팁용 멤버 정보 select — 팀장, 배정 라인, 주 라이엇 계정의
    // 티어/주·부라인/선호 챔피언까지 포함한다.
    const memberInclude = {
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
                  subRole: true,
                  championPreferences: {
                    orderBy: { order: "asc" as const },
                    select: {
                      role: true,
                      championId: true,
                      order: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: {
          include: {
            captain: { select: { id: true, username: true } },
            ...memberInclude,
          },
        },
        teamB: {
          include: {
            captain: { select: { id: true, username: true } },
            ...memberInclude,
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
      where: {
        userId,
        match: {
          roomId: { not: null },
        },
      },
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

    return matches.map((participant: (typeof matches)[number]) => ({
      matchId: participant.matchId,
      match: participant.match,
      participant: {
        championId: participant.championId,
        championName: participant.championName,
        // 영문 챔피언명을 한글로 변환하여 추가 (기존 영문 필드는 유지)
        championNameKorean: getChampionKoreanName(participant.championName),
        // 소환사 주문 ID를 한글명으로 변환하여 추가
        summoner1Korean: getSummonerSpellKoreanName(participant.summoner1Id),
        summoner2Korean: getSummonerSpellKoreanName(participant.summoner2Id),
        position: participant.position,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        win: participant.win,
        // 내전 딜량 데이터 포함 — 프론트 딜량 추세 차트 활성화용 (#23)
        damage: participant.totalDamageDealtToChampions,
        kda:
          participant.deaths === 0
            ? participant.kills + participant.assists
            : (participant.kills + participant.assists) / participant.deaths,
      },
      team: participant.team,
    }));
  }

  /**
   * 해당 유저가 참가한 Nexus 내전의 Riot 매치 ID 전체를 반환한다.
   *
   * Riot 전적 목록에서 "내전" 배지를 붙일지 판단하는 대조용이다.
   * 화면 표시용 매치 히스토리는 페이지네이션되지만 Riot 전적은 무한 스크롤되므로,
   * 그 목록을 재사용하면 오래된 내전이 "사용자 지정"으로 잘못 표시된다.
   * ID만 담은 경량 응답이라 전체를 내려도 부담이 없다.
   */
  async getUserRiotMatchIds(userId: string): Promise<string[]> {
    const matches = await this.prisma.match.findMany({
      where: {
        roomId: { not: null },
        riotMatchId: { not: null },
        OR: [
          { teamA: { members: { some: { userId } } } },
          { teamB: { members: { some: { userId } } } },
        ],
      },
      select: { riotMatchId: true },
    });

    return matches
      .map((match) => match.riotMatchId)
      .filter((riotMatchId): riotMatchId is string => Boolean(riotMatchId));
  }

  // ========================================
  // MVP / ACE 투표
  // ========================================

  /**
   * MVP(이긴 팀) 또는 ACE(진 팀) 투표 제출.
   * 매치가 COMPLETED 상태여야 하며, 투표자는 해당 매치 참가자여야 한다.
   * 투표 대상은 voteType에 맞는 팀(이긴 팀/진 팀) 소속이어야 한다.
   */
  async submitVote(
    voterId: string,
    matchId: string,
    votedForId: string,
    voteType: VoteType,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
      },
    });

    if (!match) throw new NotFoundException("Match not found");
    if (match.status !== MatchStatus.COMPLETED) {
      throw new BadRequestException("투표는 경기 종료 후에만 가능합니다.");
    }
    if (!match.winnerId) {
      throw new BadRequestException("경기 결과가 아직 입력되지 않았습니다.");
    }

    // 투표자가 해당 매치 참가자인지 확인
    const allMemberIds = [
      ...(match.teamA?.members ?? []),
      ...(match.teamB?.members ?? []),
    ].map((m) => m.userId);

    if (!allMemberIds.includes(voterId)) {
      throw new ForbiddenException("해당 경기 참가자만 투표할 수 있습니다.");
    }

    // 투표 대상이 올바른 팀인지 확인
    const loserId =
      match.winnerId === match.teamAId ? match.teamBId : match.teamAId;
    const winnerMembers =
      (match.winnerId === match.teamAId ? match.teamA : match.teamB)?.members ??
      [];
    const loserMembers =
      (loserId === match.teamAId ? match.teamA : match.teamB)?.members ?? [];

    if (voteType === VoteType.MVP) {
      const isWinnerMember = winnerMembers.some((m) => m.userId === votedForId);
      if (!isWinnerMember) {
        throw new BadRequestException(
          "MVP는 이긴 팀 멤버만 선택할 수 있습니다.",
        );
      }
    } else {
      const isLoserMember = loserMembers.some((m) => m.userId === votedForId);
      if (!isLoserMember) {
        throw new BadRequestException("ACE는 진 팀 멤버만 선택할 수 있습니다.");
      }
    }

    // vote create + 집계 갱신을 트랜잭션으로 묶어 원자성 보장
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.matchVote.create({
          data: { matchId, voterId, votedForId, voteType },
        });
        await this.recalculateVoteWinnerTx(tx, matchId, voteType);
      });
    } catch (err: any) {
      // Prisma unique constraint 위반 (P2002) — 동시 요청으로 중복 투표 시도
      if (err?.code === "P2002") {
        throw new BadRequestException("이미 투표하셨습니다.");
      }
      throw err;
    }

    return { message: "투표가 완료되었습니다." };
  }

  /**
   * 매치의 현재 투표 현황 조회.
   * MVP/ACE 후보별 득표 수와 내 투표 여부를 반환한다.
   */
  async getMatchVotes(matchId: string, userId?: string) {
    const votes = await this.prisma.matchVote.findMany({
      where: { matchId },
      include: {
        votedFor: { select: { id: true, username: true, avatar: true } },
      },
    });

    // 타입별 득표 집계
    const tally = (type: VoteType) => {
      const filtered = votes.filter((v) => v.voteType === type);
      const counts: Record<
        string,
        { user: (typeof filtered)[0]["votedFor"]; count: number }
      > = {};
      for (const v of filtered) {
        const key = v.votedForId;
        if (!counts[key]) counts[key] = { user: v.votedFor, count: 0 };
        counts[key].count++;
      }
      return Object.values(counts).sort((a, b) => b.count - a.count);
    };

    return {
      mvp: tally(VoteType.MVP),
      ace: tally(VoteType.ACE),
      myVotes: userId
        ? {
            mvp:
              votes.find(
                (v) => v.voterId === userId && v.voteType === VoteType.MVP,
              )?.votedForId ?? null,
            ace:
              votes.find(
                (v) => v.voterId === userId && v.voteType === VoteType.ACE,
              )?.votedForId ?? null,
          }
        : null,
    };
  }

  /** 투표 집계 후 최다 득표자를 Match에 반영 (트랜잭션 내부용) */
  private async recalculateVoteWinnerTx(
    tx: Prisma.TransactionClient,
    matchId: string,
    voteType: VoteType,
  ) {
    const votes = await tx.matchVote.groupBy({
      by: ["votedForId"],
      where: { matchId, voteType },
      _count: { votedForId: true },
      // 동표 시 votedForId 오름차순으로 결정론적 선택
      orderBy: [{ _count: { votedForId: "desc" } }, { votedForId: "asc" }],
      take: 1,
    });

    if (votes.length === 0) return;
    const topUserId = votes[0].votedForId;

    await tx.match.update({
      where: { id: matchId },
      data:
        voteType === VoteType.MVP
          ? { mvpUserId: topUserId }
          : { aceUserId: topUserId },
    });
  }

  /** 트랜잭션 없이 독립 호출용 (외부에서 집계 재계산이 필요한 경우) */
  private async recalculateVoteWinner(matchId: string, voteType: VoteType) {
    await this.recalculateVoteWinnerTx(this.prisma, matchId, voteType);
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
