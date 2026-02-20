import { create } from 'zustand';

export interface DirectMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  sender: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

export interface ConversationSummary {
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
  lastMessage: string;
  lastAt: string;
  unread: number;
}

interface DmStore {
  openChatUserId: string | null;
  messages: Record<string, DirectMessage[]>;       // userId → messages
  hasMore: Record<string, boolean>;                // userId → hasMore
  nextCursor: Record<string, string | null>;       // userId → cursor
  unreadCounts: Record<string, number>;            // userId → unread count
  totalUnread: number;
  conversations: ConversationSummary[];
  typingUsers: Record<string, boolean>;            // userId → isTyping

  openChat: (userId: string) => void;
  closeChat: () => void;

  setMessages: (userId: string, messages: DirectMessage[], nextCursor: string | null) => void;
  prependMessages: (userId: string, messages: DirectMessage[], nextCursor: string | null) => void;
  appendMessage: (message: DirectMessage) => void;

  setUnreadCount: (userId: string, count: number) => void;
  setTotalUnread: (total: number) => void;
  clearUnread: (userId: string) => void;

  setConversations: (conversations: ConversationSummary[]) => void;
  updateConversationLastMessage: (userId: string, message: DirectMessage) => void;

  setTyping: (userId: string, isTyping: boolean) => void;
}

export const useDmStore = create<DmStore>((set, get) => ({
  openChatUserId: null,
  messages: {},
  hasMore: {},
  nextCursor: {},
  unreadCounts: {},
  totalUnread: 0,
  conversations: [],
  typingUsers: {},

  openChat: (userId) => set({ openChatUserId: userId }),
  closeChat: () => set({ openChatUserId: null }),

  setMessages: (userId, messages, nextCursor) =>
    set((state) => ({
      messages: { ...state.messages, [userId]: messages },
      nextCursor: { ...state.nextCursor, [userId]: nextCursor },
      hasMore: { ...state.hasMore, [userId]: nextCursor !== null },
    })),

  prependMessages: (userId, older, nextCursor) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [userId]: [...older, ...(state.messages[userId] ?? [])],
      },
      nextCursor: { ...state.nextCursor, [userId]: nextCursor },
      hasMore: { ...state.hasMore, [userId]: nextCursor !== null },
    })),

  appendMessage: (message) => {
    const otherUserId =
      message.senderId === get().openChatUserId
        ? message.senderId
        : message.receiverId;
    // 실제로 대화 파트너의 ID를 key로 사용
    const partnerId =
      message.senderId === get().openChatUserId
        ? message.receiverId
        : message.senderId;

    set((state) => {
      const existing = state.messages[partnerId] ?? [];
      // 중복 방지
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messages: { ...state.messages, [partnerId]: [...existing, message] },
      };
    });
    void otherUserId; // suppress unused
  },

  setUnreadCount: (userId, count) =>
    set((state) => ({ unreadCounts: { ...state.unreadCounts, [userId]: count } })),

  setTotalUnread: (total) => set({ totalUnread: total }),

  clearUnread: (userId) =>
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [userId]: 0 },
    })),

  setConversations: (conversations) => set({ conversations }),

  updateConversationLastMessage: (userId, message) =>
    set((state) => {
      const existing = state.conversations.find((c) => c.user.id === userId);
      if (!existing) return state;
      return {
        conversations: state.conversations.map((c) =>
          c.user.id === userId
            ? { ...c, lastMessage: message.content, lastAt: message.createdAt }
            : c,
        ),
      };
    }),

  setTyping: (userId, isTyping) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [userId]: isTyping },
    })),
}));
