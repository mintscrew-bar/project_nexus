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
import { MatchSeriesService } from "./match-series.service";
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
  private readonly liveStatusCache = new Map<
    string,
    { expiresAt: number; value: LiveGameStatus }
  >();
  private readonly liveStatusInFlight = new Map<
    string,
    Promise<LiveGameStatus>
  >();

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
    private readonly matchSeriesService: MatchSeriesService,
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

    // 다전제: 세트가 시작되면 시리즈도 진행 중으로 올린다.
    // 대진표가 시리즈 상태를 슬롯 상태로 쓰므로, 여기서 안 올리면
    // 경기 중인데 슬롯이 "대기 중"으로 남는다.
    await this.matchSeriesService.markInProgress(matchId);

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

    const updateResult = await this.completeInternalMatchWithSnapshot(
      matchId,
      winnerId,
    );

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

    // 다전제: 게임 결과를 시리즈에 반영한다.
    // 아직 선취 승수에 도달하지 않았으면 진출시키지 않고 다음 세트를 만든다
    // (세트 생성은 applyGameResult 안에서 처리).
    // 시리즈가 없는 매치(외부 인제스트 / 시리즈 도입 이전 방)는 null이 오고,
    // 이 경우 기존처럼 한 판 = 진출로 동작한다.
    const seriesProgress =
      await this.matchSeriesService.applyGameResult(matchId);
    const seriesClinched = seriesProgress ? seriesProgress.clinched : true;
    // 진출하는 건 게임 승자가 아니라 시리즈 승자다 (단판이면 같다).
    const advancingWinnerId = seriesProgress?.seriesWinnerId ?? winnerId;

    // Advance winner to next round (delegated to MatchAdvancementService)
    let bracketAdvanced = false;
    if (!seriesClinched) {
      this.logger.log(
        `[Match] 시리즈 진행 중 — seriesId=${seriesProgress?.seriesId} ` +
          `${seriesProgress?.teamAWins}-${seriesProgress?.teamBWins} (Bo${seriesProgress?.bestOf}), 진출 보류`,
      );
    } else if (updatedMatch.bracketType === BracketType.SINGLE_ELIMINATION) {
      if (updatedMatch.round && updatedMatch.matchNumber) {
        try {
          bracketAdvanced =
            await this.matchAdvancementService.advanceWinnerToNextRound(
              roomId,
              updatedMatch.round,
              updatedMatch.matchNumber,
              advancingWinnerId,
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
        advancingWinnerId === updatedMatch.teamAId
          ? updatedMatch.teamBId
          : updatedMatch.teamAId;
      if (loserId) {
        await this.matchAdvancementService.advanceDoubleElimination(
          roomId,
          // 시리즈 방이면 대진 슬롯은 시리즈다.
          updatedMatch.seriesId ?? updatedMatch.id,
          updatedMatch.bracketRound,
          advancingWinnerId,
          loserId,
        );
        bracketAdvanced = true;
      } else {
        this.logger.warn(
          `Cannot advance double elimination: match ${matchId} missing loser team ID`,
        );
      }
    }

    // 토너먼트 코드는 세트마다 새로 필요하다.
    // 다음 세트가 생겼거나 다음 라운드에 팀이 채워졌으면 코드 없는 매치에 발급한다.
    if (
      this.tournamentApiEnabled &&
      (bracketAdvanced || seriesProgress?.nextMatchId)
    ) {
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

        // 다전제면 시리즈 스코어를 승자 기준으로 정렬해 붙인다.
        const isMultiGameSeries = (seriesProgress?.bestOf ?? 1) > 1;
        let score: string | undefined;
        let seriesLabel: string | undefined;
        if (seriesProgress && isMultiGameSeries) {
          const winnerWins =
            winnerId === updatedMatch.teamAId
              ? seriesProgress.teamAWins
              : seriesProgress.teamBWins;
          const loserWins =
            winnerId === updatedMatch.teamAId
              ? seriesProgress.teamBWins
              : seriesProgress.teamAWins;
          score = `${winnerWins} - ${loserWins}`;
          // 시리즈가 아직 안 끝났으면 "N세트 종료"로 낮춰 표기한다.
          if (!seriesProgress.clinched) {
            seriesLabel = `${updatedMatch.gameNumber}세트`;
          }
        }

        const embed = this.discordBotService.buildMatchResultEmbed(
          winner?.name ?? "TBD",
          loser?.name ?? "TBD",
          score,
          seriesLabel,
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

    return {
      message: "Match result recorded",
      winnerId,
      tournamentCompleted,
      bracketAdvanced,
      roomId: roomId,
      // 다전제 진행 상황 — 게이트웨이가 다음 세트 안내·진영 선택을 띄우는 데 쓴다.
      series: seriesProgress,
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
        seriesId: true,
        gameNumber: true,
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

    const autoSideSwap = Boolean(match.seriesId && match.gameNumber > 1);
    let blueSideTeamId = match.blueSideTeamId;

    // 기존에 생성된 다음 세트나 복구 상태에 진영이 비어 있어도 직전 세트와
    // 반대로 확정한다. 한 번 저장한 뒤에는 재접속해도 같은 진영을 사용한다.
    if (
      autoSideSwap &&
      blueSideTeamId !== match.teamAId &&
      blueSideTeamId !== match.teamBId
    ) {
      const previous = await this.prisma.match.findFirst({
        where: {
          seriesId: match.seriesId,
          gameNumber: { lt: match.gameNumber },
          blueSideTeamId: { not: null },
        },
        orderBy: { gameNumber: "desc" },
        select: { blueSideTeamId: true },
      });
      blueSideTeamId =
        previous?.blueSideTeamId === match.teamAId
          ? match.teamBId
          : match.teamAId;

      if (blueSideTeamId) {
        await this.prisma.match.update({
          where: { id: matchId },
          data: { blueSideTeamId },
        });
      }
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
      blueSideTeamId,
      gameNumber: match.gameNumber,
      // 다전제 2세트부터는 생성 시 저장된 진영으로 바로 시작한다.
      autoSideSwap,
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
        // 다전제: 대진표는 시리즈 단위로 카드를 그리고 세트는 그 안에 접어 넣는다.
        seriesId: true,
        gameNumber: true,
        series: {
          select: {
            id: true,
            bestOf: true,
            status: true,
            winnerId: true,
            teamAId: true,
            teamBId: true,
          },
        },
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
      orderBy: [
        { round: "asc" },
        { matchNumber: "asc" },
        { gameNumber: "asc" },
      ],
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
        { rosterSnapshots: { some: { userId } } },
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
        rosterSnapshots: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    const buildSnapshotTeam = (
      match: (typeof matches)[number],
      teamSlot: string,
      id: string | null,
      name: string | null,
    ) =>
      id && name
        ? {
            id,
            name,
            color: null,
            captainId: null,
            members: match.rosterSnapshots
              .filter((member) => member.teamSlot === teamSlot)
              .map((member) => ({
                userId: member.userId,
                user: member.user ?? {
                  id: member.userId,
                  username: member.username,
                  avatar: null,
                },
              })),
          }
        : null;

    return matches.map((match) => ({
      ...match,
      room:
        match.room ??
        (match.roomIdSnapshot && match.roomName
          ? { id: match.roomIdSnapshot, name: match.roomName }
          : null),
      teamA:
        match.teamA ??
        buildSnapshotTeam(match, "A", match.teamAIdSnapshot, match.teamAName),
      teamB:
        match.teamB ??
        buildSnapshotTeam(match, "B", match.teamBIdSnapshot, match.teamBName),
      winner:
        match.winner ??
        (match.winnerIdSnapshot && match.winnerName
          ? { id: match.winnerIdSnapshot, name: match.winnerName }
          : null),
    }));
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
        isInternal: true,
        roomId: data.roomId,
        teamAId: data.teamAId,
        teamBId: data.teamBId,
        tournamentCode: data.tournamentCode,
        status: "PENDING",
      },
    });
  }

  private async completeInternalMatchWithSnapshot(
    matchId: string,
    winnerId: string,
  ): Promise<{ count: number }> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        room: {
          include: { host: { select: { id: true, username: true } } },
        },
        teamA: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    riotAccounts: {
                      where: { isPrimary: true },
                      take: 1,
                      select: { puuid: true },
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
                    riotAccounts: {
                      where: { isPrimary: true },
                      take: 1,
                      select: { puuid: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!match?.room || !match.teamA || !match.teamB) {
      throw new BadRequestException(
        "Cannot complete an internal match without room and team data",
      );
    }

    const roster = [
      ...match.teamA.members.map((member) => ({
        matchId,
        userId: member.userId,
        username: member.user.username,
        puuid: member.user.riotAccounts[0]?.puuid ?? null,
        teamSlot: "A",
        teamIdSnapshot: match.teamA!.id,
        teamName: match.teamA!.name,
      })),
      ...match.teamB.members.map((member) => ({
        matchId,
        userId: member.userId,
        username: member.user.username,
        puuid: member.user.riotAccounts[0]?.puuid ?? null,
        teamSlot: "B",
        teamIdSnapshot: match.teamB!.id,
        teamName: match.teamB!.name,
      })),
    ];
    const winner = winnerId === match.teamA.id ? match.teamA : match.teamB;
    const completedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.match.updateMany({
        where: { id: matchId, status: MatchStatus.IN_PROGRESS },
        data: { status: MatchStatus.COMPLETED, winnerId, completedAt },
      });
      if (result.count === 0) return result;

      await tx.match.update({
        where: { id: matchId },
        data: {
          isInternal: true,
          roomIdSnapshot: match.room!.id,
          roomName: match.room!.name,
          roomTeamMode: match.room!.teamMode,
          roomHostId: match.room!.host.id,
          roomHostName: match.room!.host.username,
          teamAIdSnapshot: match.teamA!.id,
          teamAName: match.teamA!.name,
          teamBIdSnapshot: match.teamB!.id,
          teamBName: match.teamB!.name,
          winnerIdSnapshot: winner.id,
          winnerName: winner.name,
        },
      });
      await tx.matchRosterSnapshot.deleteMany({ where: { matchId } });
      if (roster.length > 0) {
        await tx.matchRosterSnapshot.createMany({ data: roster });
      }
      return result;
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
        rosterSnapshots: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException("Match not found");
    }

    const buildSnapshotTeam = (
      teamSlot: string,
      id: string | null,
      name: string | null,
    ) =>
      id && name
        ? {
            id,
            name,
            color: null,
            captain: null,
            members: match.rosterSnapshots
              .filter((member) => member.teamSlot === teamSlot)
              .map((member) => ({
                userId: member.userId,
                assignedRole: null,
                user: member.user ?? {
                  id: member.userId,
                  username: member.username,
                  avatar: null,
                  riotAccounts: [],
                },
              })),
          }
        : null;

    return {
      ...match,
      teamA:
        match.teamA ??
        buildSnapshotTeam("A", match.teamAIdSnapshot, match.teamAName),
      teamB:
        match.teamB ??
        buildSnapshotTeam("B", match.teamBIdSnapshot, match.teamBName),
      participants: match.participants.map((participant) => ({
        ...participant,
        teamId: participant.teamId ?? participant.teamIdSnapshot,
      })),
      teamStats: match.teamStats.map((stats) => ({
        ...stats,
        teamId: stats.teamId ?? stats.teamIdSnapshot,
        team:
          stats.team ??
          (stats.teamIdSnapshot && stats.teamName
            ? {
                id: stats.teamIdSnapshot,
                name: stats.teamName,
                color: null,
              }
            : null),
      })),
    };
  }

  /**
   * Get match participants
   */
  async getMatchParticipants(matchId: string) {
    const participants = await this.prisma.matchParticipant.findMany({
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

    return participants.map((participant) => ({
      ...participant,
      team:
        participant.team ??
        (participant.teamIdSnapshot && participant.teamName
          ? {
              id: participant.teamIdSnapshot,
              name: participant.teamName,
              color: null,
            }
          : null),
    }));
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
          isInternal: true,
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
      match: {
        ...participant.match,
        teamA:
          participant.match.teamA ??
          (participant.match.teamAIdSnapshot && participant.match.teamAName
            ? {
                id: participant.match.teamAIdSnapshot,
                name: participant.match.teamAName,
                color: null,
              }
            : null),
        teamB:
          participant.match.teamB ??
          (participant.match.teamBIdSnapshot && participant.match.teamBName
            ? {
                id: participant.match.teamBIdSnapshot,
                name: participant.match.teamBName,
                color: null,
              }
            : null),
        winner:
          participant.match.winner ??
          (participant.match.winnerIdSnapshot && participant.match.winnerName
            ? {
                id: participant.match.winnerIdSnapshot,
                name: participant.match.winnerName,
              }
            : null),
      },
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
      team:
        participant.team ??
        (participant.teamIdSnapshot && participant.teamName
          ? {
              id: participant.teamIdSnapshot,
              name: participant.teamName,
              color: null,
            }
          : null),
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
        isInternal: true,
        riotMatchId: { not: null },
        OR: [
          { teamA: { members: { some: { userId } } } },
          { teamB: { members: { some: { userId } } } },
          { rosterSnapshots: { some: { userId } } },
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
    const cached = this.liveStatusCache.get(matchId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const existingRequest = this.liveStatusInFlight.get(matchId);
    if (existingRequest) return existingRequest;

    const request = this.fetchLiveMatchStatus(matchId)
      .then((value) => {
        this.liveStatusCache.set(matchId, {
          expiresAt: Date.now() + 20_000,
          value,
        });
        return value;
      })
      .finally(() => {
        this.liveStatusInFlight.delete(matchId);
      });

    this.liveStatusInFlight.set(matchId, request);
    return request;
  }

  private async fetchLiveMatchStatus(matchId: string): Promise<LiveGameStatus> {
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
    const teamAPuuids: string[] = [];
    const teamBPuuids: string[] = [];

    for (const member of match.teamA?.members ?? []) {
      const puuid = member.user.riotAccounts[0]?.puuid;
      if (puuid) {
        teamAPuuids.push(puuid);
      }
    }

    for (const member of match.teamB?.members ?? []) {
      const puuid = member.user.riotAccounts[0]?.puuid;
      if (puuid) {
        teamBPuuids.push(puuid);
      }
    }

    const puuids = [...teamAPuuids, ...teamBPuuids];

    if (puuids.length === 0) {
      this.logger.warn(`No PUUIDs found for match ${matchId} participants`);
      return { isLive: false };
    }

    // Check if any participant is in an active game
    try {
      const liveStatus =
        await this.riotSpectatorService.findActiveGameByPUUIDs(puuids);
      await this.captureSpectatorMatchId(
        matchId,
        match.riotMatchId,
        teamAPuuids,
        teamBPuuids,
        liveStatus,
      );
      return liveStatus;
    } catch (error) {
      this.logger.error(
        `Error checking live match status for ${matchId}:`,
        error,
      );
      return { isLive: false };
    }
  }

  /**
   * 일반 사설게임은 종료 후 PUUID 매치 목록에 나타나지 않을 수 있다.
   * 경기 중 Spectator 응답의 gameId를 보존하면 종료 후 Match-v5 상세를
   * ID로 직접 조회할 수 있다. 다른 게임 오연결을 막기 위해 CUSTOM_GAME이며
   * NEXUS 양 팀 각각 80% 이상이 참가 중일 때만 저장한다.
   */
  private async captureSpectatorMatchId(
    matchId: string,
    existingRiotMatchId: string | null,
    teamAPuuids: string[],
    teamBPuuids: string[],
    liveStatus: LiveGameStatus,
  ): Promise<void> {
    const game = liveStatus.gameInfo;
    if (!liveStatus.isLive || !game || existingRiotMatchId) return;

    const isCustomGame =
      game.gameType === "CUSTOM_GAME" || game.gameQueueConfigId === 0;
    if (!isCustomGame) return;

    const activePuuids = new Set(game.participants.map((item) => item.puuid));
    const matchedA = teamAPuuids.filter((puuid) =>
      activePuuids.has(puuid),
    ).length;
    const matchedB = teamBPuuids.filter((puuid) =>
      activePuuids.has(puuid),
    ).length;
    const requiredA = Math.max(1, Math.ceil(teamAPuuids.length * 0.8));
    const requiredB = Math.max(1, Math.ceil(teamBPuuids.length * 0.8));

    if (matchedA < requiredA || matchedB < requiredB) {
      this.logger.warn(
        `[SpectatorMatchId] 참가자 불일치로 저장 생략 matchId=${matchId} ` +
          `teamA=${matchedA}/${teamAPuuids.length} teamB=${matchedB}/${teamBPuuids.length}`,
      );
      return;
    }

    const rawPlatformId = game.platformId
      ?.toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!rawPlatformId || !Number.isFinite(game.gameId)) return;

    // Spectator가 KR1을 주는 경우에도 Match-v5 ID 접두사는 KR이다.
    const platformId = rawPlatformId === "KR1" ? "KR" : rawPlatformId;

    const riotMatchId = `${platformId}_${Math.trunc(game.gameId)}`;
    try {
      const updated = await this.prisma.match.updateMany({
        where: {
          id: matchId,
          status: MatchStatus.IN_PROGRESS,
          riotMatchId: null,
        },
        data: { riotMatchId },
      });

      if (updated.count > 0) {
        this.logger.log(
          `[SpectatorMatchId] Riot 매치 ID 저장 matchId=${matchId} riotMatchId=${riotMatchId}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[SpectatorMatchId] Riot 매치 ID 저장 실패 matchId=${matchId}: ${message}`,
      );
    }
  }
}
