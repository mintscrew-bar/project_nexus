import { create } from 'zustand';
import { auctionApi } from '@/lib/api-client';
import {
  connectAuctionSocket,
  disconnectAuctionSocket,
  auctionSocketHelpers,
} from '@/lib/socket-client';

interface Player {
  id: string;
  username: string;
  tier: string;
  position: string;
}

interface Team {
  id: string;
  name: string;
  captainId: string;
  members: Player[];
  remainingGold: number;
}

interface AuctionState {
  roomId: string;
  currentPlayerIndex: number;
  currentPlayer: Player | null;
  currentHighestBid: number;
  currentHighestBidder: string | null;
  timerEnd: number;
  yuchalCount: number;
  maxYuchalCycles: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface AuctionStoreState {
  auctionState: AuctionState | null;
  players: Player[];
  teams: Team[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // REST API methods
  startAuction: (roomId: string) => Promise<void>;
  getAuctionState: (roomId: string) => Promise<void>;

  // WebSocket methods
  connectToAuction: (roomId: string) => void;
  disconnectFromAuction: () => void;
  placeBid: (roomId: string, amount: number) => void;
}

export const useAuctionStore = create<AuctionStoreState>((set, get) => ({
  auctionState: null,
  players: [],
  teams: [],
  isConnected: false,
  isLoading: false,
  error: null,

  startAuction: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      await auctionApi.startAuction(roomId);
      set({ isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to start auction.",
        isLoading: false,
      });
    }
  },

  getAuctionState: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await auctionApi.getAuctionState(roomId);
      if (response.state) {
        set({ auctionState: response.state, isLoading: false });
      } else {
        set({ error: response.error || "Auction not started", isLoading: false });
      }
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to get auction state.",
        isLoading: false,
      });
    }
  },

  connectToAuction: (roomId: string) => {
    const socket = connectAuctionSocket();

    auctionSocketHelpers.joinAuction(roomId);

    auctionSocketHelpers.onAuctionStarted((data: { state: AuctionState; teams: Team[]; players: Player[] }) => {
      set({
        auctionState: data.state,
        teams: data.teams,
        players: data.players,
      });
    });

    auctionSocketHelpers.onNewBid((data: { bidder: string; amount: number; timerEnd: number }) => {
      set((state) => ({
        auctionState: state.auctionState
          ? {
              ...state.auctionState,
              currentHighestBid: data.amount,
              currentHighestBidder: data.bidder,
              timerEnd: data.timerEnd,
            }
          : null,
      }));
    });

    auctionSocketHelpers.onPlayerSold((data: { player: Player; team: string; amount: number; teams: Team[] }) => {
      set((state) => ({
        teams: data.teams,
        players: state.players.filter((p) => p.id !== data.player.id),
      }));
    });

    auctionSocketHelpers.onPlayerUnsold((data: { player: Player; yuchalCount: number }) => {
      set((state) => ({
        auctionState: state.auctionState
          ? { ...state.auctionState, yuchalCount: data.yuchalCount }
          : null,
      }));
    });

    auctionSocketHelpers.onAuctionComplete((data: { teams: Team[] }) => {
      set({
        teams: data.teams,
        auctionState: {
          ...get().auctionState!,
          status: 'COMPLETED',
        },
      });
    });

    auctionSocketHelpers.onTimerUpdate((data: { timeLeft: number }) => {
      set((state) => ({
        auctionState: state.auctionState
          ? { ...state.auctionState, timerEnd: Date.now() + data.timeLeft * 1000 }
          : null,
      }));
    });

    set({ isConnected: true });
  },

  disconnectFromAuction: () => {
    auctionSocketHelpers.offAllListeners();
    disconnectAuctionSocket();
    set({
      isConnected: false,
      auctionState: null,
      players: [],
      teams: [],
    });
  },

  placeBid: (roomId: string, amount: number) => {
    auctionSocketHelpers.placeBid(roomId, amount);
  },
}));
