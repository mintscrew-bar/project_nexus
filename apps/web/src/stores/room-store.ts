import { create } from 'zustand';
import { roomApi } from '@/lib/api-client';
import {
  connectRoomSocket,
  disconnectRoomSocket,
  roomSocketHelpers,
} from '@/lib/socket-client';

interface Room {
  id: string;
  name: string;
  hostId: string;
  maxParticipants: number;
  isPrivate: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "DRAFT" | "DRAFT_COMPLETED" | "ROLE_SELECTION" | "TEAM_SELECTION";
  teamMode: "AUCTION" | "SNAKE_DRAFT";
  createdAt: string;
  participants?: any[];
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
  name: string;
  maxParticipants: 10 | 15 | 20 | 30 | 40;
  teamMode: "AUCTION" | "SNAKE_DRAFT";
  password?: string;
  allowSpectators?: boolean;
  // Auction settings
  startingPoints?: number;
  minBidIncrement?: number;
  bidTimeLimit?: number;
  // Snake draft settings
  pickTimeLimit?: number;
  captainSelection?: "RANDOM" | "TIER";
  // Bracket format
  bracketFormat?: string;
}

interface RoomStoreState {
  rooms: Room[];
  currentRoom: Room | null;
  participants: Participant[];
  chatMessages: ChatMessage[];
  typingUsers: Map<string, string>; // userId -> username
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  isSubscribedToRoomList: boolean;

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
  setTypingStatus: (roomId: string, isTyping: boolean) => void;

  // Room list subscription methods
  subscribeToRoomList: () => void;
  unsubscribeFromRoomList: () => void;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  participants: [],
  chatMessages: [],
  typingUsers: new Map<string, string>(),
  isLoading: false,
  error: null,
  isConnected: false,
  isSubscribedToRoomList: false,

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
    if (!socket) return; // 토큰 없으면 소켓 미연결

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

    roomSocketHelpers.onUserTyping((data: { userId: string; username: string }) => {
      set((state) => {
        const newTypingUsers = new Map(state.typingUsers);
        newTypingUsers.set(data.userId, data.username);
        return { typingUsers: newTypingUsers };
      });
    });

    roomSocketHelpers.onUserStoppedTyping((data: { userId: string }) => {
      set((state) => {
        const newTypingUsers = new Map(state.typingUsers);
        newTypingUsers.delete(data.userId);
        return { typingUsers: newTypingUsers };
      });
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
    set({ isConnected: false, currentRoom: null, participants: [], chatMessages: [], typingUsers: new Map() });
  },

  sendChatMessage: (roomId: string, message: string) => {
    roomSocketHelpers.sendMessage(roomId, message);
  },

  setTypingStatus: (roomId: string, isTyping: boolean) => {
    roomSocketHelpers.sendIsTyping(roomId, isTyping);
  },

  subscribeToRoomList: () => {
    if (get().isSubscribedToRoomList) return;

    const socket = connectRoomSocket();
    if (!socket) return; // 토큰 없으면 연결 안 함 → 구독 스킵

    // Subscribe and get initial room list
    roomSocketHelpers.subscribeRoomList((response: any) => {
      if (response?.success && response.rooms) {
        set({ rooms: response.rooms, isSubscribedToRoomList: true });
      }
    });

    // Listen for room list updates
    roomSocketHelpers.onRoomListUpdated((rooms: Room[]) => {
      set({ rooms });
    });
  },

  unsubscribeFromRoomList: () => {
    roomSocketHelpers.unsubscribeRoomList();
    roomSocketHelpers.offRoomListUpdated();
    set({ isSubscribedToRoomList: false });
  },
}));
