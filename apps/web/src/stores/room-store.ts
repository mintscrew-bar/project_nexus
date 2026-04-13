import { create } from 'zustand';
import { roomApi } from '@/lib/api-client';
import {
  connectRoomSocket,
  disconnectRoomSocket,
  roomSocketHelpers,
  type RoomListDelta,
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
  captainSelection?: "RANDOM" | "TIER" | "MANUAL" | "VOLUNTEER";
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

    // 기존 리스너 정리 (중복 등록 방지)
    roomSocketHelpers.offAllListeners();

    // 소켓 이벤트 리스너도 정리 (reconnect 핸들러 중복 방지)
    socket.off('connect');
    socket.off('disconnect');

    // 이벤트 리스너 등록 함수 — 재연결 시에도 동일하게 호출
    const setupListeners = () => {
      roomSocketHelpers.offAllListeners(); // 중복 등록 방지

      roomSocketHelpers.onRoomUpdate((room: Room) => {
        set({ currentRoom: room });
      });

      // Server emits { userId, username } for user-joined
      roomSocketHelpers.onParticipantJoined((data: { userId: string; username: string }) => {
        set((state) => ({
          participants: [...state.participants, { id: data.userId, username: data.username, isReady: false }],
        }));
      });

      // Server emits { userId, username } for user-left
      roomSocketHelpers.onParticipantLeft((data: { userId: string }) => {
        set((state) => ({
          participants: state.participants.filter((p) => p.id !== data.userId),
        }));
      });

      // Server emits { userId, isReady } for ready-status-changed
      roomSocketHelpers.onParticipantReady((data: { userId: string; isReady: boolean }) => {
        set((state) => ({
          participants: state.participants.map((p) =>
            p.id === data.userId ? { ...p, isReady: data.isReady } : p
          ),
        }));
      });

      roomSocketHelpers.onNewMessage((message: ChatMessage) => {
        set((state) => {
          const updated = [...state.chatMessages, message];
          // 메모리 누수 방지: 최대 500개 유지 (오래된 메시지부터 제거)
          return { chatMessages: updated.length > 500 ? updated.slice(-500) : updated };
        });
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
    };

    // 최초 리스너 등록 및 방 입장
    setupListeners();
    roomSocketHelpers.joinRoom(roomId);

    // 재연결 시: 이벤트 리스너 전체 재등록 + 방 재입장
    socket.on('connect', () => {
      set({ isConnected: true });
      setupListeners();
      roomSocketHelpers.joinRoom(roomId);
    });
    socket.on('disconnect', () => set({ isConnected: false }));

    set({ isConnected: true });
  },

  disconnectFromRoom: () => {
    const currentRoom = get().currentRoom;
    const roomId = currentRoom?.id; // roomId를 먼저 캡처

    if (roomId) {
      roomSocketHelpers.leaveRoom(roomId);
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

    // 방 목록 delta update 수신 — 변경된 방만 패치
    roomSocketHelpers.onRoomListUpdated((delta: RoomListDelta) => {
      const current = get().rooms;
      if (delta.type === 'add' || delta.type === 'update') {
        // add: 중복 방지를 위해 이미 존재하면 갱신, 없으면 추가
        // update: 목록에 없으면 추가 (재구독 없이 놓친 add 복구)
        // → 두 케이스 모두 동일 로직(upsert)이므로 하나로 처리
        const exists = current.some((r) => r.id === delta.room.id);
        set({ rooms: exists
          ? current.map((r) => r.id === delta.room.id ? delta.room : r)
          : [...current, delta.room],
        });
      } else if (delta.type === 'remove') {
        set({ rooms: current.filter((r) => r.id !== delta.roomId) });
      }
    });

    // Re-subscribe after reconnect — use named function stored on socket
    // to ensure off() can remove the exact same reference
    const reconnectHandler = () => {
      if (get().isSubscribedToRoomList) {
        roomSocketHelpers.subscribeRoomList((response: any) => {
          if (response?.success && response.rooms) {
            set({ rooms: response.rooms });
          }
        });
      }
    };

    // Remove any previously attached reconnect handler (stored reference)
    const prev = (socket as any).__roomListReconnectHandler;
    if (prev) {
      socket.off('connect', prev);
    }
    (socket as any).__roomListReconnectHandler = reconnectHandler;
    socket.on('connect', reconnectHandler);
  },

  unsubscribeFromRoomList: () => {
    roomSocketHelpers.unsubscribeRoomList();
    roomSocketHelpers.offRoomListUpdated();
    set({ isSubscribedToRoomList: false });
  },
}));
