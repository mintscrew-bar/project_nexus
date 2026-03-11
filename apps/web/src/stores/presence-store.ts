import { create } from "zustand";
import { presenceApi } from "@/lib/api-client";
import {
  connectPresenceSocket,
  disconnectPresenceSocket,
  presenceSocketHelpers,
} from "@/lib/socket-client";

export type UserStatus = "ONLINE" | "OFFLINE" | "AWAY";

interface FriendStatus {
  id: string;
  username: string;
  avatar: string | null;
  status: UserStatus;
  lastSeenAt: string | null;
  // Room info — populated by presence socket when available
  currentRoomId?: string | null;
  currentRoomName?: string | null;
  currentRoomIsPrivate?: boolean;
}

interface PresenceStoreState {
  myStatus: UserStatus;
  friendStatuses: Map<string, FriendStatus>;
  isConnected: boolean;
  isLoading: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  setStatus: (status: "ONLINE" | "AWAY") => Promise<void>;
  fetchFriendsStatuses: () => Promise<void>;
  getFriendStatus: (friendId: string) => FriendStatus | undefined;
}

export const usePresenceStore = create<PresenceStoreState>((set, get) => ({
  myStatus: "OFFLINE",
  friendStatuses: new Map(),
  isConnected: false,
  isLoading: false,

  connect: () => {
    const socket = connectPresenceSocket();
    if (!socket) return;

    // Clear existing listeners to prevent duplication
    presenceSocketHelpers.offAllListeners();

    set({ isConnected: true, myStatus: "ONLINE" });

    // Listen for friend status changes
    presenceSocketHelpers.onFriendStatusChanged((data) => {
      const { userId, status, lastSeenAt, currentRoomId, currentRoomName, currentRoomIsPrivate } = data as any;
      const currentStatuses = get().friendStatuses;
      const existing = currentStatuses.get(userId);

      if (existing) {
        const newStatuses = new Map(currentStatuses);
        newStatuses.set(userId, {
          ...existing,
          status: status as UserStatus,
          lastSeenAt,
          ...(currentRoomId !== undefined && { currentRoomId, currentRoomName, currentRoomIsPrivate }),
        });
        set({ friendStatuses: newStatuses });
      }
    });

    // Re-establish presence on reconnect (기존 핸들러 제거 후 등록)
    socket.off('connect');
    socket.off('disconnect');
    socket.on('connect', () => {
      set({ isConnected: true, myStatus: "ONLINE" });
      presenceSocketHelpers.setStatus("ONLINE");
    });
    socket.on('disconnect', () => set({ isConnected: false }));

    // Fetch initial friend statuses
    get().fetchFriendsStatuses();
  },

  disconnect: () => {
    disconnectPresenceSocket();
    set({ isConnected: false, myStatus: "OFFLINE" });
  },

  setStatus: async (status: "ONLINE" | "AWAY") => {
    try {
      await presenceApi.updateMyStatus(status);
      set({ myStatus: status });

      // Also update via WebSocket for real-time sync
      presenceSocketHelpers.setStatus(status);
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  },

  fetchFriendsStatuses: async () => {
    set({ isLoading: true });
    try {
      const friends = await presenceApi.getFriendsStatuses();
      const statusMap = new Map<string, FriendStatus>();

      for (const friend of friends) {
        statusMap.set(friend.id, {
          id: friend.id,
          username: friend.username,
          avatar: friend.avatar,
          status: friend.status as UserStatus,
          lastSeenAt: friend.lastSeenAt,
        });
      }

      set({ friendStatuses: statusMap, isLoading: false });
    } catch (error) {
      console.error("Failed to fetch friends statuses:", error);
      set({ isLoading: false });
    }
  },

  getFriendStatus: (friendId: string) => {
    return get().friendStatuses.get(friendId);
  },
}));
