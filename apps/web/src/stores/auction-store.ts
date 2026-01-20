import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth-store';

// Placeholder Types - these should eventually come from a shared @nexus/types package
interface Player {
  id: string;
  username: string;
  tier: string;
  mainRole: string;
}

interface Team {
  id: string;
  name: string;
  captainId: string;
  members: Player[];
  remainingBudget: number;
}

interface Bid {
  userId: string;
  username: string;
  amount: number;
  timestamp: string;
}

// This mirrors the backend AuctionState interface
interface LiveAuctionState {
  roomId: string;
  currentPlayerIndex: number;
  currentHighestBid: number;
  currentHighestBidder: string | null;
  timerEnd: number;
  yuchalCount: number;
  maxYuchalCycles: number;
}

interface AuctionStoreState {
  socket: Socket | null;
  liveState: LiveAuctionState | null;
  players: Player[];
  teams: Team[];
  bidHistory: Bid[];
  isConnected: boolean;
  error: string | null;
  currentUserIsCaptain: boolean;
  currentUserTeam: Team | null;

  connect: (auctionId: string) => void;
  disconnect: () => void;
  placeBid: (amount: number) => void;
}

export const useAuctionStore = create<AuctionStoreState>((set, get) => ({
  socket: null,
  liveState: null,
  players: [],
  teams: [],
  bidHistory: [],
  isConnected: false,
  error: null,
  currentUserIsCaptain: false,
  currentUserTeam: null,

  connect: (auctionId) => {
    // Prevent multiple connections
    if (get().socket) return;

    const authState = useAuthStore.getState();
    const token = authState.accessToken;
    const currentUserId = authState.user?.id;

    if (!token) {
      set({ error: "Authentication token not found." });
      return;
    }

    const socket = io(`${process.env.NEXT_PUBLIC_API_URL}/auction`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      set({ isConnected: true, error: null });
      socket.emit('join-room', { roomId: auctionId }, (response: any) => {
        if (response.success) {
          const teams: Team[] = response.teams;
          const currentUserTeam = teams.find(team => team.captainId === currentUserId) || null;
          const currentUserIsCaptain = !!currentUserTeam;

          set({
            liveState: response.state,
            players: response.players,
            teams: teams,
            currentUserIsCaptain,
            currentUserTeam,
          });
        } else {
          set({ error: response.error || 'Failed to join room.' });
        }
      });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false, currentUserIsCaptain: false, currentUserTeam: null });
    });

    socket.on('connect_error', (err) => {
      set({ error: err.message, isConnected: false });
    });
    
    // Listener for new bids
    socket.on('bid-placed', (bid: Bid) => {
      set((state) => ({
        bidHistory: [...state.bidHistory, bid],
        liveState: state.liveState ? { ...state.liveState, currentHighestBid: bid.amount, currentHighestBidder: bid.userId, timerEnd: state.liveState.timerEnd } : null
      }));
    });
    
    // Listener for bid resolution
    socket.on('bid-resolved', (result: any) => {
      // TODO: Update teams, players, and liveState based on the result
      console.log('Bid resolved:', result);
    });

    // Listener for timer updates
    socket.on('timer-expired', () => {
      console.log('Timer expired!');
      // Possibly trigger a resolve bid action
    });
    
    // Listener for full auction state updates
    socket.on('auction-state-update', (newState: any) => {
        set({
            liveState: newState.liveState,
            players: newState.players,
            teams: newState.teams
        });
    });


    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    set({ socket: null, isConnected: false, liveState: null, players: [], teams: [], bidHistory: [] });
  },
  
  placeBid: (amount: number) => {
    const { socket, liveState } = get();
    if (socket && liveState) {
      socket.emit('place-bid', {
        roomId: liveState.roomId,
        amount: amount,
      });
    }
  },
}));
