import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import { roomApi } from '@/lib/api-client';
import { createAuthenticatedSocket } from '@/lib/socket-client';

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
  isCaptain?: boolean;
  teamId?: string | null;
  role?: "PLAYER" | "SPECTATOR";
  riotAccount?: RiotAccount | null;
  // Discord 음성채널 참가 여부 (Lobby 채널 기준)
  // undefined = 방에 Discord 채널이 없음 (검증 불필요)
  inVoice?: boolean;
}

interface Room {
  id: string;
  name: string;
  hostId: string;
  maxParticipants: number;
  isPrivate: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "DRAFT" | "DRAFT_COMPLETED" | "TEAM_SELECTION" | "ROLE_SELECTION";
  teamMode: "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
  participants: Participant[];
  teams?: { id: string; name: string; color?: string | null }[];
  // Extended settings
  allowSpectators?: boolean;
  startingPoints?: number;
  minBidIncrement?: number;
  bidTimeLimit?: number;
  pickTimeLimit?: number;
  captainSelection?: "RANDOM" | "TIER" | "MANUAL" | "VOLUNTEER";
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
  teamMode?: "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
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

// 게임 시작 실패 시 서버에서 내려오는 에러 응답 타입
export interface StartGameError {
  message: string;
  // 음성채널 미참가 유저 목록 (Discord 채널 있는 방에서만 존재)
  missingVoiceUsers?: string[];
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
  startGame: (onError?: (err: StartGameError) => void) => void;
  sendMessage: (content: string) => void;
  updateRoomSettings: (roomId: string, settings: RoomSettingsDto) => Promise<void>;
  kickParticipant: (roomId: string, participantId: string) => Promise<void>;
  toggleSpectator: (onError?: (msg: string) => void) => void;
  selectTeam: (
    teamId: string | null,
    onError?: (msg: string) => void,
    onSuccess?: () => void,
  ) => void;
}

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

    const socket = createAuthenticatedSocket("/room", "Lobby Room");

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
    socket.on('user-joined', (data: { userId: string; username: string; isReady?: boolean; participant?: Participant }) => {
      const currentRoom = get().room;
      if (currentRoom && !currentRoom.participants.some(p => p.userId === data.userId)) {
        const participant = data.participant ?? {
          id: data.userId,
          userId: data.userId,
          username: data.username,
          isHost: false,
          isReady: data.isReady ?? false,
        };
        set({
          room: {
            ...currentRoom,
            participants: [...currentRoom.participants, participant],
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
      // 모든 플레이어 준비 완료 이벤트 수신
    });

    socket.on('game-starting', (data: { roomId: string; teamMode: string }) => {
      set({ gameStarting: true });
    });

    // Discord 음성채널 상태 변경 수신
    // 서버에서 discordUserId → nexusUserId 변환 후 브로드캐스트
    // 관전자 ↔ 플레이어 역할 전환 수신
    socket.on('participant-role-changed', (data: { userId: string; newRole: "PLAYER" | "SPECTATOR" }) => {
      const currentRoom = get().room;
      if (currentRoom) {
        const updatedParticipants = currentRoom.participants.map(p =>
          p.userId === data.userId ? { ...p, role: data.newRole, isReady: false } : p
        );
        set({ room: { ...currentRoom, participants: updatedParticipants } });
      }
    });

    socket.on('participant-team-changed', (data: { userId: string; teamId: string | null }) => {
      const currentRoom = get().room;
      if (currentRoom) {
        const updatedParticipants = currentRoom.participants.map(p =>
          p.userId === data.userId ? { ...p, teamId: data.teamId, isReady: false } : p
        );
        set({ room: { ...currentRoom, participants: updatedParticipants } });
      }
    });

    socket.on('voice-status-changed', (data: { userId: string; inVoice: boolean }) => {
      const currentRoom = get().room;
      if (currentRoom) {
        const updatedParticipants = currentRoom.participants.map(p =>
          p.userId === data.userId ? { ...p, inVoice: data.inVoice } : p
        );
        set({ room: { ...currentRoom, participants: updatedParticipants } });
      }
    });

    socket.on('room-left', () => {
      socket.removeAllListeners();
      socket.disconnect();
      set({
        socket: null,
        room: null,
        messages: [],
        error: '로비에서 나갔습니다.',
        isConnected: false,
      });
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

      // Emit leave-room for explicit exits. Active games preserve the DB participant slot,
      // but still need immediate host transfer/socket cleanup instead of waiting for grace timeout.
      if (roomId && !options?.skipLeave) {
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

  startGame: (onError?: (err: StartGameError) => void) => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('start-game', { roomId: room.id }, (response: any) => {
        if (response && !response.success && onError) {
          onError({
            message: response.error || '게임 시작에 실패했습니다.',
            missingVoiceUsers: response.missingVoiceUsers,
          });
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

  toggleSpectator: (onError?: (msg: string) => void) => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('toggle-spectator', { roomId: room.id }, (response: any) => {
        if (response && response.error && onError) {
          onError(response.error);
        }
      });
    }
  },

  selectTeam: (teamId, onError, onSuccess) => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('select-team', { roomId: room.id, teamId }, (response: any) => {
        if (response && response.error && onError) {
          onError(response.error);
        } else if (response?.success) {
          onSuccess?.();
        }
      });
    }
  },
}));
