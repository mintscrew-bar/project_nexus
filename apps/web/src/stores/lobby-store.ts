import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth-store';

// Placeholder Types - should eventually come from @nexus/types
interface Participant {
  id: string;
  username: string;
  isHost: boolean;
  isReady: boolean;
}

interface Room {
  id: string;
  title: string;
  hostId: string;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED";
  teamMode: "AUCTION" | "LADDER";
  participants: Participant[];
}

interface LobbyStoreState {
  socket: Socket | null;
  room: Room | null;
  isConnected: boolean;
  error: string | null;
  gameStarting: boolean;

  connect: (roomId: string) => void;
  disconnect: () => void;
  setReady: (isReady: boolean) => void;
  startGame: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const useLobbyStore = create<LobbyStoreState>((set, get) => ({
  socket: null,
  room: null,
  isConnected: false,
  error: null,
  gameStarting: false,

  connect: (roomId) => {
    if (get().socket) return;

    const token = useAuthStore.getState().accessToken;
    if (!token) {
      set({ error: "Authentication token not found." });
      return;
    }

    const socket = io(`${API_URL}/lobby`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      set({ isConnected: true, error: null });
      socket.emit('join-lobby', { roomId }, (response: any) => {
        if (response.success) {
          set({ room: response.room });
        } else {
          set({ error: response.error || 'Failed to join lobby.' });
        }
      });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false, room: null, gameStarting: false });
    });

    socket.on('connect_error', (err) => {
      set({ error: err.message, isConnected: false });
    });
    
    socket.on('room-update', (updatedRoom: Room) => {
      set({ room: updatedRoom });
    });
    
    socket.on('game-starting', () => {
      set({ gameStarting: true });
    });

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
  },

  setReady: (isReady: boolean) => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('set-ready-status', { roomId: room.id, isReady });
    }
  },

  startGame: () => {
    const { socket, room } = get();
    if (socket && room) {
      socket.emit('start-game', { roomId: room.id });
    }
  },
}));
