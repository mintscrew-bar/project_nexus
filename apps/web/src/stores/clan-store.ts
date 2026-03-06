import { create } from "zustand";
import { clanApi } from "@/lib/api-client";
import {
  connectClanSocket,
  disconnectClanSocket,
  clanSocketHelpers,
} from "@/lib/socket-client";

// ========================================
// 타입 정의
// ========================================

interface ClanMember {
  id: string;
  userId: string;
  role: "OWNER" | "OFFICER" | "MEMBER";
  joinedAt: string;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

interface Clan {
  id: string;
  name: string;
  tag: string;
  ownerId: string;
  description?: string;
  isRecruiting: boolean;
  minTier?: string;
  discord?: string;
  createdAt: string;
  updatedAt: string;
  members: ClanMember[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export interface ClanAnnouncement {
  id: string;
  clanId: string;
  authorId: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  author: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

// ========================================
// 스토어 타입
// ========================================

interface ClanStoreState {
  currentClan: Clan | null;
  chatMessages: ChatMessage[];
  chatNextCursor: string | null;    // 이전 메시지 로드용 커서
  isLoadingMore: boolean;           // 이전 메시지 로드 중 여부
  announcements: ClanAnnouncement[]; // 공지사항 목록
  unreadCount: number;              // 읽지 않은 메시지 수
  typingUsers: Map<string, string>; // userId -> username
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // REST API 메서드
  fetchClan: (clanId: string) => Promise<void>;
  fetchChatMessages: (clanId: string) => Promise<void>;
  fetchMoreMessages: (clanId: string) => Promise<void>; // 이전 메시지 로드
  deleteChatMessage: (clanId: string, messageId: string) => Promise<void>;
  fetchAnnouncements: (clanId: string) => Promise<void>;

  // 미읽음 카운트
  incrementUnread: () => void;
  resetUnread: () => void;

  // WebSocket 메서드
  connectToClan: (clanId: string) => void;
  disconnectFromClan: () => void;
  sendChatMessage: (clanId: string, message: string) => void;
  setTypingStatus: (clanId: string, isTyping: boolean) => void;
}

// ========================================
// 스토어 구현
// ========================================

export const useClanStore = create<ClanStoreState>((set, get) => ({
  currentClan: null,
  chatMessages: [],
  chatNextCursor: null,
  isLoadingMore: false,
  announcements: [],
  unreadCount: 0,
  typingUsers: new Map<string, string>(),
  isConnected: false,
  isLoading: false,
  error: null,

  fetchClan: async (clanId: string) => {
    set({ isLoading: true, error: null });
    try {
      const clan = await clanApi.getClan(clanId);
      set({ currentClan: clan, isLoading: false });
    } catch (err: any) {
      set({
        error:
          err.response?.data?.message ||
          err.message ||
          "Failed to fetch clan.",
        isLoading: false,
      });
    }
  },

  fetchChatMessages: async (clanId: string) => {
    try {
      const result = await clanApi.getChatMessages(clanId, undefined, 50);
      set({
        chatMessages: result.messages,
        chatNextCursor: result.nextCursor,
      });
    } catch (err: any) {
      set({ error: err.message || "Failed to fetch chat messages." });
    }
  },

  fetchMoreMessages: async (clanId: string) => {
    const { chatNextCursor, isLoadingMore } = get();
    if (!chatNextCursor || isLoadingMore) return;

    set({ isLoadingMore: true });
    try {
      const result = await clanApi.getChatMessages(clanId, chatNextCursor, 50);
      set((state) => ({
        // 이전 메시지를 앞에 추가 (오래된 메시지부터)
        chatMessages: [...result.messages, ...state.chatMessages],
        chatNextCursor: result.nextCursor,
        isLoadingMore: false,
      }));
    } catch (err: any) {
      set({ isLoadingMore: false });
    }
  },

  deleteChatMessage: async (clanId: string, messageId: string) => {
    try {
      await clanApi.deleteChatMessage(clanId, messageId);
      // 로컬 상태에서 소프트 삭제 처리 (소켓 이벤트로도 처리되지만 즉각 반영)
      set((state) => ({
        chatMessages: state.chatMessages.filter((m) => m.id !== messageId),
      }));
    } catch (err: any) {
      set({ error: err.message || "Failed to delete message." });
    }
  },

  fetchAnnouncements: async (clanId: string) => {
    try {
      const announcements = await clanApi.getAnnouncements(clanId);
      set({ announcements });
    } catch {
      // 멤버가 아닌 경우 무시
    }
  },

  incrementUnread: () => {
    set((state) => ({ unreadCount: state.unreadCount + 1 }));
  },

  resetUnread: () => {
    set({ unreadCount: 0 });
  },

  connectToClan: (clanId: string) => {
    const socket = connectClanSocket();
    // 중복 리스너 방지를 위해 기존 리스너 제거
    clanSocketHelpers.offAllListeners();

    clanSocketHelpers.joinClan(clanId);

    // 새 메시지 수신
    clanSocketHelpers.onNewMessage((message: ChatMessage) => {
      set((state) => ({
        chatMessages: [...state.chatMessages, message],
        unreadCount: state.unreadCount + 1,
      }));
    });

    // 메시지 삭제 이벤트
    clanSocketHelpers.onMessageDeleted((data: { messageId: string }) => {
      set((state) => ({
        chatMessages: state.chatMessages.filter((m) => m.id !== data.messageId),
      }));
    });

    // 공지사항 생성 이벤트
    clanSocketHelpers.onAnnouncementCreated((announcement: ClanAnnouncement) => {
      set((state) => ({
        announcements: [announcement, ...state.announcements],
      }));
    });

    // 공지사항 삭제 이벤트
    clanSocketHelpers.onAnnouncementDeleted(
      (data: { announcementId: string }) => {
        set((state) => ({
          announcements: state.announcements.filter(
            (a) => a.id !== data.announcementId,
          ),
        }));
      },
    );

    // 타이핑 이벤트
    clanSocketHelpers.onUserTyping(
      (data: { userId: string; username: string }) => {
        set((state) => {
          const newTypingUsers = new Map(state.typingUsers);
          newTypingUsers.set(data.userId, data.username);
          return { typingUsers: newTypingUsers };
        });
      },
    );

    clanSocketHelpers.onUserStoppedTyping((data: { userId: string }) => {
      set((state) => {
        const newTypingUsers = new Map(state.typingUsers);
        newTypingUsers.delete(data.userId);
        return { typingUsers: newTypingUsers };
      });
    });

    // 클랜 정보 변경 시 currentClan 갱신
    clanSocketHelpers.onClanUpdated((updatedClan: Clan) => {
      set({ currentClan: updatedClan });
    });

    // 클랜 해체 시 상태 초기화
    clanSocketHelpers.onClanDeleted(() => {
      set({ currentClan: null, chatMessages: [], announcements: [] });
    });

    // 재연결 시 클랜 채팅 룸 재입장
    socket?.on("connect", () => {
      set({ isConnected: true });
      clanSocketHelpers.joinClan(clanId);
    });
    socket?.on("disconnect", () => set({ isConnected: false }));

    set({ isConnected: true });
  },

  disconnectFromClan: () => {
    const currentClan = get().currentClan;
    if (currentClan) {
      clanSocketHelpers.leaveClan(currentClan.id);
    }
    clanSocketHelpers.offAllListeners();
    disconnectClanSocket();
    set({
      isConnected: false,
      currentClan: null,
      chatMessages: [],
      chatNextCursor: null,
      announcements: [],
      unreadCount: 0,
      typingUsers: new Map(),
    });
  },

  sendChatMessage: (clanId: string, message: string) => {
    clanSocketHelpers.sendMessage(clanId, message);
  },

  setTypingStatus: (clanId: string, isTyping: boolean) => {
    clanSocketHelpers.sendIsTyping(clanId, isTyping);
  },
}));
