import { create } from 'zustand';
import axios from 'axios';
import { useAuthStore } from './auth-store'; // To get the auth token

interface Room {
  id: string;
  title: string;
  hostId: string;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED";
  teamMode: "AUCTION" | "LADDER"; // Renamed from teamSelectionMethod to match backend
  createdAt: string;
}

interface RoomCreationData {
  title: string;
  maxPlayers: number;
  teamMode: "AUCTION" | "LADDER";
  isPrivate: boolean;
  password?: string;
}

interface RoomStoreState {
  rooms: Room[];
  isLoading: boolean;
  error: string | null;

  fetchRooms: () => Promise<void>;
  createRoom: (data: RoomCreationData) => Promise<Room | null>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  rooms: [],
  isLoading: false,
  error: null,

  fetchRooms: async () => {
    set({ isLoading: true, error: null });
    try {
      const token = useAuthStore.getState().accessToken;
      if (!token) {
        throw new Error("Authentication token not found.");
      }
      const response = await axios.get(`${API_URL}/rooms`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      set({ rooms: response.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message || "Failed to fetch rooms.", isLoading: false });
    }
  },

  createRoom: async (data: RoomCreationData) => {
    set({ isLoading: true, error: null });
    try {
      const token = useAuthStore.getState().accessToken;
      if (!token) {
        throw new Error("Authentication token not found.");
      }
      const response = await axios.post(`${API_URL}/rooms`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      // Optionally, add the new room to the list immediately or refetch
      get().fetchRooms(); // Refetch all rooms to include the new one
      set({ isLoading: false });
      return response.data;
    } catch (err: any) {
      set({ error: err.response?.data?.message || err.message || "Failed to create room.", isLoading: false });
      return null;
    }
  },
}));
