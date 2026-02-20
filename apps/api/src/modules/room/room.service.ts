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
        participants: true,
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

    // Remove participant first
    await this.prisma.roomParticipant.delete({
      where: { id: participant.id },
    });

    // Check remaining participants
    const remainingCount = room.participants.length - 1;

    // If no participants left, delete the room regardless of status (prevents zombie rooms)
    if (remainingCount === 0) {
      // Clean up Discord channels (category + lobby + team channels) before deleting
      if (this.discordVoiceService) {
        await this.discordVoiceService.deleteRoomChannels(roomId).catch(() => {});
      }
      await this.prisma.chatMessage.deleteMany({
        where: { roomId },
      });
      await this.prisma.room.delete({
        where: { id: roomId },
      });
      return { message: "Room deleted (no participants)" };
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

    const updatedRoom = await this.prisma.room.update({
      where: { id: roomId },
      data,
      include: {
        host: true,
        participants: {
          include: {
            user: true,
          },
        },
      },
    });

    // If maxParticipants changed, sync Discord team channels
    if (updates.maxParticipants && this.discordVoiceService) {
      const newNumTeams = Math.floor(updates.maxParticipants / 5);
      this.discordVoiceService.updateRoomChannels(roomId, newNumTeams).catch(
        (err: Error) => this.logger.warn(`Discord channel update failed: ${err.message}`),
      );
    }

    return updatedRoom;
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

    // Update room status
    await this.prisma.room.update({
      where: { id: roomId },
      data: {
        status: RoomStatus.IN_PROGRESS,
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

    // Delete all DB data for this room
    await this.prisma.chatMessage.deleteMany({ where: { roomId } });
    await this.prisma.roomParticipant.deleteMany({ where: { roomId } });
    await this.prisma.room.delete({ where: { id: roomId } });

    return { message: "Room closed" };
  }
}
