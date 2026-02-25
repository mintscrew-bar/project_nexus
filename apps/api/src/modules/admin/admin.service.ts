import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "@nexus/database";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats() {
    const [totalUsers, totalRooms, activeRooms, totalMatches, pendingReports, totalClans] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.room.count(),
        this.prisma.room.count({ where: { status: { in: ["WAITING", "IN_PROGRESS"] } } }),
        this.prisma.match.count(),
        this.prisma.userReport.count({ where: { status: "PENDING" } }),
        this.prisma.clan.count(),
      ]);

    return { totalUsers, totalRooms, activeRooms, totalMatches, pendingReports, totalClans };
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getUsers(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          avatar: true,
          role: true,
          reputation: true,
          isRestricted: true,
          restrictedUntil: true,
          isBanned: true,
          banReason: true,
          banUntil: true,
          createdAt: true,
          authProviders: { select: { provider: true } },
          _count: { select: { reportsReceived: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  async updateUserRole(targetUserId: string, role: UserRole, requesterId: string) {
    if (targetUserId === requesterId)
      throw new BadRequestException("자신의 권한은 변경할 수 없습니다.");

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, username: true, role: true },
    });
  }

  async banUser(
    targetUserId: string,
    requesterId: string,
    reason: string,
    banUntil?: string,
  ) {
    if (targetUserId === requesterId)
      throw new BadRequestException("자신을 밴할 수 없습니다.");

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        isBanned: true,
        banReason: reason,
        bannedAt: new Date(),
        banUntil: banUntil ? new Date(banUntil) : null,
      },
      select: { id: true, username: true, isBanned: true, banReason: true, banUntil: true },
    });
  }

  async unbanUser(targetUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { isBanned: false, banReason: null, bannedAt: null, banUntil: null },
      select: { id: true, username: true, isBanned: true },
    });
  }

  async restrictUser(targetUserId: string, requesterId: string, restrictedUntil: string) {
    if (targetUserId === requesterId)
      throw new BadRequestException("자신을 제재할 수 없습니다.");

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { isRestricted: true, restrictedUntil: new Date(restrictedUntil) },
      select: { id: true, username: true, isRestricted: true, restrictedUntil: true },
    });
  }

  async unrestrictUser(targetUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { isRestricted: false, restrictedUntil: null },
      select: { id: true, username: true, isRestricted: true },
    });
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  async getReports(params: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [reports, total] = await Promise.all([
      this.prisma.userReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, username: true, avatar: true } },
          target: { select: { id: true, username: true, avatar: true, isBanned: true } },
          match: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.userReport.count({ where }),
    ]);

    return { reports, total, page, limit };
  }

  async reviewReport(
    reportId: string,
    status: "APPROVED" | "REJECTED",
    reviewerNote: string,
  ) {
    const report = await this.prisma.userReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("신고를 찾을 수 없습니다.");

    return this.prisma.userReport.update({
      where: { id: reportId },
      data: { status, reviewerNote, reviewedAt: new Date() },
    });
  }

  // ── Announcements ─────────────────────────────────────────────────────────

  async sendAnnouncement(title: string, message: string, link?: string) {
    const BATCH_SIZE = 1000;
    let sent = 0;
    let cursor: string | undefined;

    // 배치 처리: 한 번에 1000명씩 조회 + 알림 생성
    while (true) {
      const users = await this.prisma.user.findMany({
        select: { id: true },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
      });

      if (users.length === 0) break;

      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: "SYSTEM" as any,
          title,
          message,
          link: link ?? null,
        })),
      });

      sent += users.length;
      cursor = users[users.length - 1].id;

      if (users.length < BATCH_SIZE) break;
    }

    return { sent };
  }

  // ── Chat Logs ─────────────────────────────────────────────────────────────

  async getChatLogs(params: {
    page: number;
    limit: number;
    roomName?: string;
    search?: string;
  }) {
    const { page, limit, roomName, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (roomName) where.roomName = { contains: roomName, mode: "insensitive" };
    if (search) {
      where.content = { contains: search, mode: "insensitive" };
      // 내용 검색 시 최근 30일로 범위 제한 (풀스캔 방지)
      if (!where.createdAt) {
        where.createdAt = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      }
    }

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.chatMessage.count({ where }),
    ]);

    return { messages, total, page, limit };
  }

  // ── Community ─────────────────────────────────────────────────────────────

  async getPosts(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { content: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          author: { select: { id: true, username: true } },
          _count: { select: { comments: true, likes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return { posts, total, page, limit };
  }

  async deletePost(postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("게시글을 찾을 수 없습니다.");
    await this.prisma.post.delete({ where: { id: postId } });
    return { success: true };
  }

  async pinPost(postId: string, isPinned: boolean) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("게시글을 찾을 수 없습니다.");
    return this.prisma.post.update({ where: { id: postId }, data: { isPinned } });
  }

  async deleteComment(commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException("댓글을 찾을 수 없습니다.");
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { success: true };
  }

  // ── Clans ─────────────────────────────────────────────────────────────────

  async getClans(params: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {};

    const [clans, total] = await Promise.all([
      this.prisma.clan.findMany({
        where,
        include: {
          owner: { select: { id: true, username: true } },
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.clan.count({ where }),
    ]);

    return { clans, total, page, limit };
  }

  async deleteClan(clanId: string) {
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new NotFoundException("클랜을 찾을 수 없습니다.");
    await this.prisma.clan.delete({ where: { id: clanId } });
    return { success: true };
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  async getRooms(params: { page: number; limit: number; status?: string }) {
    const { page, limit, status } = params;
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: {
          host: { select: { id: true, username: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.room.count({ where }),
    ]);

    return { rooms, total, page, limit };
  }

  async closeRoom(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    return this.prisma.room.update({
      where: { id: roomId },
      data: { status: "COMPLETED" as any, completedAt: new Date() },
      select: { id: true, name: true, status: true },
    });
  }

  // ── Test Bots ──────────────────────────────────────────────────────────────

  /** testbot_01 ~ testbot_{count} 유저를 없으면 생성, 있으면 반환 */
  async ensureBotUsers(count: number): Promise<{ id: string; username: string }[]> {
    const bots: { id: string; username: string }[] = [];

    for (let i = 1; i <= count; i++) {
      const username = `testbot_${String(i).padStart(2, "0")}`;
      const email = `${username}@nexus.test`;

      // 봇의 기본 Tier: SILVER (중간 등급)
      const botTiers = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"];
      const botTier = botTiers[i % botTiers.length]; // 봇마다 다른 티어 할당
      const botRank = "IV";
      const botMMR = 1000 + (i * 100); // 기본 MMR: 1100, 1200, 1300...

      const user = await this.prisma.user.upsert({
        where: { email },
        update: {}, // 이미 있으면 업데이트 안 함 (기존 봇 유지)
        create: {
          username,
          email,
          emailVerified: true,
          termsAgreements: {
            create: {
              termsOfService: true,
              privacyPolicy: true,
              ageVerification: true,
              marketingConsent: false,
            },
          },
          // 봇용 RiotAccount 생성 (드래프트/경매에서 사용)
          riotAccounts: {
            create: {
              gameName: username,
              tagLine: "BOT",
              puuid: `bot_puuid_${i}`,
              tier: botTier,
              rank: botRank,
              leaguePoints: 0,
              wins: 0,
              losses: 0,
              isPrimary: true,
              mainRole: "FILL", // 봇은 모든 역할 가능
              subRole: null,
            },
          },
        },
        select: { id: true, username: true },
      });

      bots.push(user);
    }

    return bots;
  }

  /** 방에 봇을 count명 추가. 이미 있는 봇은 스킵, maxParticipants 초과하지 않음 */
  async addBotToRoom(roomId: string, count: number = 1) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: { select: { userId: true } },
      },
    });

    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (room.status !== "WAITING" as any) {
      throw new BadRequestException("대기 중인 방에만 봇을 추가할 수 있습니다.");
    }

    const currentCount = room.participants.length;
    const available = (room.maxParticipants || 10) - currentCount;
    if (available <= 0) throw new BadRequestException("방이 가득 찼습니다.");

    const toAdd = Math.min(count, available);
    const existingBotIds = new Set(room.participants.map((p) => p.userId));

    // 필요한 봇보다 여유 있게 확보 (최대 9개)
    const bots = await this.ensureBotUsers(Math.min(9, currentCount + toAdd));

    const newBots = bots.filter((b) => !existingBotIds.has(b.id)).slice(0, toAdd);
    if (newBots.length === 0) throw new BadRequestException("추가할 수 있는 봇이 없습니다.");

    await this.prisma.roomParticipant.createMany({
      data: newBots.map((bot) => ({
        roomId,
        userId: bot.id,
        role: "PLAYER" as any,
        isReady: true,
      })),
      skipDuplicates: true,
    });

    const updatedParticipants = await this.prisma.roomParticipant.findMany({
      where: { roomId },
      include: { user: { select: { id: true, username: true, avatar: true, role: true } } },
    });

    return { addedCount: newBots.length, participants: updatedParticipants };
  }
}
