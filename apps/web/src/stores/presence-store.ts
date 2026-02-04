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

    if (socket) {
      set({ isConnected: true, myStatus: "ONLINE" });

      // Listen for friend status changes
      presenceSocketHelpers.onFriendStatusChanged((data) => {
        const { userId, status, lastSeenAt } = data;
        const currentStatuses = get().friendStatuses;
        const existing = currentStatuses.get(userId);

        if (existing) {
          const newStatuses = new Map(currentStatuses);
          newStatuses.set(userId, {
            ...existing,
            status: status as UserStatus,
            lastSeenAt,
          });
          set({ friendStatuses: newStatuses });
        }
      });

      // Fetch initial friend statuses
      get().fetchFriendsStatuses();
    }
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
