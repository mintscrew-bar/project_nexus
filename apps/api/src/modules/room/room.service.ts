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

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (dto.password) {
      hashedPassword = await bcrypt.hash(dto.password, 10);
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
        discordGuildId: dto.discordGuildId,

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
        const guildId = this.configService.get("DISCORD_GUILD_ID");
        const channelId = this.configService.get(
          "DISCORD_NOTIFICATION_CHANNEL_ID",
        );

        if (guildId && channelId) {
          const embed = this.discordBotService.buildRoomCreatedEmbed(
            room.name,
            room.host.username,
            room.maxParticipants,
          );

          await this.discordBotService.sendEmbedNotification(
            guildId,
            channelId,
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

    return this.transformRoomData(room);
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
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
      include: {
        participants: true,
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // 관전자 입장 요청 시 allowSpectators 체크
    const joinAsSpectator = dto.asSpectator === true;
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

    // Check if room has started
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Room has already started");
    }

    // Check if user is already in room
    const existing = room.participants.find((p: (typeof room.participants)[number]) => p.userId === userId);
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

    // ========================================
    // Check Discord + Riot account linking (REQUIRED)
    // ========================================

    // Check Discord account (required for voice channel auto-move)
    const discordProvider = await this.prisma.authProvider.findFirst({
      where: { userId, provider: "DISCORD" },
    });

    if (!discordProvider) {
      throw new BadRequestException(
        "DISCORD_NOT_LINKED::Discord 계정 연동이 필요합니다. 설정 페이지에서 Discord 계정을 연동해주세요.",
      );
    }

    // Check Riot account (required for match participation)
    const riotAccount = await this.prisma.riotAccount.findFirst({
      where: { userId, isPrimary: true },
    });

    if (!riotAccount) {
      throw new BadRequestException(
        "RIOT_NOT_LINKED::Riot 계정 연동이 필요합니다. 프로필 페이지에서 Riot 계정을 연동해주세요.",
      );
    }

    // 참가자 추가 (관전자 또는 플레이어)
    await this.prisma.roomParticipant.create({
      data: {
        roomId: room.id,
        userId,
        role: joinAsSpectator ? "SPECTATOR" : "PLAYER",
      },
    });

    return this.getRoomById(room.id);
  }

  /** PLAYER ↔ SPECTATOR 역할 전환 */
  async toggleSpectator(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // WAITING 상태에서만 전환 가능
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException(
        "게임 진행 중에는 역할을 변경할 수 없습니다.",
      );
    }

    const participant = room.participants.find((p: (typeof room.participants)[number]) => p.userId === userId);
    if (!participant) {
      throw new BadRequestException("Not in room");
    }

    const newRole =
      participant.role === "PLAYER" ? "SPECTATOR" : "PLAYER";

    // SPECTATOR → PLAYER 전환 시 정원 체크
    if (newRole === "PLAYER") {
      const playerCount = room.participants.filter(
        (p: (typeof room.participants)[number]) => p.role === "PLAYER",
      ).length;
      if (playerCount >= room.maxParticipants) {
        throw new BadRequestException(
          "플레이어 정원이 가득 찼습니다.",
        );
      }
    }

    // PLAYER → SPECTATOR 전환 시 관전 허용 체크
    if (newRole === "SPECTATOR" && !room.allowSpectators) {
      throw new BadRequestException("이 방은 관전을 허용하지 않습니다.");
    }

    await this.prisma.roomParticipant.update({
      where: { id: participant.id },
      data: { role: newRole, isReady: false },
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
    const participant = room.participants.find((p: (typeof room.participants)[number]) => p.userId === userId);
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

      return {
        message: "Left realtime session, participant preserved",
        remainingRealCount: realRemaining.length,
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
    });

    if (!participant) {
      throw new NotFoundException("Not in room");
    }

    // 관전자는 레디 불가
    if (participant.role === "SPECTATOR") {
      throw new BadRequestException("관전자는 준비 상태를 변경할 수 없습니다.");
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

    return participants.length > 0 && participants.every((p: (typeof participants)[number]) => p.isReady);
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
    const allReady = room.participants.every((p: (typeof room.participants)[number]) => p.isReady);
    if (!allReady) {
      throw new BadRequestException("Not all players are ready");
    }

    // Minimum 2 players required
    if (room.participants.length < 2) {
      throw new BadRequestException("At least 2 players required to start");
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

  async getChatMessages(roomId: string, limit = 50) {
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
    });
  }

  async rollbackToWaiting(roomId: string) {
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.roomParticipant.updateMany({
        where: { roomId },
        data: { teamId: null, isCaptain: false, isReady: false },
      });

      await tx.snakeDraftPick.deleteMany({ where: { roomId } });
      await tx.auctionBid.deleteMany({ where: { roomId } });
      await tx.team.deleteMany({ where: { roomId } });

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
      throw new ForbiddenException(
        "호스트만 로비로 복귀시킬 수 있습니다.",
      );
    }

    // Discord 팀장 역할 정리용
    const captainDiscordIds = room.teams
      .map((team: (typeof room.teams)[number]) => team.captain.authProviders[0]?.providerId)
      .filter((providerId: string | undefined): providerId is string => Boolean(providerId));

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
            this.discordVoiceService.removeCaptainRole(providerId),
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
      .map((team: (typeof room.teams)[number]) => team.captain.authProviders[0]?.providerId)
      .filter((providerId: string | undefined): providerId is string => Boolean(providerId));

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
            this.discordVoiceService.removeCaptainRole(providerId),
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
}
