import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, TeamMode } from "@nexus/database";
import * as bcrypt from "bcrypt";

export interface CreateRoomDto {
  name: string;
  password?: string;
  maxParticipants: number; // 10, 15, 20
  teamMode: TeamMode;
  allowSpectators?: boolean;
  discordGuildId?: string;
}

export interface JoinRoomDto {
  roomId: string;
  password?: string;
}

@Injectable()
export class RoomService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // Room Creation & Management
  // ========================================

  async createRoom(hostId: string, dto: CreateRoomDto) {
    // Validate max participants
    if (![10, 15, 20].includes(dto.maxParticipants)) {
      throw new BadRequestException(
        "Max participants must be 10, 15, or 20",
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

    return room;
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

    return room;
  }

  async listRooms(filters?: {
    status?: RoomStatus;
    teamMode?: TeamMode;
    includePrivate?: boolean;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.teamMode) {
      where.teamMode = filters.teamMode;
    }

    if (!filters?.includePrivate) {
      where.isPrivate = false;
    }

    return this.prisma.room.findMany({
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

    // If host leaves, mark room as completed (cancelled)
    if (room.hostId === userId) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.COMPLETED },
      });
      return { message: "Room cancelled" };
    }

    // Remove participant
    await this.prisma.roomParticipant.delete({
      where: { id: participant.id },
    });

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
      if (![10, 15, 20].includes(updates.maxParticipants)) {
        throw new BadRequestException(
          "Max participants must be 10, 15, or 20",
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

    return this.prisma.room.update({
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

    return this.prisma.chatMessage.create({
      data: {
        roomId,
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
  }
}
