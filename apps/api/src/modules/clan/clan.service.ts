import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClanRole } from "@nexus/database";

export interface CreateClanDto {
  name: string;
  tag: string; // 2-5 characters, unique
  description?: string;
  isRecruiting: boolean;
  minTier?: string;
  discord?: string;
}

export interface UpdateClanDto {
  name?: string;
  description?: string;
  isRecruiting?: boolean;
  minTier?: string;
  discord?: string;
}

export interface InviteMemberDto {
  userId: string;
}

@Injectable()
export class ClanService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // Clan CRUD
  // ========================================

  async createClan(ownerId: string, dto: CreateClanDto) {
    // Check if user is already in a clan
    const existingMembership = await this.prisma.clanMember.findFirst({
      where: { userId: ownerId },
    });

    if (existingMembership) {
      throw new ConflictException("You are already in a clan");
    }

    // Check if tag is already taken
    const existingTag = await this.prisma.clan.findUnique({
      where: { tag: dto.tag.toUpperCase() },
    });

    if (existingTag) {
      throw new ConflictException("Clan tag already taken");
    }

    // Validate tag format (2-5 characters, alphanumeric)
    if (!/^[A-Z0-9]{2,5}$/.test(dto.tag.toUpperCase())) {
      throw new BadRequestException("Tag must be 2-5 alphanumeric characters");
    }

    // Create clan with owner as first member
    const clan = await this.prisma.clan.create({
      data: {
        name: dto.name,
        tag: dto.tag.toUpperCase(),
        description: dto.description,
        ownerId,
        isRecruiting: dto.isRecruiting,
        minTier: dto.minTier,
        discord: dto.discord,
        members: {
          create: {
            userId: ownerId,
            role: ClanRole.OWNER,
          },
        },
      },
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
                    tier: true,
                    rank: true,
                  },
                },
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    return clan;
  }

  async getClanById(clanId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
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
          orderBy: { joinedAt: "asc" },
        },
        owner: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    return clan;
  }

  async listClans(filters?: {
    search?: string;
    isRecruiting?: boolean;
    minTier?: string;
  }) {
    const where: any = {};

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { tag: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters?.isRecruiting !== undefined) {
      where.isRecruiting = filters.isRecruiting;
    }

    if (filters?.minTier) {
      where.minTier = filters.minTier;
    }

    return this.prisma.clan.findMany({
      where,
      include: {
        members: {
          select: {
            id: true,
            role: true,
          },
        },
        owner: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateClan(userId: string, clanId: string, dto: UpdateClanDto) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: {
        members: {
          where: { userId },
        },
      },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    const member = clan.members[0];

    if (
      !member ||
      (member.role !== ClanRole.OWNER && member.role !== ClanRole.OFFICER)
    ) {
      throw new ForbiddenException(
        "Only clan owner or officers can update clan",
      );
    }

    return this.prisma.clan.update({
      where: { id: clanId },
      data: dto,
    });
  }

  async deleteClan(userId: string, clanId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    if (clan.ownerId !== userId) {
      throw new ForbiddenException("Only clan owner can delete clan");
    }

    await this.prisma.clan.delete({
      where: { id: clanId },
    });

    return { message: "Clan deleted successfully" };
  }

  // ========================================
  // Member Management
  // ========================================

  async joinClan(userId: string, clanId: string) {
    // Check if user is already in a clan
    const existingMembership = await this.prisma.clanMember.findFirst({
      where: { userId },
    });

    if (existingMembership) {
      throw new ConflictException("You are already in a clan");
    }

    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    if (!clan.isRecruiting) {
      throw new BadRequestException("Clan is not recruiting");
    }

    // Add user to clan
    const membership = await this.prisma.clanMember.create({
      data: {
        clanId,
        userId,
        role: ClanRole.MEMBER,
        joinedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        clan: true,
      },
    });

    return membership;
  }

  async leaveClan(userId: string, clanId: string) {
    const membership = await this.prisma.clanMember.findFirst({
      where: {
        userId,
        clanId,
      },
      include: {
        clan: true,
      },
    });

    if (!membership) {
      throw new NotFoundException("You are not a member of this clan");
    }

    if (membership.role === ClanRole.OWNER) {
      throw new BadRequestException(
        "Owner cannot leave clan. Transfer ownership or delete the clan.",
      );
    }

    await this.prisma.clanMember.delete({
      where: { id: membership.id },
    });

    return { message: "Left clan successfully" };
  }

  async kickMember(userId: string, clanId: string, targetUserId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: {
        members: {
          where: { userId },
        },
      },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    const member = clan.members[0];

    if (
      !member ||
      (member.role !== ClanRole.OWNER && member.role !== ClanRole.OFFICER)
    ) {
      throw new ForbiddenException("Only owner or officers can kick members");
    }

    const targetMember = await this.prisma.clanMember.findFirst({
      where: {
        userId: targetUserId,
        clanId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException("Target user is not a member");
    }

    if (targetMember.role === ClanRole.OWNER) {
      throw new BadRequestException("Cannot kick clan owner");
    }

    // Officers can only kick members, not other officers
    if (
      member.role === ClanRole.OFFICER &&
      targetMember.role === ClanRole.OFFICER
    ) {
      throw new ForbiddenException("Officers cannot kick other officers");
    }

    await this.prisma.clanMember.delete({
      where: { id: targetMember.id },
    });

    return {
      message: "Member kicked successfully",
      kickedUser: targetMember.user,
    };
  }

  async promoteMember(
    userId: string,
    clanId: string,
    targetUserId: string,
    newRole: ClanRole,
  ) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    if (clan.ownerId !== userId) {
      throw new ForbiddenException("Only clan owner can promote members");
    }

    if (newRole === ClanRole.OWNER) {
      throw new BadRequestException(
        "Use transfer ownership endpoint to change owner",
      );
    }

    const targetMember = await this.prisma.clanMember.findFirst({
      where: {
        userId: targetUserId,
        clanId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException("Target user is not a member");
    }

    await this.prisma.clanMember.update({
      where: { id: targetMember.id },
      data: { role: newRole },
    });

    return {
      message: "Member role updated successfully",
      promotedUser: targetMember.user,
    };
  }

  async transferOwnership(userId: string, clanId: string, newOwnerId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    if (clan.ownerId !== userId) {
      throw new ForbiddenException("Only clan owner can transfer ownership");
    }

    const newOwnerMembership = await this.prisma.clanMember.findFirst({
      where: {
        userId: newOwnerId,
        clanId,
      },
    });

    if (!newOwnerMembership) {
      throw new BadRequestException("Target user is not a clan member");
    }

    // Update clan owner
    await this.prisma.clan.update({
      where: { id: clanId },
      data: { ownerId: newOwnerId },
    });

    // Update new owner's role
    await this.prisma.clanMember.update({
      where: { id: newOwnerMembership.id },
      data: { role: ClanRole.OWNER },
    });

    // Demote previous owner to officer
    const oldOwnerMembership = await this.prisma.clanMember.findFirst({
      where: {
        userId,
        clanId,
      },
    });

    if (oldOwnerMembership) {
      await this.prisma.clanMember.update({
        where: { id: oldOwnerMembership.id },
        data: { role: ClanRole.OFFICER },
      });
    }

    return { message: "Ownership transferred successfully" };
  }

  // ========================================
  // Clan Chat
  // ========================================

  async sendChatMessage(userId: string, clanId: string, content: string) {
    // Verify user is a member
    const membership = await this.prisma.clanMember.findFirst({
      where: {
        userId,
        clanId,
      },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }

    // Validate message content
    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Message cannot be empty");
    }

    if (content.length > 500) {
      throw new BadRequestException("Message too long (max 500 characters)");
    }

    const message = await this.prisma.clanChatMessage.create({
      data: {
        clanId,
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

    return message;
  }

  async getChatMessages(userId: string, clanId: string, limit = 50) {
    // Verify user is a member
    const membership = await this.prisma.clanMember.findFirst({
      where: {
        userId,
        clanId,
      },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }

    return this.prisma.clanChatMessage.findMany({
      where: { clanId },
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

  // ========================================
  // Utility
  // ========================================

  async getUserClan(userId: string) {
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId },
      include: {
        clan: {
          include: {
            members: {
              select: {
                id: true,
                role: true,
              },
            },
            owner: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    return membership?.clan || null;
  }
}
