import { create } from "zustand";
import { presenceApi } from "@/lib/api-client";
import { toast } from "@/stores/toast-store";
import {
  connectPresenceSocket,
  disconnectPresenceSocket,
  presenceSocketHelpers,
} from "@/lib/socket-client";

export type UserStatus = "ONLINE" | "OFFLINE" | "AWAY";

const FRIEND_STATUS_FETCH_INTERVAL_MS = 300_000; // 5분으로 연장 (푸시 기반 시스템이 메인이므로 폴백 용도로만 사용)

let friendsStatusesRequest: Promise<void> | null = null;
let lastFriendsStatusesFetchedAt = 0;

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
  // 수동으로 오프라인 설정 시 자동 감지를 억제하는 플래그
  isManualOffline: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  setStatus: (status: "ONLINE" | "AWAY" | "OFFLINE") => Promise<void>;
  fetchFriendsStatuses: () => Promise<void>;
  getFriendStatus: (friendId: string) => FriendStatus | undefined;
}

export const usePresenceStore = create<PresenceStoreState>((set, get) => ({
  myStatus: "OFFLINE",
  friendStatuses: new Map(),
  isConnected: false,
  isLoading: false,
  isManualOffline: false,

  connect: () => {
    const socket = connectPresenceSocket();
    if (!socket) return;

    if (get().isConnected && socket.connected) {
      void get().fetchFriendsStatuses();
      return;
    }

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
    void get().fetchFriendsStatuses();
  },

  disconnect: () => {
    disconnectPresenceSocket();
    set({ isConnected: false, myStatus: "OFFLINE" });
  },

  setStatus: async (status: "ONLINE" | "AWAY" | "OFFLINE") => {
    try {
      if (status === "OFFLINE") {
        // 수동 오프라인: 소켓 연결 해제 → 서버가 자동으로 OFFLINE 처리
        set({ myStatus: "OFFLINE", isManualOffline: true });
        disconnectPresenceSocket();
        return;
      }

      // 오프라인에서 온라인/자리비움으로 복귀 시 소켓 재연결
      if (get().isManualOffline) {
        set({ isManualOffline: false });
        get().connect();
      }

      await presenceApi.updateMyStatus(status);
      set({ myStatus: status });
      presenceSocketHelpers.setStatus(status);
    } catch (error) {
      toast.error("상태 변경에 실패했습니다.");
      console.error("Failed to update status:", error);
    }
  },

  fetchFriendsStatuses: async () => {
    const now = Date.now();
    if (friendsStatusesRequest) {
      return friendsStatusesRequest;
    }
    if (now - lastFriendsStatusesFetchedAt < FRIEND_STATUS_FETCH_INTERVAL_MS) {
      return;
    }

    set({ isLoading: true });
    friendsStatusesRequest = (async () => {
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

        lastFriendsStatusesFetchedAt = Date.now();
        set({ friendStatuses: statusMap });
      } catch (error: any) {
        // 백그라운드 조회 — 재연결마다 호출되므로 실패해도 토스트로 스팸하지 않는다(콘솔만).
        console.error("Failed to fetch friends statuses:", error);
        lastFriendsStatusesFetchedAt = Date.now();
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          set({ friendStatuses: new Map() });
        }
      } finally {
        set({ isLoading: false });
        friendsStatusesRequest = null;
      }
    })();

    return friendsStatusesRequest;
  },

  getFriendStatus: (friendId: string) => {
    return get().friendStatuses.get(friendId);
  },
}));
