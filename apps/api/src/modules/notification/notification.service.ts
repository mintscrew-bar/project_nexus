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
      where: { userId },
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

  async notifyFriendRequest(
    targetUserId: string,
    requesterName: string,
    requesterId: string,
  ) {
    return this.create({
      userId: targetUserId,
      type: "FRIEND_REQUEST",
      title: "새로운 친구 요청",
      message: `${requesterName}님이 친구 요청을 보냈습니다.`,
      link: `/friends`,
      data: { requesterId },
    });
  }

  async notifyFriendAccepted(
    userId: string,
    accepterName: string,
    accepterId: string,
  ) {
    return this.create({
      userId,
      type: "FRIEND_ACCEPTED",
      title: "친구 요청 수락됨",
      message: `${accepterName}님이 친구 요청을 수락했습니다.`,
      link: `/friends`,
      data: { accepterId },
    });
  }

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
  ) {
    return this.create({
      userId,
      type: "MATCH_RESULT",
      title: won ? "경기 승리!" : "경기 종료",
      message: won
        ? `${roomName} 방의 경기에서 승리했습니다!`
        : `${roomName} 방의 경기가 종료되었습니다.`,
      link: `/stats/match/${matchId}`,
      data: { matchId, won },
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
}
