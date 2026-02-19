import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "@nexus/database";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
          isRestricted: true,
          restrictedUntil: true,
          createdAt: true,
          authProviders: {
            select: { provider: true },
          },
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
    if (targetUserId === requesterId) {
      throw new BadRequestException("자신의 권한은 변경할 수 없습니다.");
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, username: true, role: true },
    });
  }

  async getStats() {
    const [totalUsers, totalRooms, activeRooms, totalMatches] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.room.count(),
      this.prisma.room.count({ where: { status: { in: ["WAITING", "IN_PROGRESS"] } } }),
      this.prisma.match.count(),
    ]);

    return { totalUsers, totalRooms, activeRooms, totalMatches };
  }
}
