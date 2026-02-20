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
    const users = await this.prisma.user.findMany({ select: { id: true } });

    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type: "SYSTEM" as any,
        title,
        message,
        link: link ?? null,
      })),
    });

    return { sent: users.length };
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
    if (search) where.content = { contains: search, mode: "insensitive" };

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
}
