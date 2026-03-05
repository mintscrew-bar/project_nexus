import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const UNREAD_KEY = (userId: string) => `dm:unread:${userId}`;
const UNREAD_BY_SENDER_KEY = (userId: string, senderId: string) =>
  `dm:unread:${userId}:from:${senderId}`;

@Injectable()
export class DmService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    // Redis 연결 확인 (실패해도 DB fallback으로 동작)
    try {
      await this.redis.ping();
    } catch {
      console.warn(
        "Redis not available — DM unread counts will use DB fallback",
      );
    }
  }

  /** 양방향 차단 여부 확인 */
  async isBlocked(userA: string, userB: string): Promise<boolean> {
    const blocked = await this.prisma.friendship.findFirst({
      where: {
        status: "BLOCKED",
        OR: [
          { userId: userA, friendId: userB },
          { userId: userB, friendId: userA },
        ],
      },
    });
    return !!blocked;
  }

  async sendMessage(
    senderId: string,
    receiverId: string,
    content: string,
    senderUsername: string,
  ) {
    const message = await this.prisma.directMessage.create({
      data: { senderId, receiverId, content, senderUsername },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    // Redis 미읽음 카운트 증가 (전체 + 발신자별)
    try {
      await Promise.all([
        this.redis.incr(UNREAD_KEY(receiverId)),
        this.redis.incr(UNREAD_BY_SENDER_KEY(receiverId, senderId)),
      ]);
    } catch {
      // Redis 실패 시 무시 — getUnreadCount에서 DB fallback
    }

    return message;
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
    // DB에서 미읽음 메시지 수 먼저 구한 뒤 업데이트
    const unreadCount = await this.prisma.directMessage.count({
      where: { senderId, receiverId, isRead: false },
    });

    if (unreadCount === 0) return;

    await this.prisma.directMessage.updateMany({
      where: { senderId, receiverId, isRead: false },
      data: { isRead: true },
    });

    // Redis 카운트 차감
    try {
      const totalKey = UNREAD_KEY(receiverId);
      const senderKey = UNREAD_BY_SENDER_KEY(receiverId, senderId);

      // 전체 미읽음에서 차감
      const currentTotal = await this.redis.get(totalKey);
      if (currentTotal !== null) {
        const newTotal = Math.max(0, parseInt(currentTotal, 10) - unreadCount);
        await this.redis.set(totalKey, String(newTotal));
      }

      // 발신자별 카운트 삭제
      await this.redis.del(senderKey);
    } catch {
      // Redis 실패 시 무시
    }
  }

  /** 전체 미읽음 카운트 (Redis 우선, DB fallback) */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const cached = await this.redis.get(UNREAD_KEY(userId));
      if (cached !== null) return Math.max(0, parseInt(cached, 10));
    } catch {
      // Redis 실패 → DB fallback
    }

    // DB에서 조회 + Redis에 캐싱
    const count = await this.prisma.directMessage.count({
      where: { receiverId: userId, isRead: false },
    });

    try {
      await this.redis.set(UNREAD_KEY(userId), String(count), 3600);
    } catch {
      // 캐싱 실패 무시
    }

    return count;
  }

  /** 발신자별 미읽음 카운트 */
  async getUnreadCountBySender(userId: string) {
    const result = await this.prisma.directMessage.groupBy({
      by: ["senderId"],
      where: { receiverId: userId, isRead: false },
      _count: { id: true },
    });
    return Object.fromEntries(result.map((r) => [r.senderId, r._count.id]));
  }

  async getConversationList(userId: string, limit = 50) {
    // LATERAL JOIN으로 서브쿼리 제거 + 대화 수 제한
    const raw = await this.prisma.$queryRaw<
      {
        otherUserId: string;
        lastMessage: string;
        lastAt: Date;
        unread: bigint;
      }[]
    >`
      WITH conversations AS (
        SELECT
          CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END AS "otherUserId",
          MAX(dm."createdAt") AS "lastAt",
          COUNT(dm.id) FILTER (WHERE dm."receiverId" = ${userId} AND dm."isRead" = false) AS "unread"
        FROM direct_messages dm
        WHERE dm."senderId" = ${userId} OR dm."receiverId" = ${userId}
        GROUP BY "otherUserId"
        ORDER BY "lastAt" DESC
        LIMIT ${limit}
      )
      SELECT
        c."otherUserId",
        c."lastAt",
        c."unread",
        last_msg.content AS "lastMessage"
      FROM conversations c
      LEFT JOIN LATERAL (
        SELECT d2.content
        FROM direct_messages d2
        WHERE (d2."senderId" = ${userId} AND d2."receiverId" = c."otherUserId")
           OR (d2."receiverId" = ${userId} AND d2."senderId" = c."otherUserId")
        ORDER BY d2."createdAt" DESC
        LIMIT 1
      ) last_msg ON true
      ORDER BY c."lastAt" DESC
    `;

    const userIds = raw.map((r) => r.otherUserId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatar: true },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return raw
      .filter((r) => userMap[r.otherUserId])
      .map((r) => ({
        user: userMap[r.otherUserId],
        lastMessage: r.lastMessage,
        lastAt: r.lastAt,
        unread: Number(r.unread),
      }));
  }
}
