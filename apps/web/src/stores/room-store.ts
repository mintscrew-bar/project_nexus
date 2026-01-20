import { create } from 'zustand';
import { roomApi } from '@/lib/api-client';
import {
  connectRoomSocket,
  disconnectRoomSocket,
  roomSocketHelpers,
} from '@/lib/socket-client';

interface Room {
  id: string;
  title: string;
  hostId: string;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED";
  mode: "AUCTION" | "SNAKE_DRAFT";
  createdAt: string;
}

interface Participant {
  id: string;
  username: string;
  isReady: boolean;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  createdAt: string;
}

interface RoomCreationData {
  title: string;
  maxSize: 10 | 15 | 20;
  mode: "AUCTION" | "SNAKE_DRAFT";
  isPrivate: boolean;
  password?: string;
}

interface RoomStoreState {
  rooms: Room[];
  currentRoom: Room | null;
  participants: Participant[];
  chatMessages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;

  // REST API methods
  fetchRooms: (params?: { mode?: string; status?: string }) => Promise<void>;
  createRoom: (data: RoomCreationData) => Promise<Room | null>;
  joinRoom: (roomId: string, password?: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
  toggleReady: (roomId: string) => Promise<void>;
  fetchChatMessages: (roomId: string) => Promise<void>;

  // WebSocket methods
  connectToRoom: (roomId: string) => void;
  disconnectFromRoom: () => void;
  sendChatMessage: (roomId: string, message: string) => void;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  participants: [],
  chatMessages: [],
  isLoading: false,
  error: null,
  isConnected: false,

  fetchRooms: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const rooms = await roomApi.getRooms(params);
      set({ rooms, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || "Failed to fetch rooms.", isLoading: false });
    }
  },

  createRoom: async (data: RoomCreationData) => {
    set({ isLoading: true, error: null });
    try {
      const room = await roomApi.createRoom(data);
      get().fetchRooms();
      set({ isLoading: false });
      return room;
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to create room.",
        isLoading: false,
      });
      return null;
    }
  },

  joinRoom: async (roomId: string, password?: string) => {
    set({ isLoading: true, error: null });
    try {
      const room = await roomApi.joinRoom(roomId, password);
      set({ currentRoom: room, isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to join room.",
        isLoading: false,
      });
    }
  },

  leaveRoom: async (roomId: string) => {
    try {
      await roomApi.leaveRoom(roomId);
      set({ currentRoom: null });
      get().disconnectFromRoom();
    } catch (err: any) {
      set({ error: err.response?.data?.message || err.message || "Failed to leave room." });
    }
  },

  toggleReady: async (roomId: string) => {
    try {
      await roomApi.toggleReady(roomId);
    } catch (err: any) {
      set({ error: err.response?.data?.message || err.message || "Failed to toggle ready." });
    }
  },

  fetchChatMessages: async (roomId: string) => {
    try {
      const messages = await roomApi.getChatMessages(roomId);
      set({ chatMessages: messages });
    } catch (err: any) {
      set({ error: err.message || "Failed to fetch chat messages." });
    }
  },

  connectToRoom: (roomId: string) => {
    const socket = connectRoomSocket();

    roomSocketHelpers.joinRoom(roomId);

    roomSocketHelpers.onRoomUpdate((room: Room) => {
      set({ currentRoom: room });
    });

    roomSocketHelpers.onParticipantJoined((data: { participant: Participant }) => {
      set((state) => ({
        participants: [...state.participants, data.participant],
      }));
    });

    roomSocketHelpers.onParticipantLeft((data: { userId: string }) => {
      set((state) => ({
        participants: state.participants.filter((p) => p.id !== data.userId),
      }));
    });

    roomSocketHelpers.onParticipantReady((data: { userId: string; isReady: boolean }) => {
      set((state) => ({
        participants: state.participants.map((p) =>
          p.id === data.userId ? { ...p, isReady: data.isReady } : p
        ),
      }));
    });

    roomSocketHelpers.onNewMessage((message: ChatMessage) => {
      set((state) => ({
        chatMessages: [...state.chatMessages, message],
      }));
    });

    set({ isConnected: true });
  },

  disconnectFromRoom: () => {
    const currentRoom = get().currentRoom;
    if (currentRoom) {
      roomSocketHelpers.leaveRoom(currentRoom.id);
    }
    roomSocketHelpers.offAllListeners();
    disconnectRoomSocket();
    set({ isConnected: false, currentRoom: null, participants: [], chatMessages: [] });
  },

  sendChatMessage: (roomId: string, message: string) => {
    roomSocketHelpers.sendMessage(roomId, message);
  },
}));
