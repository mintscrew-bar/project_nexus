import { create } from 'zustand';
import { clanApi } from '@/lib/api-client';
import {
  connectClanSocket,
  disconnectClanSocket,
  clanSocketHelpers,
} from '@/lib/socket-client';

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
  members: any[]; // Simplified for now
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatar: string | null;
  content: string;
  createdAt: string;
}

interface ClanStoreState {
  currentClan: Clan | null;
  chatMessages: ChatMessage[];
  typingUsers: Map<string, string>; // userId -> username
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // REST API methods
  fetchClan: (clanId: string) => Promise<void>;
  fetchChatMessages: (clanId: string) => Promise<void>;

  // WebSocket methods
  connectToClan: (clanId: string) => void;
  disconnectFromClan: () => void;
  sendChatMessage: (clanId: string, message: string) => void;
  setTypingStatus: (clanId: string, isTyping: boolean) => void;
}

export const useClanStore = create<ClanStoreState>((set, get) => ({
  currentClan: null,
  chatMessages: [],
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
        error: err.response?.data?.message || err.message || "Failed to fetch clan.",
        isLoading: false,
      });
    }
  },

  fetchChatMessages: async (clanId: string) => {
    try {
      const messages = await clanApi.getChatMessages(clanId);
      set({ chatMessages: messages });
    } catch (err: any) {
      set({ error: err.message || "Failed to fetch chat messages." });
    }
  },

  connectToClan: (clanId: string) => {
    const socket = connectClanSocket();

    clanSocketHelpers.joinClan(clanId);

    clanSocketHelpers.onNewMessage((message: ChatMessage) => {
      set((state) => ({
        chatMessages: [...state.chatMessages, message],
      }));
    });

    clanSocketHelpers.onUserTyping((data: { userId: string; username: string }) => {
      set((state) => {
        const newTypingUsers = new Map(state.typingUsers);
        newTypingUsers.set(data.userId, data.username);
        return { typingUsers: newTypingUsers };
      });
    });

    clanSocketHelpers.onUserStoppedTyping((data: { userId: string }) => {
      set((state) => {
        const newTypingUsers = new Map(state.typingUsers);
        newTypingUsers.delete(data.userId);
        return { typingUsers: newTypingUsers };
      });
    });

    // Other clan-related listeners can go here if needed
    // clanSocketHelpers.onMemberJoined(...)
    // clanSocketHelpers.onMemberLeft(...)

    set({ isConnected: true });
  },

  disconnectFromClan: () => {
    const currentClan = get().currentClan;
    if (currentClan) {
      clanSocketHelpers.leaveClan(currentClan.id);
    }
    clanSocketHelpers.offAllListeners();
    disconnectClanSocket();
    set({ isConnected: false, currentClan: null, chatMessages: [], typingUsers: new Map() });
  },

  sendChatMessage: (clanId: string, message: string) => {
    clanSocketHelpers.sendMessage(clanId, message);
  },

  setTypingStatus: (clanId: string, isTyping: boolean) => {
    clanSocketHelpers.sendIsTyping(clanId, isTyping);
  },
}));