import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserStatus } from "@nexus/database";

@Injectable()
export class PresenceService {
  // In-memory store for active connections
  private userConnections = new Map<string, Set<string>>(); // userId -> Set of socketIds

  constructor(private readonly prisma: PrismaService) {}

  async setUserOnline(userId: string, socketId: string): Promise<void> {
    // Add socket to user's connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(socketId);

    // Update database status
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.ONLINE,
        lastSeenAt: new Date(),
      },
    });
  }

  async setUserOffline(userId: string, socketId: string): Promise<boolean> {
    // Remove socket from user's connections
    const sockets = this.userConnections.get(userId);
    if (sockets) {
      sockets.delete(socketId);

      // Only set offline if no more connections
      if (sockets.size === 0) {
        this.userConnections.delete(userId);

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            status: UserStatus.OFFLINE,
            lastSeenAt: new Date(),
          },
        });

        return true; // User is now fully offline
      }
    }

    return false; // User still has other connections
  }

  async updateStatus(userId: string, status: UserStatus): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status,
        lastSeenAt: new Date(),
      },
    });
  }

  async getUserStatus(userId: string): Promise<{ status: UserStatus; lastSeenAt: Date | null }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        lastSeenAt: true,
        settings: {
          select: {
            showOnlineStatus: true,
          },
        },
      },
    });

    if (!user) {
      return { status: UserStatus.OFFLINE, lastSeenAt: null };
    }

    // If user has disabled online status visibility, return offline
    if (user.settings && !user.settings.showOnlineStatus) {
      return { status: UserStatus.OFFLINE, lastSeenAt: null };
    }

    return {
      status: user.status,
      lastSeenAt: user.lastSeenAt,
    };
  }

  async getFriendsStatuses(userId: string): Promise<Array<{
    id: string;
    username: string;
    avatar: string | null;
    status: UserStatus;
    lastSeenAt: Date | null;
  }>> {
    // Get accepted friendships where this user is involved
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: "ACCEPTED" },
          { friendId: userId, status: "ACCEPTED" },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            status: true,
            lastSeenAt: true,
            settings: {
              select: {
                showOnlineStatus: true,
              },
            },
          },
        },
        friend: {
          select: {
            id: true,
            username: true,
            avatar: true,
            status: true,
            lastSeenAt: true,
            settings: {
              select: {
                showOnlineStatus: true,
              },
            },
          },
        },
      },
    });

    // Extract friend info (the other person in the friendship)
    return friendships.map((f) => {
      const friend = f.userId === userId ? f.friend : f.user;
      const showStatus = friend.settings?.showOnlineStatus ?? true;

      return {
        id: friend.id,
        username: friend.username,
        avatar: friend.avatar,
        status: showStatus ? friend.status : UserStatus.OFFLINE,
        lastSeenAt: showStatus ? friend.lastSeenAt : null,
      };
    });
  }

  async getFriendIds(userId: string): Promise<string[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { userId, status: "ACCEPTED" },
          { friendId: userId, status: "ACCEPTED" },
        ],
      },
      select: {
        userId: true,
        friendId: true,
      },
    });

    return friendships.map((f) =>
      f.userId === userId ? f.friendId : f.userId
    );
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.userConnections.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }

  getOnlineUserIds(): string[] {
    return Array.from(this.userConnections.keys());
  }
}
