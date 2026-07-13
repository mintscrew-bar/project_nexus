import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FriendshipStatus } from "@nexus/database";
import { NotificationService } from "../notification/notification.service";

@Injectable()
export class FriendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  // ========================================
  // Friend Request Management
  // ========================================

  async sendFriendRequest(senderId: string, receiverId: string) {
    // Cannot send request to yourself
    if (senderId === receiverId) {
      throw new BadRequestException("Cannot send friend request to yourself");
    }

    // Verify receiver exists and check ban/restriction status
    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: {
        id: true,
        isBanned: true,
        isRestricted: true,
        restrictedUntil: true,
      },
    });

    if (!receiver) {
      throw new NotFoundException("User not found");
    }

    if (receiver.isBanned) {
      throw new BadRequestException(
        "Cannot send friend request to a banned user",
      );
    }

    if (
      receiver.isRestricted &&
      receiver.restrictedUntil &&
      receiver.restrictedUntil > new Date()
    ) {
      throw new BadRequestException(
        "Cannot send friend request to a restricted user",
      );
    }

    // Also check if sender is banned/restricted
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { isBanned: true, isRestricted: true, restrictedUntil: true },
    });

    if (
      sender?.isBanned ||
      (sender?.isRestricted &&
        sender?.restrictedUntil &&
        sender.restrictedUntil > new Date())
    ) {
      throw new BadRequestException("Your account is restricted");
    }

    // Check if friendship already exists in either direction
    const existingFriendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: senderId, friendId: receiverId },
          { userId: receiverId, friendId: senderId },
        ],
      },
    });

    if (existingFriendship) {
      if (existingFriendship.status === FriendshipStatus.ACCEPTED) {
        throw new ConflictException("Already friends");
      }
      if (existingFriendship.status === FriendshipStatus.PENDING) {
        throw new ConflictException("Friend request already pending");
      }
      if (existingFriendship.status === FriendshipStatus.BLOCKED) {
        throw new BadRequestException(
          "Cannot send friend request to blocked user",
        );
      }
    }

    // Create friend request
    const friendship = await this.prisma.friendship.create({
      data: {
        userId: senderId,
        friendId: receiverId,
        status: FriendshipStatus.PENDING,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        friend: {
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
              },
            },
          },
        },
      },
    });

    // Send notification to receiver
    await this.notificationService.notifyFriendRequest(
      receiverId,
      friendship.user.username,
      senderId,
    );

    return friendship;
  }

  async acceptFriendRequest(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new NotFoundException("Friend request not found");
    }

    // Verify this is the receiver
    if (friendship.friendId !== userId) {
      throw new BadRequestException("You can only accept requests sent to you");
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException("Friend request is not pending");
    }

    // Get current user info
    const accepter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    // Update status to accepted
    const updatedFriendship = await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: FriendshipStatus.ACCEPTED },
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
              },
            },
          },
        },
      },
    });

    // Send notification to the original sender
    if (accepter) {
      await this.notificationService.notifyFriendAccepted(
        friendship.userId,
        accepter.username,
        userId,
      );
    }

    return updatedFriendship;
  }

  async rejectFriendRequest(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new NotFoundException("Friend request not found");
    }

    // Verify this is the receiver
    if (friendship.friendId !== userId) {
      throw new BadRequestException("You can only reject requests sent to you");
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException("Friend request is not pending");
    }

    // Delete the friendship request
    await this.prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return { message: "Friend request rejected" };
  }

  async cancelFriendRequest(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new NotFoundException("Friend request not found");
    }

    // Verify this is the sender
    if (friendship.userId !== userId) {
      throw new BadRequestException("You can only cancel requests you sent");
    }

    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new BadRequestException("Friend request is not pending");
    }

    // Delete the friendship request
    await this.prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return { message: "Friend request cancelled" };
  }

  // ========================================
  // Friend List Management
  // ========================================

  async getFriends(userId: string) {
    // 양방향 조건으로 수락된 친구 관계를 모두 조회
    // (userId=A, friendId=B) 또는 (userId=B, friendId=A) 두 방향 모두 포함
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: FriendshipStatus.ACCEPTED },
          { friendId: userId, status: FriendshipStatus.ACCEPTED },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        friend: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    // DB에 양방향 레코드 (A→B, B→A)가 모두 ACCEPTED 상태로 존재하는 경우
    // 같은 상대방 유저가 두 번 나타나는 버그를 방지하기 위해 중복 제거.
    // 상대방 userId를 기준으로 Set을 이용해 첫 번째 레코드만 유지.
    const seenPartnerIds = new Set<string>();
    const deduplicated = friendships.filter(
      (f: (typeof friendships)[number]) => {
        // 현재 유저 입장에서 "상대방" ID 결정
        const partnerId = f.userId === userId ? f.friendId : f.userId;
        if (seenPartnerIds.has(partnerId)) {
          // 이미 동일한 상대방의 레코드가 있으면 제거 (중복)
          return false;
        }
        seenPartnerIds.add(partnerId);
        return true;
      },
    );

    return deduplicated;
  }

  async getPendingRequests(userId: string) {
    // Get friend requests sent TO the user (that they can accept/reject)
    const incomingRequests = await this.prisma.friendship.findMany({
      where: {
        friendId: userId,
        status: FriendshipStatus.PENDING,
      },
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
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // 프론트 Friendship 타입이 원본 구조를 기대하므로 그대로 반환
    return incomingRequests;
  }

  async getSentRequests(userId: string) {
    // Get friend requests sent BY the user (that they can cancel)
    const outgoingRequests = await this.prisma.friendship.findMany({
      where: {
        userId,
        status: FriendshipStatus.PENDING,
      },
      include: {
        friend: {
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
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return outgoingRequests.map((f: (typeof outgoingRequests)[number]) => ({
      friendshipId: f.id,
      to: f.friend,
      createdAt: f.createdAt,
    }));
  }

  async removeFriend(userId: string, friendId: string) {
    // 양방향 모두 삭제 (혹시 양방향 레코드가 있는 경우 대비)
    const deleted = await this.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId, status: FriendshipStatus.ACCEPTED },
          {
            userId: friendId,
            friendId: userId,
            status: FriendshipStatus.ACCEPTED,
          },
        ],
      },
    });

    if (deleted.count === 0) {
      throw new NotFoundException("Friendship not found");
    }

    return { message: "Friend removed successfully" };
  }

  // ========================================
  // Block Management
  // ========================================

  async blockUser(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException("Cannot block yourself");
    }

    // Check if friendship exists
    const existingFriendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
    });

    if (existingFriendship) {
      // Update existing friendship to blocked
      return this.prisma.friendship.update({
        where: { id: existingFriendship.id },
        data: { status: FriendshipStatus.BLOCKED },
      });
    } else {
      // Create new blocked relationship
      return this.prisma.friendship.create({
        data: {
          userId,
          friendId: targetUserId,
          status: FriendshipStatus.BLOCKED,
        },
      });
    }
  }

  async unblockUser(userId: string, targetUserId: string) {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        userId,
        friendId: targetUserId,
        status: FriendshipStatus.BLOCKED,
      },
    });

    if (!friendship) {
      throw new NotFoundException("User is not blocked");
    }

    // Delete the blocked relationship
    await this.prisma.friendship.delete({
      where: { id: friendship.id },
    });

    return { message: "User unblocked successfully" };
  }

  async getBlockedUsers(userId: string) {
    const blocked = await this.prisma.friendship.findMany({
      where: {
        userId,
        status: FriendshipStatus.BLOCKED,
      },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    return blocked.map((b: (typeof blocked)[number]) => ({
      friendshipId: b.id,
      blockedUser: b.friend,
      createdAt: b.createdAt,
    }));
  }

  // ========================================
  // Friend Status Check
  // ========================================

  async getFriendshipStatus(
    userId: string,
    targetUserId: string,
  ): Promise<{
    status: FriendshipStatus | null;
    friendshipId?: string;
    isRequester?: boolean;
  }> {
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
    });

    if (!friendship) {
      return { status: null };
    }

    return {
      status: friendship.status,
      friendshipId: friendship.id,
      isRequester: friendship.userId === userId,
    };
  }

  // ========================================
  // Statistics
  // ========================================

  async getFriendStats(userId: string) {
    const [friendCount, pendingCount, sentCount] = await Promise.all([
      this.prisma.friendship.count({
        where: {
          OR: [
            { userId, status: FriendshipStatus.ACCEPTED },
            { friendId: userId, status: FriendshipStatus.ACCEPTED },
          ],
        },
      }),
      this.prisma.friendship.count({
        where: {
          friendId: userId,
          status: FriendshipStatus.PENDING,
        },
      }),
      this.prisma.friendship.count({
        where: {
          userId,
          status: FriendshipStatus.PENDING,
        },
      }),
    ]);

    return {
      friendCount,
      pendingIncomingCount: pendingCount,
      pendingOutgoingCount: sentCount,
    };
  }

  /**
   * 유저의 모든 수락된 친구 ID 목록을 효율적으로 조회한다. (Presence 브로드캐스트용)
   */
  async getAcceptedFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: FriendshipStatus.ACCEPTED },
          { friendId: userId, status: FriendshipStatus.ACCEPTED },
        ],
      },
      select: {
        userId: true,
        friendId: true,
      },
    });

    return friendships.map((f) =>
      f.userId === userId ? f.friendId : f.userId,
    );
  }
}
