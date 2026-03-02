import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Inject,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import {
  RoomStatus,
  TeamMode,
  TeamCaptainSelection,
  BracketType,
} from "@nexus/database";
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
}

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private discordBotService: any; // DiscordBotService (optional dependency)
  private discordVoiceService: any; // DiscordVoiceService (optional dependency)

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
      this.logger.warn("Failed to send Discord room creation notification:", error);
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
  private readonly validTeamModes = new Set<TeamMode>(["SNAKE_DRAFT", "AUCTION"]);

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

    // Check if room is full
    if (room.participants.length >= room.maxParticipants) {
      throw new BadRequestException("Room is full");
    }

    // Check if room has started
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Room has already started");
    }

    // Check if user is already in room
    const existing = room.participants.find((p) => p.userId === userId);
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

    // Add participant
    await this.prisma.roomParticipant.create({
      data: {
        roomId: room.id,
        userId,
        role: "PLAYER",
      },
    });

    return this.getRoomById(room.id);
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
    const participant = room.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new BadRequestException("Not in room");
    }

    // During active game phases (not WAITING), keep participant slot so user can re-enter.
    // This prevents accidental removal during network disconnects or page navigation.
    // Exception: if only bots remain, clean up immediately.
    if (room.status !== RoomStatus.WAITING) {
      const remainingParticipants = room.participants.filter(
        (p) => p.userId !== userId,
      );
      const allRemainingAreBots =
        remainingParticipants.length > 0 &&
        remainingParticipants.every((p: any) =>
          /^testbot_\d+$/.test(p.user?.username || ""),
        );

      if (allRemainingAreBots || remainingParticipants.length === 0) {
        if (this.discordVoiceService) {
          await this.discordVoiceService.deleteRoomChannels(roomId).catch(() => {});
        }
        await this.prisma.room.delete({
          where: { id: roomId },
        });
        return { message: "Room deleted (only bots remaining)" };
      }

      return { message: "Left realtime session, participant preserved" };
    }

    // Remove participant first
    await this.prisma.roomParticipant.delete({
      where: { id: participant.id },
    });

    // Check remaining participants
    const remainingCount = room.participants.length - 1;
    const remainingParticipants = room.participants.filter(
      (p) => p.userId !== userId,
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
        await this.discordVoiceService.deleteRoomChannels(roomId).catch(() => {});
      }
      await this.prisma.room.delete({
        where: { id: roomId },
      });
      return { message: "Room deleted (no participants)" };
    }

    // If only bots remain, delete room immediately
    if (allRemainingAreBots) {
      if (this.discordVoiceService) {
        await this.discordVoiceService.deleteRoomChannels(roomId).catch(() => {});
      }
      await this.prisma.room.delete({
        where: { id: roomId },
      });
      return { message: "Room deleted (only bots remaining)" };
    }

    // If host leaves but others remain, transfer host to next participant
    if (room.hostId === userId && remainingCount > 0) {
      const nextHost = room.participants.find((p) => p.userId !== userId);
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
        this.discordVoiceService.updateRoomChannels(roomId, newNumTeams).catch(
          (err: Error) => this.logger.warn(`Discord channel update failed: ${err.message}`),
        );
      }
      // 방 이름 변경 → 카테고리 이름 동기화
      if (updates.name) {
        this.discordVoiceService.updateCategoryName(roomId, updates.name).catch(
          (err: Error) => this.logger.warn(`Discord category name update failed: ${err.message}`),
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

    return participants.length > 0 && participants.every((p) => p.isReady);
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
    const allReady = room.participants.every((p) => p.isReady);
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
    await this.prisma.$transaction(async (tx) => {
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
      await this.discordVoiceService.deleteRoomChannels(roomId).catch(() => {});
    }

    // Delete room data (chat messages preserved via onDelete: SetNull)
    await this.prisma.roomParticipant.deleteMany({ where: { roomId } });
    await this.prisma.room.delete({ where: { id: roomId } });

    return { message: "Room closed" };
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
      .map((team) => team.captain.authProviders[0]?.providerId)
      .filter((providerId): providerId is string => Boolean(providerId));

    await this.prisma.$transaction(async (tx) => {
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
          captainDiscordIds.map((providerId) =>
            this.discordVoiceService.removeCaptainRole(providerId),
          ),
        );
        await this.discordVoiceService.moveAllToLobby(roomId);
      }
    } catch (error) {
      this.logger.warn("Failed to clean up Discord state after session abort:", error);
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
