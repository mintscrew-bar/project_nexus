import { Injectable, forwardRef, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationType } from "@nexus/database";
import { NotificationGateway } from "./notification.gateway";

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: any;
}

/**
 * 알림(종)에 보여주지 않는 종류.
 *
 * 친구·클랜 관련은 친구창에서 보고 처리한다(받은 친구 요청, 받은 클랜 초대,
 * 클랜 가입 요청). 알림은 커뮤니티·방송·경기·관리자 메시지만 맡는다(운영자 결정,
 * 2026-09-22). 이 종류는 더 만들지 않지만, 예전에 쌓인 기록이 알림 목록에
 * 섞이지 않게 조회에서도 뺀다.
 */
export const FRIENDS_PANEL_NOTIFICATION_TYPES: NotificationType[] = [
  "FRIEND_REQUEST",
  "FRIEND_ACCEPTED",
  "CLAN_INVITE",
  "CLAN_JOIN_REQUEST",
  "CLAN_JOIN_APPROVED",
  "CLAN_ANNOUNCEMENT",
];

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Create a new notification
   */
  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        link: dto.link,
        data: dto.data,
      },
    });

    // Send real-time notification via WebSocket
    this.notificationGateway.sendToUser(dto.userId, notification);

    // Send updated unread count
    const unreadCount = await this.getUnreadCount(dto.userId);
    this.notificationGateway.sendUnreadCount(dto.userId, unreadCount);

    return notification;
  }

  /**
   * Get notifications for a user
   */
  async getByUserId(userId: string, limit: number = 20, offset: number = 0) {
    return this.prisma.notification.findMany({
      where: { userId, type: { notIn: FRIENDS_PANEL_NOTIFICATION_TYPES } },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
        type: { notIn: FRIENDS_PANEL_NOTIFICATION_TYPES },
      },
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    // Verify ownership
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    // Send updated unread count
    const unreadCount = await this.getUnreadCount(userId);
    this.notificationGateway.sendUnreadCount(userId, unreadCount);

    return updated;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    // Send updated unread count (should be 0)
    this.notificationGateway.sendUnreadCount(userId, 0);

    return result;
  }

  /**
   * Delete a notification
   */
  async delete(notificationId: string, userId: string) {
    // Verify ownership
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    return this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  /**
   * Delete all read notifications
   */
  async deleteAllRead(userId: string) {
    return this.prisma.notification.deleteMany({
      where: {
        userId,
        isRead: true,
      },
    });
  }

  // ========================================
  // Helper methods for creating specific notification types
  // ========================================

  async notifyMatchStarting(userId: string, matchId: string, roomName: string) {
    return this.create({
      userId,
      type: "MATCH_STARTING",
      title: "경기 시작",
      message: `${roomName} 방의 경기가 곧 시작됩니다!`,
      link: `/tournaments/${matchId}/bracket`,
      data: { matchId },
    });
  }

  async notifyMatchResult(
    userId: string,
    matchId: string,
    won: boolean,
    roomName: string,
    roomId: string,
  ) {
    return this.create({
      userId,
      type: "MATCH_RESULT",
      title: won ? "경기 승리!" : "경기 종료",
      message: won
        ? `${roomName} 방의 경기에서 승리했습니다!`
        : `${roomName} 방의 경기가 종료되었습니다.`,
      // 예전 링크(/stats/match/…)는 없는 페이지였다. 알림이 화면에 나온 적이 없어
      // 아무도 몰랐다. 경기 결과는 롤 대진에서만 나오므로 그 방 대진표로 보낸다.
      link: `/lol/tournaments/${roomId}/bracket`,
      data: { matchId, won },
    });
  }

  /** 팔로우한 스트리머가 방송을 시작하면 발송 */
  async notifyStreamerLive(
    userId: string,
    streamerName: string,
    streamerUserId: string,
  ) {
    return this.create({
      userId,
      type: "STREAMER_LIVE",
      title: "방송 시작",
      message: `${streamerName}님이 방송을 시작했어요.`,
      link: `/streamers`,
      data: { streamerUserId },
    });
  }

  async notifyMention(userId: string, mentionerName: string, postId: string) {
    return this.create({
      userId,
      type: "MENTION",
      title: "멘션됨",
      message: `${mentionerName}님이 회원님을 언급했습니다.`,
      link: `/community/${postId}`,
      data: { postId },
    });
  }

  async notifyComment(userId: string, commenterName: string, postId: string) {
    return this.create({
      userId,
      type: "COMMENT",
      title: "새로운 댓글",
      message: `${commenterName}님이 회원님의 게시글에 댓글을 남겼습니다.`,
      link: `/community/${postId}`,
      data: { postId },
    });
  }

  async notifyReply(userId: string, replierName: string, postId: string) {
    return this.create({
      userId,
      type: "COMMENT",
      title: "새로운 답글",
      message: `${replierName}님이 회원님의 댓글에 답글을 남겼습니다.`,
      link: `/community/${postId}`,
      data: { postId },
    });
  }
}
