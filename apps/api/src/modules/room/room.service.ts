import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  Optional,
  Inject,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { ShutdownService } from "../common/shutdown.service";
import {
  RoomStatus,
  TeamMode,
  TeamCaptainSelection,
  BracketType,
} from "@nexus/database";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomInt } from "crypto";
import { calculateTierScore } from "../common/tier-score.util";

export interface CreateRoomDto {
  name: string;
  password?: string;
  maxParticipants: number;
  teamMode: TeamMode;
  allowSpectators?: boolean;
  discordGuildId?: string;

  // Auction Settings
  startingPoints?: number;
  minBidIncrement?: number;
  bidTimeLimit?: number;

  // Snake Draft Settings
  pickTimeLimit?: number;
  captainSelection?: TeamCaptainSelection;

  // Tournament bracket format
  bracketFormat?: BracketType;
}

export interface JoinRoomDto {
  roomId: string;
  password?: string;
  asSpectator?: boolean;
}

interface AutoBalancePlayer {
  participant: {
    id: string;
    userId: string;
  };
  score: number;
  mainRole: string | null;
  subRole: string | null;
}

interface AutoBalanceAssignment {
  score: number;
  players: AutoBalancePlayer[];
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private discordBotService: any; // DiscordBotService (optional dependency)
  private discordVoiceService: any; // DiscordVoiceService (optional dependency)

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly shutdownService: ShutdownService,
    @Optional() @Inject("DISCORD_BOT_SERVICE") discordBot?: any,
    @Optional() @Inject("DISCORD_VOICE_SERVICE") discordVoice?: any,
  ) {
    this.discordBotService = discordBot;
    this.discordVoiceService = discordVoice;
  }

  /**
   * 동시성 충돌(P2034) 발생 시 직렬화 트랜잭션을 재시도한다.
   */
  private async runSerializableTx<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        if (error?.code === "P2034" && attempt < maxRetries) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException("트랜잭션 재시도 한도를 초과했습니다.");
  }

  private readonly teamColors = [
    "#60A5FA",
    "#F87171",
    "#34D399",
    "#FBBF24",
    "#A78BFA",
    "#F472B6",
    "#22D3EE",
    "#FB923C",
  ];

  private async createManualTeamSlots(
    tx: Prisma.TransactionClient,
    roomId: string,
    hostId: string,
    maxParticipants: number,
  ) {
    const numTeams = Math.floor(maxParticipants / 5);
    for (let index = 0; index < numTeams; index++) {
      await tx.team.create({
        data: {
          roomId,
          captainId: hostId,
          name: `Team ${index + 1}`,
          color: this.teamColors[index % this.teamColors.length],
        },
      });
    }
  }

  private async clearTeamSetup(
    tx: Prisma.TransactionClient,
    roomId: string,
    resetReady = false,
  ) {
    await tx.roomParticipant.updateMany({
      where: { roomId },
      data: {
        teamId: null,
        isCaptain: false,
        ...(resetReady && { isReady: false }),
      },
    });
    await tx.snakeDraftPick.deleteMany({ where: { roomId } });
    await tx.auctionBid.deleteMany({ where: { roomId } });
    await tx.team.deleteMany({ where: { roomId } });
  }

  private shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = randomInt(index + 1);
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  private getAssignmentSignature(assignments: AutoBalanceAssignment[]) {
    return assignments
      .map((assignment) =>
        assignment.players
          .map((player) => player.participant.userId)
          .sort()
          .join(","),
      )
      .sort()
      .join("|");
  }

  private getTeamRolePenalty(players: AutoBalancePlayer[]) {
    const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
    let minimumPenalty = Number.POSITIVE_INFINITY;

    const visit = (
      playerIndex: number,
      availableRoles: string[],
      penalty: number,
    ) => {
      if (penalty >= minimumPenalty) return;
      if (playerIndex === players.length) {
        minimumPenalty = penalty;
        return;
      }

      const player = players[playerIndex];
      for (const role of availableRoles) {
        const rolePenalty =
          player.mainRole === role
            ? 0
            : player.subRole === role
              ? 1
              : player.mainRole || player.subRole
                ? 3
                : 1;
        visit(
          playerIndex + 1,
          availableRoles.filter((availableRole) => availableRole !== role),
          penalty + rolePenalty,
        );
      }
    };

    visit(0, roles, 0);
    return minimumPenalty;
  }

  private getAssignmentRolePenalty(assignments: AutoBalanceAssignment[]) {
    return assignments.reduce(
      (penalty, assignment) =>
        penalty + this.getTeamRolePenalty(assignment.players),
      0,
    );
  }

  private chooseAutoBalancedAssignments(
    rankedPlayers: AutoBalancePlayer[],
    teamCount: number,
  ): AutoBalanceAssignment[] {
    // 튜닝 상수
    const MAX_ATTEMPTS = 100; // 1단계 랜덤 분배 시도 상한
    const MIN_DISTINCT = 12; // 스프레드 근방 후보가 이만큼 모이면 조기 종료
    const SPREAD_SLACK = 100; // 최저 MMR 스프레드 + 이 값 이내를 "근방"으로 간주
    const ROLE_PENALTY_WEIGHT = 100; // 강제 오프롤 1건 ≈ MMR 1~3티어 가치

    // ── 1단계(저비용): 밴드 분배로 후보를 만들되 MMR 스프레드만 계산한다.
    //   역할 페널티(팀당 5! 완전탐색)는 여기서 돌리지 않고, 2단계에서
    //   스프레드 근방까지 살아남은 소수 후보에 대해서만 계산한다.
    const seen = new Map<
      string,
      { assignments: AutoBalanceAssignment[]; spread: number }
    >();
    let bestSpread = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const assignments = Array.from({ length: teamCount }, () => ({
        score: 0,
        players: [] as AutoBalancePlayer[],
      }));

      for (let offset = 0; offset < rankedPlayers.length; offset += teamCount) {
        const band = this.shuffle(
          rankedPlayers.slice(offset, offset + teamCount),
        );
        const destinations = this.shuffle(assignments).sort(
          (left, right) => left.score - right.score,
        );

        for (let index = 0; index < band.length; index++) {
          destinations[index].players.push(band[index]);
          destinations[index].score += band[index].score;
        }
      }

      const signature = this.getAssignmentSignature(assignments);
      // 동일 구성은 다양성 카운트가 부풀지 않도록 건너뛴다.
      if (seen.has(signature)) continue;

      const scores = assignments.map((assignment) => assignment.score);
      const spread = Math.max(...scores) - Math.min(...scores);
      seen.set(signature, { assignments, spread });
      if (spread < bestSpread) bestSpread = spread;

      // 조기 종료: 최저 스프레드 근방 후보가 충분히 모이면 더 돌 필요 없음.
      const nearBestCount = [...seen.values()].filter(
        (candidate) => candidate.spread <= bestSpread + SPREAD_SLACK,
      ).length;
      if (nearBestCount >= MIN_DISTINCT) break;
    }

    // ── 2단계(고비용): 스프레드 근방 후보에 한해서만 역할 페널티를 계산해
    //   품질을 매기고, 최적 근방에서 랜덤으로 골라 팀 구성 다양성을 유지한다.
    const finalists = [...seen.values()]
      .filter((candidate) => candidate.spread <= bestSpread + SPREAD_SLACK)
      .map((candidate) => ({
        assignments: candidate.assignments,
        spread: candidate.spread,
        quality:
          candidate.spread +
          this.getAssignmentRolePenalty(candidate.assignments) *
            ROLE_PENALTY_WEIGHT,
      }))
      .sort((left, right) => left.quality - right.quality || left.spread - right.spread);

    const bestQuality = finalists[0].quality;
    const pool = finalists.filter(
      (candidate) => candidate.quality <= bestQuality + ROLE_PENALTY_WEIGHT,
    );
    return pool[randomInt(pool.length)].assignments;
  }

  // Transform room data to flatten participant info for frontend
  private transformRoomData(room: any) {
    if (!room) return room;

    return {
      ...room,
      participants: room.participants?.map((p: any) => ({
        id: p.id,
        userId: p.userId,
        username: p.user?.username || "Unknown",
        avatar: p.user?.avatar || null,
        isHost: p.userId === room.hostId,
        isReady: p.isReady,
        isCaptain: p.isCaptain,
        teamId: p.teamId,
        role: p.role,
        riotAccount: p.user?.riotAccounts?.[0] || null,
      })),
    };
  }

  // ========================================
  // Room Creation & Management
  // ========================================

  async createRoom(hostId: string, dto: CreateRoomDto) {
    // 서버 종료 진행 중이면 신규 방 생성 차단
    if (this.shutdownService.isShuttingDown()) {
      throw new ServiceUnavailableException(
        "서버가 점검 중입니다. 잠시 후 다시 시도해주세요.",
      );
    }

    // ========================================
    // Discord + Riot 계정 연동 필수 체크 (관리자는 면제)
    // ========================================
    const host = await this.prisma.user.findUnique({
      where: { id: hostId },
      select: { role: true },
    });
    const isAdmin = host?.role === "ADMIN";

    if (!isAdmin) {
      const discordProvider = await this.prisma.authProvider.findFirst({
        where: { userId: hostId, provider: "DISCORD" },
      });
      if (!discordProvider) {
        throw new BadRequestException(
          "DISCORD_NOT_LINKED::Discord 계정 연동이 필요합니다. 설정 페이지에서 Discord 계정을 연동해주세요.",
        );
      }

      const riotAccount = await this.prisma.riotAccount.findFirst({
        where: { userId: hostId, isPrimary: true },
      });
      if (!riotAccount) {
        throw new BadRequestException(
          "RIOT_NOT_LINKED::Riot 계정 연동이 필요합니다. 프로필 페이지에서 Riot 계정을 연동해주세요.",
        );
      }
    }

    // Validate max participants
    if (![10, 15, 20, 30, 40].includes(dto.maxParticipants)) {
      throw new BadRequestException(
        "Max participants must be 10, 15, 20, 30, or 40",
      );
    }

    // 게임 설정값 서비스 레이어 재검증 — ValidationPipe 우회 방어
    this.validateGameSettings(dto);

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (dto.password) {
      hashedPassword = await bcrypt.hash(dto.password, 10);
    }

    // null means Nexus home server; explicit guild IDs must belong to the host.
    let resolvedDiscordGuildId: string | null = null;
    if (dto.discordGuildId) {
      const activeGuildLink = await this.prisma.discordGuildLink.findFirst({
        where: {
          ownerId: hostId,
          guildId: dto.discordGuildId,
          status: "ACTIVE",
        },
        select: { guildId: true },
      });

      if (!activeGuildLink) {
        throw new BadRequestException(
          "DISCORD_GUILD_NOT_ALLOWED::선택한 Discord 서버를 사용할 수 없습니다.",
        );
      }

      resolvedDiscordGuildId = activeGuildLink.guildId;
    }

    // Create room
    const room = await this.prisma.room.create({
      data: {
        name: dto.name,
        hostId,
        password: hashedPassword,
        maxParticipants: dto.maxParticipants,
        isPrivate: !!dto.password,
        teamMode: dto.teamMode,
        allowSpectators: dto.allowSpectators ?? true,
        discordGuildId: resolvedDiscordGuildId,

        // Draft settings
        startingPoints: dto.startingPoints,
        minBidIncrement: dto.minBidIncrement,
        bidTimeLimit: dto.bidTimeLimit,
        pickTimeLimit: dto.pickTimeLimit,
        captainSelection: dto.captainSelection,
        ...(dto.bracketFormat && { bracketFormat: dto.bracketFormat }),

        participants: {
          create: {
            userId: hostId,
            role: "PLAYER",
            isReady: true,
          },
        },
      },
      include: {
        host: {
          select: {
            id: true,
            username: true,
            avatar: true,
            reputation: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                reputation: true,
              },
            },
          },
        },
      },
    });

    if (dto.teamMode === TeamMode.MANUAL_TEAM) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await this.createManualTeamSlots(
          tx,
          room.id,
          hostId,
          dto.maxParticipants,
        );
      });
    }

    // Discord 봇 연동: 팀별 음성채널 생성
    try {
      if (this.discordVoiceService) {
        const numTeams = Math.floor(dto.maxParticipants / 5);

        // 카테고리 + 내전 대기실 + 팀별 음성채널 생성
        const channelData = await this.discordVoiceService.createRoomChannels(
          room.id,
          room.name,
          numTeams,
        );

        // 룸에 Discord 카테고리 ID 저장
        await this.prisma.room.update({
          where: { id: room.id },
          data: {
            discordCategoryId: channelData.categoryId,
          },
        });
      }
    } catch (error) {
      // Discord 채널 생성 실패해도 룸 생성은 성공
      this.logger.warn("Failed to create Discord channels for room:", error);
    }

    // Send Discord notification (if bot is configured)
    try {
      if (this.discordBotService) {
        const notificationTarget =
          await this.discordVoiceService?.getRoomNotificationTarget?.(room.id);

        if (notificationTarget) {
          const embed = this.discordBotService.buildRoomCreatedEmbed(
            room.name,
            room.host.username,
            room.maxParticipants,
          );

          await this.discordBotService.sendEmbedNotification(
            notificationTarget.guildId,
            notificationTarget.channelId,
            embed,
          );
        }
      }
    } catch (error) {
      // Don't fail room creation if Discord notification fails
      this.logger.warn(
        "Failed to send Discord room creation notification:",
        error,
      );
    }

    return dto.teamMode === TeamMode.MANUAL_TEAM
      ? this.getRoomById(room.id)
      : this.transformRoomData(room);
  }

  /**
   * 방 목록용 요약 데이터 조회 (delta update 전송 시 사용)
   * listRooms()와 동일한 select 구조로 단일 방만 조회한다.
   */
  async getRoomSummary(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        host: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        participants: {
          select: {
            id: true,
            userId: true,
            role: true,
          },
        },
      },
    });
  }

  /** WAITING 상태 방과 참가자 목록 조회 (좀비 정리용) */
  async getWaitingRoomsWithParticipants() {
    return this.prisma.room.findMany({
      where: { status: RoomStatus.WAITING },
      select: {
        id: true,
        participants: {
          select: { userId: true },
        },
      },
    });
  }

  /** 방 상태만 빠르게 조회 (disconnect 등 경량 체크용) */
  async getRoomStatus(roomId: string): Promise<RoomStatus | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { status: true },
    });
    return room?.status ?? null;
  }

  async getRoomById(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        host: {
          select: {
            id: true,
            username: true,
            avatar: true,
            reputation: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
                reputation: true,
                riotAccounts: {
                  where: { isPrimary: true },
                  select: {
                    gameName: true,
                    tagLine: true,
                    tier: true,
                    rank: true,
                    lp: true,
                    peakTier: true,
                    peakRank: true,
                    mainRole: true,
                    subRole: true,
                    championPreferences: {
                      select: {
                        role: true,
                        championId: true,
                        order: true,
                      },
                      orderBy: { order: "asc" },
                      take: 15, // 역할당 3개 × 5역할 = 최대 15개로 제한
                    },
                  },
                },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        teams: {
          include: {
            captain: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
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
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    return this.transformRoomData(room);
  }

  private readonly validRoomStatuses = new Set<RoomStatus>([
    "WAITING",
    "TEAM_SELECTION",
    "DRAFT",
    "DRAFT_COMPLETED",
    "ROLE_SELECTION",
    "IN_PROGRESS",
    "COMPLETED",
  ]);
  private readonly validTeamModes = new Set<TeamMode>([
    "SNAKE_DRAFT",
    "AUCTION",
    "AUTO_BALANCE",
    "MANUAL_TEAM",
  ]);

  async listRooms(filters?: {
    status?: RoomStatus;
    teamMode?: TeamMode;
    includePrivate?: boolean;
  }) {
    try {
      const where: Record<string, unknown> = {};

      if (filters?.status && this.validRoomStatuses.has(filters.status)) {
        where.status = filters.status;
      }
      if (filters?.teamMode && this.validTeamModes.has(filters.teamMode)) {
        where.teamMode = filters.teamMode;
      }
      if (!filters?.includePrivate) {
        where.isPrivate = false;
      }

      return await this.prisma.room.findMany({
        where,
        include: {
          host: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          participants: {
            select: {
              id: true,
              userId: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error listing rooms: ${err?.message ?? String(error)}`,
        err?.stack,
      );
      throw error;
    }
  }

  // ========================================
  // Room Joining & Leaving
  // ========================================

  async joinRoom(userId: string, dto: JoinRoomDto) {
    const joinAsSpectator = dto.asSpectator === true;

    const joinedRoomId = await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: dto.roomId },
        include: {
          participants: true,
        },
      });

      if (!room) {
        throw new NotFoundException("Room not found");
      }

      if (joinAsSpectator && !room.allowSpectators) {
        throw new BadRequestException("이 방은 관전을 허용하지 않습니다.");
      }

      // 정원 체크: PLAYER만 카운트 (관전자는 정원에 포함되지 않음)
      const playerCount = room.participants.filter(
        (p: (typeof room.participants)[number]) => p.role === "PLAYER",
      ).length;
      if (!joinAsSpectator && playerCount >= room.maxParticipants) {
        throw new BadRequestException("Room is full");
      }

      if (room.status !== RoomStatus.WAITING) {
        throw new BadRequestException("Room has already started");
      }

      const existing = room.participants.find(
        (p: (typeof room.participants)[number]) => p.userId === userId,
      );
      if (existing) {
        throw new BadRequestException("Already in room");
      }

      // Verify password for private rooms
      if (room.isPrivate && room.password) {
        if (!dto.password) {
          throw new BadRequestException("Password required");
        }

        const isValid = await bcrypt.compare(dto.password, room.password);
        if (!isValid) {
          throw new BadRequestException("Invalid password");
        }
      }

      const discordProvider = await tx.authProvider.findFirst({
        where: { userId, provider: "DISCORD" },
      });

      if (!discordProvider) {
        throw new BadRequestException(
          "DISCORD_NOT_LINKED::Discord 계정 연동이 필요합니다. 설정 페이지에서 Discord 계정을 연동해주세요.",
        );
      }

      const riotAccount = await tx.riotAccount.findFirst({
        where: { userId, isPrimary: true },
      });

      if (!riotAccount) {
        throw new BadRequestException(
          "RIOT_NOT_LINKED::Riot 계정 연동이 필요합니다. 프로필 페이지에서 Riot 계정을 연동해주세요.",
        );
      }

      await tx.roomParticipant.create({
        data: {
          roomId: room.id,
          userId,
          role: joinAsSpectator ? "SPECTATOR" : "PLAYER",
        },
      });

      return room.id;
    });

    return this.getRoomById(joinedRoomId);
  }

  /** PLAYER ↔ SPECTATOR 역할 전환 */
  async toggleSpectator(userId: string, roomId: string) {
    const newRole = await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { participants: true },
      });

      if (!room) {
        throw new NotFoundException("Room not found");
      }

      if (room.status !== RoomStatus.WAITING) {
        throw new BadRequestException(
          "게임 진행 중에는 역할을 변경할 수 없습니다.",
        );
      }

      const participant = room.participants.find(
        (p: (typeof room.participants)[number]) => p.userId === userId,
      );
      if (!participant) {
        throw new BadRequestException("Not in room");
      }

      const nextRole = participant.role === "PLAYER" ? "SPECTATOR" : "PLAYER";

      if (nextRole === "PLAYER") {
        const playerCount = room.participants.filter(
          (p: (typeof room.participants)[number]) => p.role === "PLAYER",
        ).length;
        if (playerCount >= room.maxParticipants) {
          throw new BadRequestException("플레이어 정원이 가득 찼습니다.");
        }
      }

      if (nextRole === "SPECTATOR" && !room.allowSpectators) {
        throw new BadRequestException("이 방은 관전을 허용하지 않습니다.");
      }

      await tx.roomParticipant.update({
        where: { id: participant.id },
        data: {
          role: nextRole,
          isReady: false,
          ...(nextRole === "SPECTATOR" && {
            teamId: null,
            isCaptain: false,
          }),
        },
      });

      return nextRole;
    });

    return {
      userId,
      newRole,
      room: await this.getRoomById(roomId),
    };
  }

  async leaveRoom(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // Check if user is in room
    const participant = room.participants.find(
      (p: (typeof room.participants)[number]) => p.userId === userId,
    );
    if (!participant) {
      throw new BadRequestException("Not in room");
    }

    // During active game phases (not WAITING), keep participant slot so user can re-enter.
    // This prevents accidental removal during network disconnects or page navigation.
    // Exception: if only bots remain, clean up immediately.
    if (room.status !== RoomStatus.WAITING) {
      const remainingParticipants = room.participants.filter(
        (p: (typeof room.participants)[number]) => p.userId !== userId,
      );
      const allRemainingAreBots =
        remainingParticipants.length > 0 &&
        remainingParticipants.every((p: any) =>
          /^testbot_\d+$/.test(p.user?.username || ""),
        );

      if (allRemainingAreBots || remainingParticipants.length === 0) {
        if (this.discordVoiceService) {
          await this.discordVoiceService
            .deleteRoomChannels(roomId)
            .catch((e: any) => {
              this.logger.warn(
                `[Room] Discord channel cleanup failed for room ${roomId}: ${e?.message}`,
              );
            });
        }
        await this.prisma.room.delete({
          where: { id: roomId },
        });
        return { message: "Room deleted (only bots remaining)" };
      }

      const realRemaining = remainingParticipants.filter(
        (p: any) => !/^testbot_\d+$/.test(p.user?.username || ""),
      );
      if (realRemaining.length < 2) {
        this.logger.warn(
          `[Room] Room ${roomId} has only ${realRemaining.length} real participant(s) during active session (status: ${room.status}). Host may need to abort.`,
        );
      }

      // 게임 진행 중에 호스트가 명시적으로 나갈 경우, 다음 실제 유저(또는 임의 참가자)에게 호스트 이양.
      // 참가자 슬롯은 보존되지만 호스트 권한이 사라지면 방 운영(시작/강퇴/중단 등) 자체가 막힘.
      let newHostId: string | null = null;
      if (room.hostId === userId) {
        const nextHost =
          remainingParticipants.find(
            (p: any) => !/^testbot_\d+$/.test(p.user?.username || ""),
          ) ?? remainingParticipants[0];
        if (nextHost) {
          await this.prisma.room.update({
            where: { id: roomId },
            data: { hostId: nextHost.userId },
          });
          newHostId = nextHost.userId;
        }
      }

      return {
        message: "Left realtime session, participant preserved",
        preserved: true,
        remainingRealCount: realRemaining.length,
        newHostId,
      };
    }

    // Remove participant first
    await this.prisma.roomParticipant.delete({
      where: { id: participant.id },
    });

    // Check remaining participants
    const remainingCount = room.participants.length - 1;
    const remainingParticipants = room.participants.filter(
      (p: (typeof room.participants)[number]) => p.userId !== userId,
    );
    const allRemainingAreBots =
      remainingParticipants.length > 0 &&
      remainingParticipants.every((p: any) =>
        /^testbot_\d+$/.test(p.user?.username || ""),
      );

    // If no participants left, delete the room regardless of status (prevents zombie rooms)
    if (remainingCount === 0) {
      // Clean up Discord channels (category + lobby + team channels) before deleting
      if (this.discordVoiceService) {
        await this.discordVoiceService
          .deleteRoomChannels(roomId)
          .catch((e: any) => {
            this.logger.warn(
              `[Room] Discord channel cleanup failed for room ${roomId}: ${e?.message}`,
            );
          });
      }
      await this.prisma.room.delete({
        where: { id: roomId },
      });
      return { message: "Room deleted (no participants)" };
    }

    // If only bots remain, delete room immediately
    if (allRemainingAreBots) {
      if (this.discordVoiceService) {
        await this.discordVoiceService
          .deleteRoomChannels(roomId)
          .catch((e: any) => {
            this.logger.warn(
              `[Room] Discord channel cleanup failed for room ${roomId}: ${e?.message}`,
            );
          });
      }
      await this.prisma.room.delete({
        where: { id: roomId },
      });
      return { message: "Room deleted (only bots remaining)" };
    }

    // If host leaves but others remain, transfer host to next real (non-bot) participant
    if (room.hostId === userId && remainingCount > 0) {
      const nextHost =
        remainingParticipants.find(
          (p: any) => !/^testbot_\d+$/.test(p.user?.username || ""),
        ) ?? remainingParticipants[0];
      if (nextHost) {
        await this.prisma.room.update({
          where: { id: roomId },
          data: { hostId: nextHost.userId },
        });
        return { message: "Left room, host transferred" };
      }
    }

    return { message: "Left room successfully" };
  }

  /**
   * 게임 진행 중(비WAITING) 상태에서 호스트가 나갔을 때 다음 호스트로 이양.
   * 반환값: 새 호스트 userId (이양 성공), null (이양 불필요 또는 실패)
   */
  async transferActiveRoomHost(
    roomId: string,
    departingUserId: string,
  ): Promise<string | null> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: { user: { select: { username: true } } },
        },
      },
    });

    if (!room || room.hostId !== departingUserId) return null;

    const nextHost = room.participants.find(
      (p: any) =>
        p.userId !== departingUserId &&
        !/^testbot_\d+$/.test(p.user?.username || ""),
    );

    if (!nextHost) return null;

    await this.prisma.room.update({
      where: { id: roomId },
      data: { hostId: nextHost.userId },
    });

    return nextHost.userId;
  }

  // ========================================
  // Room Settings
  // ========================================

  async updateRoomSettings(
    userId: string,
    roomId: string,
    updates: Partial<CreateRoomDto>,
  ) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== userId) {
      throw new ForbiddenException("Only host can update room settings");
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Cannot update room after it has started");
    }

    // 게임 설정값 서비스 레이어 재검증 — ValidationPipe 우회 방어
    this.validateGameSettings(updates);

    const data: any = {};

    if (updates.name) {
      data.name = updates.name;
    }

    if (updates.maxParticipants) {
      if (![10, 15, 20, 30, 40].includes(updates.maxParticipants)) {
        throw new BadRequestException(
          "Max participants must be 10, 15, 20, 30, or 40",
        );
      }
      data.maxParticipants = updates.maxParticipants;
    }

    if (updates.teamMode) {
      data.teamMode = updates.teamMode;
    }

    if (updates.allowSpectators !== undefined) {
      data.allowSpectators = updates.allowSpectators;
    }

    if (updates.password !== undefined) {
      if (updates.password) {
        data.password = await bcrypt.hash(updates.password, 10);
        data.isPrivate = true;
      } else {
        data.password = null;
        data.isPrivate = false;
      }
    }

    // Auction settings
    if (updates.startingPoints !== undefined)
      data.startingPoints = updates.startingPoints;
    if (updates.minBidIncrement !== undefined)
      data.minBidIncrement = updates.minBidIncrement;
    if (updates.bidTimeLimit !== undefined)
      data.bidTimeLimit = updates.bidTimeLimit;

    // Snake draft settings
    if (updates.pickTimeLimit !== undefined)
      data.pickTimeLimit = updates.pickTimeLimit;
    if (updates.captainSelection !== undefined)
      data.captainSelection = updates.captainSelection;

    // Bracket format
    if (updates.bracketFormat !== undefined)
      data.bracketFormat = updates.bracketFormat;

    await this.prisma.room.update({
      where: { id: roomId },
      data,
    });

    const nextTeamMode = updates.teamMode ?? room.teamMode;
    const manualSetupChanged =
      (room.teamMode === TeamMode.MANUAL_TEAM ||
        nextTeamMode === TeamMode.MANUAL_TEAM) &&
      ((updates.teamMode !== undefined && updates.teamMode !== room.teamMode) ||
        (updates.maxParticipants !== undefined &&
          updates.maxParticipants !== room.maxParticipants));

    if (manualSetupChanged) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await this.clearTeamSetup(tx, roomId, true);
        if (nextTeamMode === TeamMode.MANUAL_TEAM) {
          await this.createManualTeamSlots(
            tx,
            roomId,
            room.hostId,
            updates.maxParticipants ?? room.maxParticipants,
          );
        }
      });
    }

    // Discord 봇 채널 동기화
    if (this.discordVoiceService) {
      // 인원 변경 → 팀 채널 수 조정
      if (updates.maxParticipants) {
        const newNumTeams = Math.floor(updates.maxParticipants / 5);
        this.discordVoiceService
          .updateRoomChannels(roomId, newNumTeams)
          .catch((err: Error) =>
            this.logger.warn(`Discord channel update failed: ${err.message}`),
          );
      }
      // 방 이름 변경 → 카테고리 이름 동기화
      if (updates.name) {
        this.discordVoiceService
          .updateCategoryName(roomId, updates.name)
          .catch((err: Error) =>
            this.logger.warn(
              `Discord category name update failed: ${err.message}`,
            ),
          );
      }
    }

    // getRoomById로 참가자 상세 정보(riotAccount, avatar 등) 포함된 전체 데이터 반환
    return this.getRoomById(roomId);
  }

  async kickParticipant(hostId: string, roomId: string, participantId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can kick participants");
    }

    // Prevent kick during active sessions (draft, auction, role selection, match)
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException(
        "Cannot kick participants while a session is active. Abort the session first.",
      );
    }

    const participant = await this.prisma.roomParticipant.findUnique({
      where: { id: participantId },
    });

    if (!participant || participant.roomId !== roomId) {
      throw new NotFoundException("Participant not found");
    }

    if (participant.userId === hostId) {
      throw new BadRequestException("Cannot kick yourself");
    }

    await this.prisma.roomParticipant.delete({
      where: { id: participantId },
    });

    return { message: "Participant kicked" };
  }

  // ========================================
  // Ready Status
  // ========================================

  async toggleReady(userId: string, roomId: string) {
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId },
      include: {
        room: {
          select: {
            teamMode: true,
            status: true,
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException("Not in room");
    }

    // 관전자는 레디 불가
    if (participant.role === "SPECTATOR") {
      throw new BadRequestException("관전자는 준비 상태를 변경할 수 없습니다.");
    }

    if (
      participant.room.teamMode === TeamMode.MANUAL_TEAM &&
      participant.room.status === RoomStatus.WAITING &&
      !participant.teamId &&
      !participant.isReady
    ) {
      throw new BadRequestException("팀을 선택한 뒤 준비해주세요.");
    }

    const updated = await this.prisma.roomParticipant.update({
      where: { id: participant.id },
      data: { isReady: !participant.isReady },
    });

    return updated;
  }

  async checkAllReady(roomId: string): Promise<boolean> {
    const participants = await this.prisma.roomParticipant.findMany({
      where: { roomId, role: "PLAYER" },
    });

    return (
      participants.length > 0 &&
      participants.every((p: (typeof participants)[number]) => p.isReady)
    );
  }

  async selectManualTeam(
    userId: string,
    roomId: string,
    teamId: string | null,
  ) {
    await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: { teams: true },
      });
      if (!room) {
        throw new NotFoundException("Room not found");
      }
      if (
        room.teamMode !== TeamMode.MANUAL_TEAM ||
        room.status !== RoomStatus.WAITING
      ) {
        throw new BadRequestException(
          "자유 팀 선택 모드의 대기실에서만 팀을 이동할 수 있습니다.",
        );
      }

      const participant = await tx.roomParticipant.findFirst({
        where: { roomId, userId },
      });
      if (!participant || participant.role !== "PLAYER") {
        throw new BadRequestException("플레이어만 팀을 선택할 수 있습니다.");
      }

      if (teamId) {
        if (!room.teams.some((team) => team.id === teamId)) {
          throw new BadRequestException("유효하지 않은 팀입니다.");
        }
        if (participant.teamId !== teamId) {
          const memberCount = await tx.roomParticipant.count({
            where: { roomId, teamId, role: "PLAYER" },
          });
          if (memberCount >= 5) {
            throw new BadRequestException("선택한 팀은 이미 가득 찼습니다.");
          }
        }
      }

      await tx.roomParticipant.update({
        where: { id: participant.id },
        data: { teamId, isCaptain: false, isReady: false },
      });
    });

    return this.getRoomById(roomId);
  }

  async createAutoBalancedTeams(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: {
            user: {
              include: {
                riotAccounts: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!room) {
      throw new NotFoundException("Room not found");
    }
    if (room.hostId !== hostId || room.teamMode !== TeamMode.AUTO_BALANCE) {
      throw new ForbiddenException("자동 밸런스 팀 구성을 시작할 수 없습니다.");
    }
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Room has already started");
    }
    if (room.participants.length !== room.maxParticipants) {
      throw new BadRequestException(
        "자동 밸런스 모드는 모든 팀 자리가 채워져야 시작할 수 있습니다.",
      );
    }

    const configuredTeamCount = Math.floor(room.maxParticipants / 5);
    const teamCount = configuredTeamCount;
    const rankedPlayers = room.participants
      .map((participant) => {
        const account = participant.user.riotAccounts[0];
        return {
          participant,
          score: calculateTierScore(
            account?.tier || "UNRANKED",
            account?.rank || "",
            account?.lp || 0,
          ),
          mainRole: account?.mainRole ?? null,
          subRole: account?.subRole ?? null,
        };
      })
      .sort((a, b) => b.score - a.score);
    const assignments = this.chooseAutoBalancedAssignments(
      rankedPlayers,
      teamCount,
    );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.clearTeamSetup(tx, roomId);
      for (let index = 0; index < assignments.length; index++) {
        const assignment = assignments[index];
        const captain = assignment.players[0]?.participant;
        if (!captain) continue;
        const team = await tx.team.create({
          data: {
            roomId,
            captainId: captain.userId,
            name: `Team ${index + 1}`,
            color: this.teamColors[index % this.teamColors.length],
          },
        });
        await tx.roomParticipant.updateMany({
          where: {
            roomId,
            userId: { in: assignment.players.map((p) => p.participant.userId) },
          },
          data: { teamId: team.id },
        });
        await tx.roomParticipant.updateMany({
          where: { roomId, userId: captain.userId },
          data: { isCaptain: true },
        });
        await tx.teamMember.createMany({
          data: assignment.players.map((player) => ({
            teamId: team.id,
            userId: player.participant.userId,
          })),
        });
      }
      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DRAFT_COMPLETED },
      });
    });

    await this.moveAssignedTeamsToVoice(roomId);
    return this.getRoomById(roomId);
  }

  async finalizeManualTeams(hostId: string, roomId: string) {
    await this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          participants: { where: { role: "PLAYER" } },
          teams: true,
        },
      });
      if (!room) {
        throw new NotFoundException("Room not found");
      }
      if (room.hostId !== hostId || room.teamMode !== TeamMode.MANUAL_TEAM) {
        throw new ForbiddenException("자유 팀 구성을 확정할 수 없습니다.");
      }
      if (room.status !== RoomStatus.WAITING) {
        throw new BadRequestException("Room has already started");
      }
      if (room.participants.length !== room.maxParticipants) {
        throw new BadRequestException(
          "자유 팀 선택 모드는 모든 팀 자리가 채워져야 시작할 수 있습니다.",
        );
      }
      if (room.participants.some((participant) => !participant.teamId)) {
        throw new BadRequestException(
          "모든 플레이어가 팀을 선택한 뒤 시작해주세요.",
        );
      }

      const teamsWithPlayers = room.teams
        .map((team) => ({
          team,
          players: room.participants.filter(
            (participant) => participant.teamId === team.id,
          ),
        }))
        .filter((entry) => entry.players.length > 0);
      if (
        teamsWithPlayers.length !== room.teams.length ||
        teamsWithPlayers.some((entry) => entry.players.length !== 5)
      ) {
        throw new BadRequestException(
          "모든 팀에 플레이어 5명씩 배정한 뒤 시작해주세요.",
        );
      }

      await tx.roomParticipant.updateMany({
        where: { roomId },
        data: { isCaptain: false },
      });
      const usedTeamIds = teamsWithPlayers.map((entry) => entry.team.id);
      await tx.team.deleteMany({
        where: { roomId, id: { notIn: usedTeamIds } },
      });
      for (const entry of teamsWithPlayers) {
        const captain =
          entry.players.find((player) => player.userId === hostId) ??
          entry.players[0];
        await tx.team.update({
          where: { id: entry.team.id },
          data: { captainId: captain.userId },
        });
        await tx.roomParticipant.update({
          where: { id: captain.id },
          data: { isCaptain: true },
        });
        await tx.teamMember.createMany({
          data: entry.players.map((player) => ({
            teamId: entry.team.id,
            userId: player.userId,
          })),
        });
      }
      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DRAFT_COMPLETED },
      });
    });

    await this.moveAssignedTeamsToVoice(roomId);
    return this.getRoomById(roomId);
  }

  private async moveAssignedTeamsToVoice(roomId: string) {
    if (!this.discordVoiceService) return;
    try {
      await this.discordVoiceService.handleTeamAssignment(roomId);
    } catch (error) {
      this.logger.warn(
        `Discord team voice assignment failed for room ${roomId}: ${String(error)}`,
      );
    }
  }

  // ========================================
  // Game Start
  // ========================================

  async startGame(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can start the game");
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Room has already started");
    }

    // Check if all players are ready
    const allReady = room.participants.every(
      (p: (typeof room.participants)[number]) => p.isReady,
    );
    if (!allReady) {
      throw new BadRequestException("Not all players are ready");
    }

    // Minimum 2 players required
    if (room.participants.length < 2) {
      throw new BadRequestException("At least 2 players required to start");
    }

    if (
      (room.teamMode === TeamMode.AUTO_BALANCE ||
        room.teamMode === TeamMode.MANUAL_TEAM) &&
      room.participants.length !== room.maxParticipants
    ) {
      throw new BadRequestException(
        "이 모드는 모든 팀 자리가 채워져야 시작할 수 있습니다.",
      );
    }

    if (room.teamMode === TeamMode.MANUAL_TEAM) {
      if (room.participants.some((participant) => !participant.teamId)) {
        throw new BadRequestException(
          "모든 플레이어가 팀을 선택한 뒤 시작해주세요.",
        );
      }
      if (
        new Set(room.participants.map((participant) => participant.teamId))
          .size < 2
      ) {
        throw new BadRequestException("최소 두 팀에 플레이어가 있어야 합니다.");
      }
    }

    if (this.discordVoiceService) {
      const voiceValidation =
        await this.discordVoiceService.validateVoicePresence(roomId);
      if (!voiceValidation.valid) {
        const missing = voiceValidation.missingUsernames.join(", ");
        throw new BadRequestException({
          message: `음성채널 미참가 유저가 있습니다: ${missing}`,
          missingVoiceUsers: voiceValidation.missingUsernames,
        });
      }
    }

    // Mark game as started (actual status transition to DRAFT/TEAM_SELECTION
    // is handled by the specific module: snake-draft or auction service)
    await this.prisma.room.update({
      where: { id: roomId },
      data: {
        startedAt: new Date(),
      },
    });

    return {
      success: true,
      roomId,
      teamMode: room.teamMode,
    };
  }

  // ========================================
  // Chat Messages
  // ========================================

  async getChatMessages(roomId: string, limit = 50, offset = 0) {
    return this.prisma.chatMessage.findMany({
      where: { roomId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async rollbackToWaiting(roomId: string) {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const room = await tx.room.findUnique({ where: { id: roomId } });
      await this.clearTeamSetup(tx, roomId, true);
      if (room?.teamMode === TeamMode.MANUAL_TEAM) {
        await this.createManualTeamSlots(
          tx,
          roomId,
          room.hostId,
          room.maxParticipants,
        );
      }

      await tx.room.update({
        where: { id: roomId },
        data: {
          status: RoomStatus.WAITING,
          startedAt: null,
        },
      });
    });
  }

  async sendChatMessage(userId: string, roomId: string, content: string) {
    // Check if user is in room
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId },
    });

    if (!participant) {
      throw new ForbiddenException("Not in room");
    }

    // Validate message
    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Message cannot be empty");
    }

    if (content.length > 500) {
      throw new BadRequestException("Message too long (max 500 characters)");
    }

    // 방 이름 조회 (방 삭제 후에도 기록 식별용)
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { name: true },
    });

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        roomName: room?.name,
        userId,
        content: content.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    // Transform for frontend - flatten user data
    return {
      id: message.id,
      userId: message.userId,
      username: message.user?.username || "Unknown",
      avatar: message.user?.avatar || null,
      message: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  // ========================================
  // Close Room (host explicit close)
  // ========================================

  /** 참여자 여부 확인 — 컨트롤러/게이트웨이에서 재사용 가능한 공용 헬퍼 */
  async assertParticipant(userId: string, roomId: string) {
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { userId, roomId },
      select: { id: true },
    });
    if (!participant) {
      throw new ForbiddenException("방 참여자만 이 작업을 수행할 수 있습니다.");
    }
  }

  /** 호스트 여부 확인 — 컨트롤러에서 재사용 가능한 공용 헬퍼 */
  async assertHost(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) {
      throw new NotFoundException("Room not found");
    }
    if (room.hostId !== userId) {
      throw new ForbiddenException("호스트만 이 작업을 수행할 수 있습니다.");
    }
  }

  async closeRoom(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can close the room");
    }

    // Clean up Discord channels (Discord auto-removes users from deleted channels)
    if (this.discordVoiceService) {
      await this.discordVoiceService
        .deleteRoomChannels(roomId)
        .catch((e: any) => {
          this.logger.warn(
            `[Room] Discord channel cleanup failed for room ${roomId}: ${e?.message}`,
          );
        });
    }

    // 참가자 삭제 + 방 삭제를 원자적으로 처리 (chat messages preserved via onDelete: SetNull)
    await this.prisma.$transaction([
      this.prisma.roomParticipant.deleteMany({ where: { roomId } }),
      this.prisma.room.delete({ where: { id: roomId } }),
    ]);
    return { message: "Room closed" };
  }

  /**
   * 토너먼트 완료(COMPLETED) 후 방 상태를 WAITING으로 리셋하여 로비로 복귀시킨다.
   * abortActiveSession과 달리 호스트가 아니어도 호출 가능하며,
   * COMPLETED 상태에서만 동작한다.
   */
  async returnToLobby(requesterId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: true,
        teams: {
          include: {
            captain: {
              include: {
                authProviders: {
                  where: { provider: "DISCORD" },
                  select: { providerId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // COMPLETED 상태에서만 로비 복귀 허용
    if (room.status !== RoomStatus.COMPLETED) {
      throw new BadRequestException(
        `Room is not in COMPLETED state (current: ${room.status}). Use abort-to-lobby for active sessions.`,
      );
    }

    // 호스트만 로비 복귀 가능
    if (room.hostId !== requesterId) {
      throw new ForbiddenException("호스트만 로비로 복귀시킬 수 있습니다.");
    }

    // Discord 팀장 역할 정리용
    const captainDiscordIds = room.teams
      .map(
        (team: (typeof room.teams)[number]) =>
          team.captain.authProviders[0]?.providerId,
      )
      .filter((providerId: string | undefined): providerId is string =>
        Boolean(providerId),
      );

    // 트랜잭션으로 방 상태를 WAITING으로 리셋
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 참가자 팀 배정 해제 및 레디 상태 초기화
      await tx.roomParticipant.updateMany({
        where: { roomId },
        data: {
          teamId: null,
          isCaptain: false,
          isReady: false,
        },
      });

      // 매치 데이터 삭제 (전적은 MatchParticipant에 이미 기록됨)
      await tx.match.deleteMany({
        where: { roomId },
      });

      // 드래프트/경매 데이터 삭제
      await tx.snakeDraftPick.deleteMany({
        where: { roomId },
      });

      await tx.auctionBid.deleteMany({
        where: { roomId },
      });

      // 팀 삭제
      await tx.team.deleteMany({
        where: { roomId },
      });

      if (room.teamMode === TeamMode.MANUAL_TEAM) {
        await this.createManualTeamSlots(
          tx,
          roomId,
          room.hostId,
          room.maxParticipants,
        );
      }

      // 방 상태를 WAITING으로 리셋
      await tx.room.update({
        where: { id: roomId },
        data: {
          status: RoomStatus.WAITING,
          startedAt: null,
          completedAt: null,
        },
      });
    });

    // Discord 팀장 역할 해제 및 로비 채널로 이동
    try {
      if (this.discordVoiceService) {
        await Promise.all(
          captainDiscordIds.map((providerId: string) =>
            this.discordVoiceService.removeCaptainRole(roomId, providerId),
          ),
        );
        await this.discordVoiceService.moveAllToLobby(roomId);
      }
    } catch (error) {
      this.logger.warn(
        "Failed to clean up Discord state after return to lobby:",
        error,
      );
    }

    this.logger.log(
      `Room returned to lobby after completion: roomId=${roomId}, requestedBy=${requesterId}`,
    );

    const updatedRoom = await this.getRoomById(roomId);
    return {
      message: "Room returned to lobby after tournament completion",
      room: updatedRoom,
    };
  }

  async abortActiveSession(requesterId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                username: true,
              },
            },
          },
        },
        teams: {
          include: {
            captain: {
              include: {
                authProviders: {
                  where: { provider: "DISCORD" },
                  select: { providerId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.status === RoomStatus.WAITING) {
      throw new BadRequestException("Room is already in lobby state");
    }

    // COMPLETED rooms can also return to lobby for reuse

    if (room.hostId !== requesterId) {
      throw new ForbiddenException(
        "Only the room host can abort the active session",
      );
    }

    const captainDiscordIds = room.teams
      .map(
        (team: (typeof room.teams)[number]) =>
          team.captain.authProviders[0]?.providerId,
      )
      .filter((providerId: string | undefined): providerId is string =>
        Boolean(providerId),
      );

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.roomParticipant.updateMany({
        where: { roomId },
        data: {
          teamId: null,
          isCaptain: false,
          isReady: false,
        },
      });

      await tx.match.deleteMany({
        where: { roomId },
      });

      await tx.snakeDraftPick.deleteMany({
        where: { roomId },
      });

      await tx.auctionBid.deleteMany({
        where: { roomId },
      });

      await tx.team.deleteMany({
        where: { roomId },
      });

      if (room.teamMode === TeamMode.MANUAL_TEAM) {
        await this.createManualTeamSlots(
          tx,
          roomId,
          room.hostId,
          room.maxParticipants,
        );
      }

      await tx.room.update({
        where: { id: roomId },
        data: {
          status: RoomStatus.WAITING,
          startedAt: null,
          completedAt: null,
        },
      });
    });

    try {
      if (this.discordVoiceService) {
        await Promise.all(
          captainDiscordIds.map((providerId: string) =>
            this.discordVoiceService.removeCaptainRole(roomId, providerId),
          ),
        );
        await this.discordVoiceService.moveAllToLobby(roomId);
      }
    } catch (error) {
      this.logger.warn(
        "Failed to clean up Discord state after session abort:",
        error,
      );
    }

    this.logger.warn(
      `Room session aborted: roomId=${roomId}, previousStatus=${room.status}, abortedBy=${requesterId}`,
    );

    const updatedRoom = await this.getRoomById(roomId);
    return {
      message: "Session aborted and room returned to lobby",
      room: updatedRoom,
    };
  }

  // ========================================
  // 내부 검증 헬퍼
  // ========================================

  /**
   * 방 생성/수정 시 게임 설정값의 허용 범위를 서비스 레이어에서 재검증한다.
   * DTO의 ValidationPipe가 우회되는 경우를 대비한 이중 방어선.
   */
  private validateGameSettings(
    dto: Partial<{
      bidTimeLimit?: number;
      pickTimeLimit?: number;
      startingPoints?: number;
      minBidIncrement?: number;
    }>,
  ): void {
    if (dto.bidTimeLimit !== undefined) {
      if (dto.bidTimeLimit < 5 || dto.bidTimeLimit > 120) {
        throw new BadRequestException(
          "bidTimeLimit은 5~120초 사이여야 합니다.",
        );
      }
    }
    if (dto.pickTimeLimit !== undefined) {
      if (dto.pickTimeLimit < 5 || dto.pickTimeLimit > 300) {
        throw new BadRequestException(
          "pickTimeLimit은 5~300초 사이여야 합니다.",
        );
      }
    }
    if (dto.startingPoints !== undefined) {
      if (dto.startingPoints < 100 || dto.startingPoints > 100000) {
        throw new BadRequestException(
          "startingPoints는 100~100,000 사이여야 합니다.",
        );
      }
    }
    if (dto.minBidIncrement !== undefined) {
      if (dto.minBidIncrement < 10 || dto.minBidIncrement > 10000) {
        throw new BadRequestException(
          "minBidIncrement는 10~10,000 사이여야 합니다.",
        );
      }
    }
  }
}
