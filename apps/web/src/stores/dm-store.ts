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
    // FriendsPanel에서 호출 시 현재 유저 ID를 기준으로 partnerId 결정
    // message.senderId === 나 → partnerId = receiverId (내가 보낸 메시지)
    // message.senderId !== 나 → partnerId = senderId (상대가 보낸 메시지)
    // openChatUserId가 null일 수 있으므로, 양쪽 모두에 저장
    const { openChatUserId } = get();

    // 대화 상대 ID 추론: openChatUserId와 일치하는 쪽이 상대방
    let partnerId: string;
    if (openChatUserId === message.senderId) {
      // 현재 열린 대화 상대가 보낸 메시지
      partnerId = message.senderId;
    } else if (openChatUserId === message.receiverId) {
      // 내가 현재 열린 대화 상대에게 보낸 메시지
      partnerId = message.receiverId;
    } else {
      // 현재 열린 대화와 무관한 메시지 (다른 사람에게서 온 DM)
      partnerId = message.senderId;
    }

    set((state) => {
      const existing = state.messages[partnerId] ?? [];
      if (existing.some((m) => m.id === message.id)) return state;
      return {
        messages: { ...state.messages, [partnerId]: [...existing, message] },
      };
    });
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
