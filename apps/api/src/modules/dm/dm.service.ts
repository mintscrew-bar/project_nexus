import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DmService {
  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(senderId: string, receiverId: string, content: string) {
    return this.prisma.directMessage.create({
      data: { senderId, receiverId, content },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });
  }

  async getConversation(
    userId: string,
    otherUserId: string,
    cursor?: string,
    limit = 30,
  ) {
    const messages = await this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return {
      messages: messages.reverse(),
      nextCursor: hasMore ? messages[0]?.id : null,
    };
  }

  async markAsRead(receiverId: string, senderId: string) {
    await this.prisma.directMessage.updateMany({
      where: { senderId, receiverId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.directMessage.count({
      where: { receiverId: userId, isRead: false },
    });
  }

  async getUnreadCountBySender(userId: string) {
    const result = await this.prisma.directMessage.groupBy({
      by: ["senderId"],
      where: { receiverId: userId, isRead: false },
      _count: { id: true },
    });
    return Object.fromEntries(result.map((r) => [r.senderId, r._count.id]));
  }

  async getConversationList(userId: string) {
    // 마지막 메시지 기준으로 대화 상대 목록 조회
    const raw = await this.prisma.$queryRaw<
      {
        otherUserId: string;
        lastMessage: string;
        lastAt: Date;
        unread: bigint;
      }[]
    >`
      SELECT
        CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END AS "otherUserId",
        (
          SELECT d2.content FROM direct_messages d2
          WHERE (d2."senderId" = ${userId} AND d2."receiverId" = CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END)
             OR (d2."receiverId" = ${userId} AND d2."senderId" = CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END)
          ORDER BY d2."createdAt" DESC LIMIT 1
        ) AS "lastMessage",
        MAX(dm."createdAt") AS "lastAt",
        COUNT(dm.id) FILTER (WHERE dm."receiverId" = ${userId} AND dm."isRead" = false) AS "unread"
      FROM direct_messages dm
      WHERE dm."senderId" = ${userId} OR dm."receiverId" = ${userId}
      GROUP BY "otherUserId"
      ORDER BY "lastAt" DESC
    `;

    const userIds = raw.map((r) => r.otherUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatar: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return raw.map((r) => ({
      user: userMap[r.otherUserId],
      lastMessage: r.lastMessage,
      lastAt: r.lastAt,
      unread: Number(r.unread),
    }));
  }
}
