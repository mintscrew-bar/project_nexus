import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { roomApi, getAccessToken } from '@/lib/api-client';

// Placeholder Types - should eventually come from @nexus/types
interface ChampionPreference {
  id: string;
  championId: string;
  role: string;
  order: number;
}

interface RiotAccount {
  gameName: string;
  tagLine: string;
  tier: string | null;
  rank: string | null;
  mainRole: string | null;
  subRole: string | null;
  championPreferences?: ChampionPreference[];
}

interface Participant {
  id: string;
  userId: string;
  username: string;
  avatar?: string | null;
  isHost: boolean;
  isReady: boolean;
  riotAccount?: RiotAccount | null;
}

interface Room {
  id: string;
  name: string;
  hostId: string;
  maxParticipants: number;
  isPrivate: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "DRAFT" | "DRAFT_COMPLETED" | "TEAM_SELECTION" | "ROLE_SELECTION";
  teamMode: "AUCTION" | "SNAKE_DRAFT";
  participants: Participant[];
  // Extended settings
  allowSpectators?: boolean;
  startingPoints?: number;
  minBidIncrement?: number;
  bidTimeLimit?: number;
  pickTimeLimit?: number;
  captainSelection?: "RANDOM" | "TIER";
  bracketFormat?: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  createdAt: string;
  avatar?: string;
}

export interface RoomSettingsDto {
  name?: string;
  password?: string | null;
  maxParticipants?: number;
  teamMode?: "AUCTION" | "SNAKE_DRAFT";
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

interface LobbyStoreState {
  socket: Socket | null;
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  gameStarting: boolean;
  messages: ChatMessage[];

  connect: (roomId: string, password?: string) => void;
  disconnect: (options?: { skipLeave?: boolean }) => void;
  setReady: (isReady?: boolean, onError?: (msg: string) => void) => void;
  startGame: (onError?: (msg: string) => void) => void;
  sendMessage: (content: string) => void;
  updateRoomSettings: (roomId: string, settings: RoomSettingsDto) => Promise<void>;
  kickParticipant: (roomId: string, participantId: string) => Promise<void>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const useLobbyStore = create<LobbyStoreState>((set, get) => ({
  socket: null,
  room: null,
  isConnected: false,
  error: null,
  gameStarting: false,
  messages: [],

  connect: (roomId, password?) => {
    const existingSocket = get().socket;
    // reconnect 시도 중이거나 이미 연결된 경우 중복 연결 방지
    if (existingSocket?.connected || existingSocket?.active) return;
    // Clean up stale disconnected socket
    if (existingSocket) {
      existingSocket.removeAllListeners();
      existingSocket.disconnect();
      set({ socket: null });
    }

    const socket = io(`${API_URL}/room`, {
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });

    socket.on('connect', () => {
      set({ isConnected: true, error: null });
      socket.emit('join-room', { roomId, password }, (response: any) => {
        if (response.success) {
          set({ room: response.room, error: null, isConnected: true });
        } else {
          // reconnect 실패 시 명확하게 에러 상태로 전환
          // (방이 삭제되었거나, 이미 시작되었거나, 비밀번호 오류 등)
          set({
            room: null,
            error: response.error || 'Failed to join room.',
            isConnected: false
          });
        }
      });
    });

    socket.on('disconnect', () => {
      // room 데이터는 유지 — 재연결 시 connect 핸들러에서 자동 rejoin
      set({ isConnected: false });
    });

    socket.on('connect_error', (err) => {
      set({ error: err.message, isConnected: false });
    });

    socket.on('room-updated', (updatedRoom: Room) => {
      set({ room: updatedRoom });
    });
    
    socket.on('participant-kicked', (data: { participantId: string }) => {
      const currentRoom = get().room;
      if (currentRoom) {
        set({
          room: {
            ...currentRoom,
            participants: currentRoom.participants.filter(p => p.id !== data.participantId),
          },
        });
      }
    });

    // Listen for user join/leave events to update participant list
    socket.on('user-joined', (data: { userId: string; username: string }) => {
      const currentRoom = get().room;
      if (currentRoom && !currentRoom.participants.some(p => p.userId === data.userId)) {
        set({
          room: {
            ...currentRoom,
            participants: [...currentRoom.participants, { id: data.userId, userId: data.userId, username: data.username, isHost: false, isReady: false }],
          },
        });
      }
    });

    socket.on('user-left', (data: { userId: string }) => {
      const currentRoom = get().room;
      if (currentRoom) {
        set({
          room: {
            ...currentRoom,
            participants: currentRoom.participants.filter(p => p.userId !== data.userId),
          },
        });
      }
    });

    socket.on('ready-status-changed', (data: { userId: string; isReady: boolean }) => {
      const currentRoom = get().room;
      if (currentRoom) {
        const updatedParticipants = currentRoom.participants.map(p =>
          p.userId === data.userId ? { ...p, isReady: data.isReady } : p
        );
        set({ room: { ...currentRoom, participants: updatedParticipants } });
      }
    });

    socket.on('all-ready', () => {
      console.log('All players ready!');
    });

    socket.on('game-starting', (data: { roomId: string; teamMode: string }) => {
      set({ gameStarting: true });
    });

    socket.on('new-message', (message: ChatMessage) => {
      set(state => ({
        messages: [...state.messages, message]
      }));
    });

    set({ socket });
  },

  disconnect: (options) => {
    const { socket, room } = get();
    if (socket) {
      // roomId를 먼저 캡처 (room이 null이 되기 전에)
      const roomId = room?.id;
      const roomStatus = room?.status;

      // Emit leave-room before disconnecting for cleaner state management
      // WAITING 상태일 때만 명시적으로 leave (다른 상태는 백엔드가 알아서 처리)
      if (roomId && !options?.skipLeave && roomStatus === 'WAITING') {
        socket.emit('leave-room', { roomId });
      }
      socket.removeAllListeners();
      socket.disconnect();
      set({
        socket: null,
        messages: [],
        room: null,
        gameStarting: false,
        error: null,
        isConnected: false,
      });
    }
  },

  setReady: (_isReady?: boolean, onError?: (msg: string) => void) => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('toggle-ready', { roomId: room.id }, (response: any) => {
        if (response && !response.success && onError) {
          onError(response.error || '레디 상태 변경에 실패했습니다.');
        }
      });
    }
  },

  startGame: (onError?: (msg: string) => void) => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('start-game', { roomId: room.id }, (response: any) => {
        if (response && !response.success && onError) {
          onError(response.error || '게임 시작에 실패했습니다.');
        }
      });
    }
  },

  sendMessage: (content: string) => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('send-message', { roomId: room.id, content });
    }
  },

  updateRoomSettings: async (roomId: string, settings: RoomSettingsDto) => {
    try {
      const updatedRoom = await roomApi.update(roomId, settings);
      set({ room: updatedRoom });
    } catch (error) {
      console.error('Failed to update room settings', error);
      throw error; // Re-throw to be caught in the component
    }
  },

  kickParticipant: async (roomId: string, participantId: string) => {
    try {
      await roomApi.kick(roomId, participantId);
      // State will be updated by 'participant-kicked' websocket event
    } catch (error) {
      console.error('Failed to kick participant', error);
      throw error;
    }
  },
}));
