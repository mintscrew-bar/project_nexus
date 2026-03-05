import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ClanActivityType,
  ClanInvitationStatus,
  ClanInvitationType,
  ClanRole,
  NotificationType,
} from "@nexus/database";
import { NotificationService } from "../notification/notification.service";

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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

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
    sort?: string; // 'latest' | 'members' | 'ranking'
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

    // 정렬 기준 설정
    let orderBy: any = { createdAt: "desc" };
    if (filters?.sort === "members") {
      orderBy = { members: { _count: "desc" } };
    } else if (filters?.sort === "ranking") {
      // 랭킹 기준 정렬 (clanRankings 승률 평균 - 간략화)
      orderBy = { createdAt: "desc" }; // 추후 집계 컬럼 추가 시 변경
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
      orderBy,
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

    const updated = await this.prisma.clan.update({
      where: { id: clanId },
      data: dto,
    });

    // 클랜 정보 변경 활동 로그 기록
    await this.logActivity(clanId, userId, ClanActivityType.CLAN_UPDATE);

    return updated;
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

    // 클랜 멤버로 추가
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

    // 가입 활동 로그 기록
    await this.logActivity(clanId, userId, ClanActivityType.MEMBER_JOIN);

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

    // 탈퇴 활동 로그 기록
    await this.logActivity(clanId, userId, ClanActivityType.MEMBER_LEAVE);

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

    // 추방 활동 로그 기록
    await this.logActivity(
      clanId,
      userId,
      ClanActivityType.MEMBER_KICK,
      targetUserId,
    );

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

    const oldRole = targetMember.role;

    await this.prisma.clanMember.update({
      where: { id: targetMember.id },
      data: { role: newRole },
    });

    // 승급/강등 활동 로그 기록
    const isPromotion =
      newRole === ClanRole.OFFICER && oldRole === ClanRole.MEMBER;
    await this.logActivity(
      clanId,
      userId,
      isPromotion
        ? ClanActivityType.MEMBER_PROMOTE
        : ClanActivityType.MEMBER_DEMOTE,
      targetUserId,
      { oldRole, newRole },
    );

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

    // 소유권 이전 활동 로그 기록
    await this.logActivity(
      clanId,
      userId,
      ClanActivityType.OWNERSHIP_TRANSFER,
      newOwnerId,
    );

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

  async getChatMessages(
    userId: string,
    clanId: string,
    cursor?: string,
    limit = 50,
  ) {
    // 멤버 여부 확인
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId, clanId },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }

    // limit+1 트릭: 다음 페이지 존재 여부 확인
    const messages = await this.prisma.clanChatMessage.findMany({
      where: {
        clanId,
        isDeleted: false, // 소프트 삭제된 메시지 제외
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return {
      messages: messages.reverse(), // 오래된 메시지가 앞에 오도록 역순 정렬
      nextCursor: hasMore ? messages[0]?.id : null,
    };
  }

  async deleteChatMessage(userId: string, clanId: string, messageId: string) {
    // 메시지 조회
    const message = await this.prisma.clanChatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message || message.clanId !== clanId) {
      throw new NotFoundException("Message not found");
    }

    if (message.isDeleted) {
      throw new BadRequestException("Message already deleted");
    }

    // 삭제 권한 확인: 본인 메시지이거나 OWNER/OFFICER
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId, clanId },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }

    const isOwnerOrOfficer =
      membership.role === ClanRole.OWNER ||
      membership.role === ClanRole.OFFICER;

    if (message.userId !== userId && !isOwnerOrOfficer) {
      throw new ForbiddenException("You can only delete your own messages");
    }

    // 소프트 삭제 처리
    await this.prisma.clanChatMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        content: "", // 내용 비우기
      },
    });

    return { messageId };
  }

  // ========================================
  // Stats & Ranking
  // ========================================

  async getClanStats(clanId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { id: true, name: true, tag: true },
    });
    if (!clan) throw new NotFoundException("Clan not found");

    // ClanRanking 테이블 집계
    const rankings = await this.prisma.clanRanking.findMany({
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
      orderBy: { clanRank: "asc" },
    });

    // 전체 클랜 통계 집계
    const totals = rankings.reduce(
      (acc, r) => ({
        totalGames: acc.totalGames + r.totalGames,
        totalWins: acc.totalWins + r.wins,
        totalLosses: acc.totalLosses + r.losses,
      }),
      { totalGames: 0, totalWins: 0, totalLosses: 0 },
    );

    const winRate =
      totals.totalGames > 0
        ? Math.round((totals.totalWins / totals.totalGames) * 100)
        : 0;

    return {
      ...totals,
      winRate,
      memberRankings: rankings,
    };
  }

  // ========================================
  // Announcement System
  // ========================================

  async createAnnouncement(userId: string, clanId: string, content: string) {
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId, clanId },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }
    if (
      membership.role !== ClanRole.OWNER &&
      membership.role !== ClanRole.OFFICER
    ) {
      throw new ForbiddenException(
        "Only owner or officers can create announcements",
      );
    }

    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Announcement content cannot be empty");
    }
    if (content.length > 1000) {
      throw new BadRequestException(
        "Announcement too long (max 1000 characters)",
      );
    }

    // 핀된 공지 최대 10개 제한
    const pinnedCount = await this.prisma.clanAnnouncement.count({
      where: { clanId, isPinned: true },
    });
    if (pinnedCount >= 10) {
      throw new BadRequestException("Maximum 10 pinned announcements allowed");
    }

    const announcement = await this.prisma.clanAnnouncement.create({
      data: {
        clanId,
        authorId: userId,
        content: content.trim(),
        isPinned: true,
      },
      include: {
        author: {
          select: { id: true, username: true, avatar: true },
        },
      },
    });

    // 활동 로그 기록
    await this.logActivity(
      clanId,
      userId,
      ClanActivityType.ANNOUNCEMENT_CREATE,
    );

    return announcement;
  }

  async getAnnouncements(userId: string, clanId: string) {
    // 멤버 확인
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId, clanId },
    });
    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }

    return this.prisma.clanAnnouncement.findMany({
      where: { clanId, isPinned: true },
      include: {
        author: {
          select: { id: true, username: true, avatar: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  }

  async deleteAnnouncement(
    userId: string,
    clanId: string,
    announcementId: string,
  ) {
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId, clanId },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }
    if (
      membership.role !== ClanRole.OWNER &&
      membership.role !== ClanRole.OFFICER
    ) {
      throw new ForbiddenException(
        "Only owner or officers can delete announcements",
      );
    }

    const announcement = await this.prisma.clanAnnouncement.findFirst({
      where: { id: announcementId, clanId },
    });
    if (!announcement) {
      throw new NotFoundException("Announcement not found");
    }

    await this.prisma.clanAnnouncement.delete({
      where: { id: announcementId },
    });

    return { announcementId };
  }

  async unpinAnnouncement(
    userId: string,
    clanId: string,
    announcementId: string,
  ) {
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId, clanId },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }
    if (
      membership.role !== ClanRole.OWNER &&
      membership.role !== ClanRole.OFFICER
    ) {
      throw new ForbiddenException(
        "Only owner or officers can unpin announcements",
      );
    }

    const announcement = await this.prisma.clanAnnouncement.findFirst({
      where: { id: announcementId, clanId },
    });
    if (!announcement) {
      throw new NotFoundException("Announcement not found");
    }

    return this.prisma.clanAnnouncement.update({
      where: { id: announcementId },
      data: { isPinned: false },
    });
  }

  // ========================================
  // Invitation & Join Request System
  // ========================================

  /**
   * 특정 유저를 클랜에 초대
   */
  async inviteUser(inviterId: string, clanId: string, inviteeId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: { members: { where: { userId: inviterId } } },
    });

    if (!clan) throw new NotFoundException("Clan not found");

    const inviter = clan.members[0];
    if (
      !inviter ||
      (inviter.role !== ClanRole.OWNER && inviter.role !== ClanRole.OFFICER)
    ) {
      throw new ForbiddenException("Only owner or officers can invite users");
    }

    // 이미 멤버인지 확인
    const existing = await this.prisma.clanMember.findFirst({
      where: { userId: inviteeId, clanId },
    });
    if (existing) throw new ConflictException("User is already a member");

    // 중복 초대 확인
    const duplicate = await this.prisma.clanInvitation.findFirst({
      where: {
        clanId,
        inviteeId,
        type: ClanInvitationType.INVITE,
        status: ClanInvitationStatus.PENDING,
      },
    });
    if (duplicate) throw new ConflictException("Invitation already sent");

    const invitation = await this.prisma.clanInvitation.create({
      data: {
        clanId,
        inviterId,
        inviteeId,
        type: ClanInvitationType.INVITE,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7일
      },
    });

    // 알림 발송
    await this.notificationService.create({
      userId: inviteeId,
      type: NotificationType.CLAN_INVITE,
      title: "클랜 초대",
      message: `[${clan.tag}] ${clan.name} 클랜에 초대되었습니다.`,
      link: `/clans/${clanId}`,
      data: { clanId, invitationId: invitation.id },
    });

    // 활동 로그 기록
    await this.logActivity(
      clanId,
      inviterId,
      ClanActivityType.INVITE_SENT,
      inviteeId,
    );

    return invitation;
  }

  /**
   * 초대 코드 생성 (7일 만료)
   */
  async generateInviteCode(userId: string, clanId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: { members: { where: { userId } } },
    });

    if (!clan) throw new NotFoundException("Clan not found");

    const member = clan.members[0];
    if (
      !member ||
      (member.role !== ClanRole.OWNER && member.role !== ClanRole.OFFICER)
    ) {
      throw new ForbiddenException(
        "Only owner or officers can generate invite codes",
      );
    }

    // 8자리 랜덤 코드 생성
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

    const invitation = await this.prisma.clanInvitation.create({
      data: {
        clanId,
        inviterId: userId,
        type: ClanInvitationType.INVITE,
        inviteCode: code,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7일
      },
    });

    return { code, expiresAt: invitation.expiresAt };
  }

  /**
   * 가입 요청 보내기
   */
  async requestToJoin(userId: string, clanId: string) {
    // 이미 클랜이 있는지 확인
    const existingMembership = await this.prisma.clanMember.findFirst({
      where: { userId },
    });
    if (existingMembership)
      throw new ConflictException("You are already in a clan");

    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new NotFoundException("Clan not found");

    // 중복 요청 확인
    const duplicate = await this.prisma.clanInvitation.findFirst({
      where: {
        clanId,
        inviterId: userId,
        type: ClanInvitationType.JOIN_REQUEST,
        status: ClanInvitationStatus.PENDING,
      },
    });
    if (duplicate) throw new ConflictException("Join request already sent");

    const request = await this.prisma.clanInvitation.create({
      data: {
        clanId,
        inviterId: userId,
        type: ClanInvitationType.JOIN_REQUEST,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // 클랜 오너에게 알림 발송
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    await this.notificationService.create({
      userId: clan.ownerId,
      type: NotificationType.CLAN_JOIN_REQUEST,
      title: "클랜 가입 요청",
      message: `${user?.username || "누군가"}가 클랜 가입을 요청했습니다.`,
      link: `/clans/${clanId}/settings`,
      data: { clanId, requestId: request.id },
    });

    // 활동 로그 기록
    await this.logActivity(clanId, userId, ClanActivityType.JOIN_REQUEST);

    return request;
  }

  /**
   * 초대 코드로 가입
   */
  async joinByCode(userId: string, code: string) {
    // 이미 클랜이 있는지 확인
    const existingMembership = await this.prisma.clanMember.findFirst({
      where: { userId },
    });
    if (existingMembership)
      throw new ConflictException("You are already in a clan");

    const invitation = await this.prisma.clanInvitation.findUnique({
      where: { inviteCode: code },
      include: { clan: true },
    });

    if (!invitation) throw new NotFoundException("Invalid invite code");
    if (invitation.status !== ClanInvitationStatus.PENDING) {
      throw new BadRequestException("Invite code is no longer valid");
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      // 만료 처리
      await this.prisma.clanInvitation.update({
        where: { id: invitation.id },
        data: { status: ClanInvitationStatus.EXPIRED },
      });
      throw new BadRequestException("Invite code has expired");
    }

    // 클랜 정원 확인
    const memberCount = await this.prisma.clanMember.count({
      where: { clanId: invitation.clanId },
    });
    if (memberCount >= invitation.clan.maxMembers) {
      throw new BadRequestException("Clan is full");
    }

    // 초대장 처리 및 멤버 추가
    await this.prisma.clanInvitation.update({
      where: { id: invitation.id },
      data: {
        status: ClanInvitationStatus.ACCEPTED,
        resolvedBy: userId,
        resolvedAt: new Date(),
      },
    });

    const membership = await this.prisma.clanMember.create({
      data: {
        clanId: invitation.clanId,
        userId,
        role: ClanRole.MEMBER,
      },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        clan: true,
      },
    });

    await this.logActivity(
      invitation.clanId,
      userId,
      ClanActivityType.MEMBER_JOIN,
    );

    return membership;
  }

  /**
   * 초대 수락/거절 (초대 받은 사람이 처리)
   */
  async resolveInvitation(
    userId: string,
    invitationId: string,
    accept: boolean,
  ) {
    const invitation = await this.prisma.clanInvitation.findUnique({
      where: { id: invitationId },
      include: { clan: true },
    });

    if (!invitation) throw new NotFoundException("Invitation not found");
    if (invitation.inviteeId !== userId) {
      throw new ForbiddenException("This invitation is not for you");
    }
    if (invitation.status !== ClanInvitationStatus.PENDING) {
      throw new BadRequestException("Invitation already resolved");
    }

    if (accept) {
      // 이미 클랜이 있는지 확인
      const existingMembership = await this.prisma.clanMember.findFirst({
        where: { userId },
      });
      if (existingMembership) {
        throw new ConflictException("You are already in a clan");
      }

      await this.prisma.clanInvitation.update({
        where: { id: invitationId },
        data: {
          status: ClanInvitationStatus.ACCEPTED,
          resolvedBy: userId,
          resolvedAt: new Date(),
        },
      });

      await this.prisma.clanMember.create({
        data: {
          clanId: invitation.clanId,
          userId,
          role: ClanRole.MEMBER,
        },
      });

      await this.logActivity(
        invitation.clanId,
        userId,
        ClanActivityType.MEMBER_JOIN,
      );
    } else {
      await this.prisma.clanInvitation.update({
        where: { id: invitationId },
        data: {
          status: ClanInvitationStatus.REJECTED,
          resolvedBy: userId,
          resolvedAt: new Date(),
        },
      });
    }

    return { accepted: accept };
  }

  /**
   * 가입 요청 승인/거절 (OWNER/OFFICER가 처리)
   */
  async resolveJoinRequest(
    userId: string,
    clanId: string,
    invitationId: string,
    accept: boolean,
  ) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: { members: { where: { userId } } },
    });

    if (!clan) throw new NotFoundException("Clan not found");

    const member = clan.members[0];
    if (
      !member ||
      (member.role !== ClanRole.OWNER && member.role !== ClanRole.OFFICER)
    ) {
      throw new ForbiddenException(
        "Only owner or officers can resolve join requests",
      );
    }

    const request = await this.prisma.clanInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!request || request.clanId !== clanId) {
      throw new NotFoundException("Join request not found");
    }
    if (request.type !== ClanInvitationType.JOIN_REQUEST) {
      throw new BadRequestException("Not a join request");
    }
    if (request.status !== ClanInvitationStatus.PENDING) {
      throw new BadRequestException("Request already resolved");
    }

    if (accept) {
      const memberCount = await this.prisma.clanMember.count({
        where: { clanId },
      });
      if (memberCount >= clan.maxMembers) {
        throw new BadRequestException("Clan is full");
      }

      await this.prisma.clanInvitation.update({
        where: { id: invitationId },
        data: {
          status: ClanInvitationStatus.ACCEPTED,
          resolvedBy: userId,
          resolvedAt: new Date(),
        },
      });

      await this.prisma.clanMember.create({
        data: {
          clanId,
          userId: request.inviterId,
          role: ClanRole.MEMBER,
        },
      });

      await this.logActivity(
        clanId,
        request.inviterId,
        ClanActivityType.MEMBER_JOIN,
      );

      // 승인 알림 발송
      await this.notificationService.create({
        userId: request.inviterId,
        type: NotificationType.CLAN_JOIN_APPROVED,
        title: "클랜 가입 승인",
        message: `[${clan.tag}] ${clan.name} 클랜 가입이 승인되었습니다.`,
        link: `/clans/${clanId}`,
        data: { clanId },
      });
    } else {
      await this.prisma.clanInvitation.update({
        where: { id: invitationId },
        data: {
          status: ClanInvitationStatus.REJECTED,
          resolvedBy: userId,
          resolvedAt: new Date(),
        },
      });
    }

    return { accepted: accept };
  }

  /**
   * 내가 받은 초대 목록 조회
   */
  async getPendingInvitations(userId: string) {
    return this.prisma.clanInvitation.findMany({
      where: {
        inviteeId: userId,
        type: ClanInvitationType.INVITE,
        status: ClanInvitationStatus.PENDING,
      },
      include: {
        clan: {
          select: {
            id: true,
            name: true,
            tag: true,
            logo: true,
          },
        },
        inviter: {
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

  /**
   * 클랜에 대한 가입 요청 목록 조회 (OWNER/OFFICER 전용)
   */
  async getPendingJoinRequests(userId: string, clanId: string) {
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId, clanId },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }
    if (
      membership.role !== ClanRole.OWNER &&
      membership.role !== ClanRole.OFFICER
    ) {
      throw new ForbiddenException(
        "Only owner or officers can view join requests",
      );
    }

    return this.prisma.clanInvitation.findMany({
      where: {
        clanId,
        type: ClanInvitationType.JOIN_REQUEST,
        status: ClanInvitationStatus.PENDING,
      },
      include: {
        inviter: {
          select: {
            id: true,
            username: true,
            avatar: true,
            riotAccounts: {
              where: { isPrimary: true },
              select: { tier: true, rank: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ========================================
  // Activity Log
  // ========================================

  /**
   * 클랜 활동 로그를 기록하는 내부 헬퍼
   */
  private async logActivity(
    clanId: string,
    actorId: string | null,
    action: ClanActivityType,
    targetId?: string,
    details?: Record<string, any>,
  ) {
    await this.prisma.clanActivityLog.create({
      data: {
        clanId,
        actorId: actorId ?? undefined,
        action,
        targetId,
        details: details as any,
      },
    });
  }

  async getActivityLogs(
    userId: string,
    clanId: string,
    cursor?: string,
    limit = 20,
  ) {
    // OWNER/OFFICER만 조회 가능
    const membership = await this.prisma.clanMember.findFirst({
      where: { userId, clanId },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this clan");
    }

    if (
      membership.role !== ClanRole.OWNER &&
      membership.role !== ClanRole.OFFICER
    ) {
      throw new ForbiddenException(
        "Only owner or officers can view activity logs",
      );
    }

    const logs = await this.prisma.clanActivityLog.findMany({
      where: { clanId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    const hasMore = logs.length > limit;
    if (hasMore) logs.pop();

    return {
      logs,
      nextCursor: hasMore ? logs[logs.length - 1]?.id : null,
    };
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
