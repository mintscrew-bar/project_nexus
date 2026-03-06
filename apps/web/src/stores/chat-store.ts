import { create } from 'zustand';
import { connectRoomSocket, disconnectRoomSocket } from '@/lib/socket-client';
import { roomApi } from '@/lib/api-client';
import type { Socket } from 'socket.io-client';

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  createdAt: string;
  avatar?: string;
}

interface ChatStoreState {
  messages: ChatMessage[];
  isConnected: boolean;
  roomId: string | null;
  isLoadingHistory: boolean;

  connect: (roomId: string) => void;
  disconnect: () => void;
  sendMessage: (content: string) => void;
}

// Handler references stored outside the store for stable identity
let messageHandler: ((msg: ChatMessage) => void) | null = null;
let reconnectHandler: (() => void) | null = null;
let disconnectHandler: (() => void) | null = null;
let socketRef: Socket | null = null;

export const useChatStore = create<ChatStoreState>((set, get) => ({
  messages: [],
  isConnected: false,
  roomId: null,
  isLoadingHistory: false,

  connect: (roomId) => {
    // Idempotent: if already connected to same room, skip
    if (get().roomId === roomId && socketRef?.connected) return;

    // Clean up previous listeners if switching rooms
    if (socketRef) {
      if (messageHandler) socketRef.off('new-message', messageHandler);
      if (reconnectHandler) socketRef.off('connect', reconnectHandler);
      if (disconnectHandler) socketRef.off('disconnect', disconnectHandler);
    }

    const socket = connectRoomSocket();
    if (!socket) return;
    socketRef = socket;

    set({ roomId, isConnected: socket.connected });

    // Join Socket.IO room (safe for already-participant: gateway just does socket.join)
    const emitJoin = () => {
      socket.emit('join-room', { roomId }, (response: any) => {
        if (response?.success) {
          set({ isConnected: true });
        }
      });
    };

    if (socket.connected) {
      emitJoin();
    }

    // Load chat history via REST
    set({ isLoadingHistory: true });
    roomApi.getChatMessages(roomId, 100).then((rawMessages) => {
      // Transform Prisma format → ChatBox format & reverse (API returns DESC)
      const history: ChatMessage[] = rawMessages
        .map((m: any) => ({
          id: m.id,
          userId: m.user?.id || m.userId,
          username: m.user?.username || m.username || '알 수 없음',
          message: m.content || m.message,
          createdAt: m.createdAt,
          avatar: m.user?.avatar || m.avatar || undefined,
        }))
        .reverse();

      // Merge with any realtime messages already received (dedup by id)
      set((state) => {
        const existingIds = new Set(state.messages.map((m) => m.id));
        const merged = [
          ...history.filter((m) => !existingIds.has(m.id)),
          ...state.messages,
        ];
        merged.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        return { messages: merged, isLoadingHistory: false };
      });
    }).catch(() => {
      set({ isLoadingHistory: false });
    });

    // Register new-message listener (dedup by id)
    messageHandler = (msg: ChatMessage) => {
      set((state) => {
        if (state.messages.some((m) => m.id === msg.id)) return state;
        return { messages: [...state.messages, msg] };
      });
    };
    socket.on('new-message', messageHandler);

    // Re-join on reconnect
    reconnectHandler = () => {
      set({ isConnected: true });
      emitJoin();
    };
    socket.on('connect', reconnectHandler);

    disconnectHandler = () => {
      set({ isConnected: false });
    };
    socket.on('disconnect', disconnectHandler);
  },

  disconnect: () => {
    if (socketRef) {
      if (messageHandler) socketRef.off('new-message', messageHandler);
      if (reconnectHandler) socketRef.off('connect', reconnectHandler);
      if (disconnectHandler) socketRef.off('disconnect', disconnectHandler);
    }
    messageHandler = null;
    reconnectHandler = null;
    disconnectHandler = null;
    socketRef = null;

    disconnectRoomSocket();
    set({ messages: [], roomId: null, isConnected: false, isLoadingHistory: false });
  },

  sendMessage: (content) => {
    const { roomId } = get();
    if (!socketRef?.connected || !roomId) return;
    socketRef.emit('send-message', { roomId, content });
  },
}));
