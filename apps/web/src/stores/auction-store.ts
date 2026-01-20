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
  remainingBudget: number;
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

interface BidHistoryEntry {
  username: string;
  amount: number;
  timestamp: number;
}

interface AuctionStoreState {
  auctionState: AuctionState | null;
  players: Player[];
  teams: Team[];
  bidHistory: BidHistoryEntry[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  currentUserId: string | null;
  currentUserIsCaptain: boolean;
  currentUserTeam: Team | null;

  // REST API methods
  startAuction: (roomId: string) => Promise<void>;
  getAuctionState: (roomId: string) => Promise<void>;

  // WebSocket methods
  connectToAuction: (roomId: string) => void;
  disconnectFromAuction: () => void;
  placeBid: (amount: number) => void;
  setCurrentUserId: (userId: string) => void;
}

export const useAuctionStore = create<AuctionStoreState>((set, get) => ({
  auctionState: null,
  players: [],
  teams: [],
  bidHistory: [],
  isConnected: false,
  isLoading: false,
  error: null,
  currentUserId: null,
  currentUserIsCaptain: false,
  currentUserTeam: null,

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
        bidHistory: [...state.bidHistory, { username: data.bidder, amount: data.amount, timestamp: Date.now() }],
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
      bidHistory: [],
    });
  },

  placeBid: (amount: number) => {
    const { auctionState } = get();
    if (auctionState?.roomId) {
      auctionSocketHelpers.placeBid(auctionState.roomId, amount);
    }
  },

  setCurrentUserId: (userId: string) => {
    const { teams } = get();
    const userTeam = teams.find(team => team.captainId === userId);
    set({
      currentUserId: userId,
      currentUserIsCaptain: !!userTeam,
      currentUserTeam: userTeam || null,
    });
  },
}));
