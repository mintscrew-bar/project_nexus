import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { roomApi } from '@/lib/api-client'; // Import roomApi

// Placeholder Types - should eventually come from @nexus/types
interface Participant {
  id: string;
  userId: string; // Add userId to Participant type
  username: string;
  isHost: boolean;
  isReady: boolean;
}

interface Room {
  id: string;
  name: string;
  hostId: string;
  maxParticipants: number;
  isPrivate: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED" | "DRAFT" | "DRAFT_COMPLETED" | "TEAM_SELECTION";
  teamMode: "AUCTION" | "SNAKE_DRAFT";
  participants: Participant[];
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
}

interface LobbyStoreState {
  socket: Socket | null;
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  gameStarting: boolean;
  messages: ChatMessage[];

  connect: (roomId: string) => void;
  disconnect: () => void;
  setReady: (isReady: boolean) => void;
  startGame: () => void;
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

  connect: (roomId) => {
    if (get().socket) return;

    const socket = io(`${API_URL}/room`, {
      withCredentials: true,
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      set({ isConnected: true, error: null });
      socket.emit('join-room', { roomId }, (response: any) => {
        if (response.success) {
          set({ room: response.room });
        } else {
          set({ error: response.error || 'Failed to join room.' });
        }
      });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false, room: null, gameStarting: false });
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
      console.log('User joined:', data);
    });

    socket.on('user-left', (data: { userId: string; username: string }) => {
      console.log('User left:', data);
    });

    socket.on('ready-status-changed', (data: { userId: string; isReady: boolean }) => {
      const currentRoom = get().room;
      if (currentRoom) {
        const updatedParticipants = currentRoom.participants.map(p =>
          p.id === data.userId ? { ...p, isReady: data.isReady } : p
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

  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({ socket: null, messages: [], room: null, gameStarting: false });
    }
  },

  setReady: (isReady: boolean) => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('toggle-ready', { roomId: room.id });
    }
  },

  startGame: () => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('start-game', { roomId: room.id });
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
