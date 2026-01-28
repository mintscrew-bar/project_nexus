import { create } from 'zustand';
import { matchApi } from '@/lib/api-client';
import { io, Socket } from 'socket.io-client';

interface Team {
  id: string;
  name: string;
  score?: number;
  members?: Array<{
    id: string;
    username: string;
  }>;
}

interface Match {
  id: string;
  roomId: string;
  round: number;
  matchNumber: number;
  bracketRound?: string;
  team1?: Team;
  team2?: Team;
  teamAId?: string;
  teamBId?: string;
  winnerId?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  tournamentCode?: string;
  scheduledTime?: string;
}

interface MatchStoreState {
  // State
  socket: Socket | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Match data
  currentMatch: Match | null;
  roomMatches: Match[];
  roomId: string | null;
  totalRounds: number;

  // REST API methods
  fetchMatch: (matchId: string) => Promise<void>;
  fetchRoomMatches: (roomId: string) => Promise<void>;
  generateBracket: (roomId: string) => Promise<void>;
  startMatch: (matchId: string) => Promise<void>;
  reportResult: (matchId: string, winnerId: string) => Promise<void>;
  generateTournamentCode: (matchId: string) => Promise<void>;

  // WebSocket methods
  connectToBracket: (roomId: string) => void;
  connectToMatch: (matchId: string) => void;
  disconnect: () => void;

  // Internal methods
  reset: () => void;
}

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const useMatchStore = create<MatchStoreState>((set, get) => ({
  // Initial state
  socket: null,
  isConnected: false,
  isLoading: false,
  error: null,
  currentMatch: null,
  roomMatches: [],
  roomId: null,
  totalRounds: 0,

  // ========================================
  // REST API Methods
  // ========================================

  fetchMatch: async (matchId: string) => {
    set({ isLoading: true, error: null });
    try {
      const match = await matchApi.getMatch(matchId);
      set({ currentMatch: match, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '매치 정보를 불러올 수 없습니다',
        isLoading: false
      });
    }
  },

  fetchRoomMatches: async (roomId: string) => {
    set({ isLoading: true, error: null, roomId });
    try {
      const matches = await matchApi.getBracket(roomId);
      const totalRounds = Math.max(...matches.map((m: Match) => m.round), 0);
      set({
        roomMatches: matches,
        totalRounds,
        isLoading: false
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '대진표를 불러올 수 없습니다',
        isLoading: false
      });
    }
  },

  generateBracket: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const bracket = await matchApi.generateBracket(roomId);
      const totalRounds = Math.max(...bracket.map((m: Match) => m.round), 0);
      set({
        roomMatches: bracket,
        roomId,
        totalRounds,
        isLoading: false
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '대진표 생성에 실패했습니다',
        isLoading: false
      });
    }
  },

  startMatch: async (matchId: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await matchApi.startMatch(matchId);
      set({
        currentMatch: result,
        isLoading: false
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '매치 시작에 실패했습니다',
        isLoading: false
      });
    }
  },

  reportResult: async (matchId: string, winnerId: string) => {
    try {
      await matchApi.reportResult(matchId, { winnerId });
      // Optimistically update the state, the websocket event will be the source of truth
      set(state => ({
        roomMatches: state.roomMatches.map(m =>
          m.id === matchId
            ? { ...m, status: 'COMPLETED', winnerId }
            : m
        ),
      }));
    } catch (error: any) {
      console.error('Failed to report result:', error);
      throw error;
    }
  },

  generateTournamentCode: async (matchId: string) => {
    // This action can be called from the modal, so we don't set global loading
    try {
      const result = await matchApi.generateTournamentCode?.(matchId);
      if (result) {
        // Update the specific match in the roomMatches array
        set(state => ({
          roomMatches: state.roomMatches.map(m =>
            m.id === matchId ? { ...m, tournamentCode: result.tournamentCode } : m
          ),
        }));
      }
    } catch (error: any) {
      // Errors can be handled locally in the component
      console.error('Failed to generate tournament code:', error);
      throw error;
    }
  },

  // ========================================
  // WebSocket Methods
  // ========================================

  connectToBracket: (roomId: string) => {
    const existingSocket = get().socket;
    if (existingSocket?.connected) {
      existingSocket.emit('leave-bracket', { roomId: get().roomId });
      existingSocket.disconnect();
    }

    const socket = io(`${SOCKET_URL}/match`, {
      auth: {
        token: localStorage.getItem('accessToken'),
      },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Connected to match socket');
      set({ isConnected: true, error: null, roomId });

      // Join bracket room
      socket.emit('join-bracket', { roomId }, (response: any) => {
        if (response?.success && response?.matches) {
          const totalRounds = Math.max(...response.matches.map((m: Match) => m.round), 0);
          set({
            roomMatches: response.matches,
            totalRounds
          });
        }
      });
    });

    socket.on('connect_error', (error) => {
      console.error('Match socket connection error:', error);
      set({
        isConnected: false,
        error: '대진표 서버에 연결할 수 없습니다'
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from match socket');
      set({ isConnected: false });
    });

    // Listen to bracket events
    socket.on('bracket-generated', (data: { bracket: Match[] }) => {
      const totalRounds = Math.max(...data.bracket.map(m => m.round), 0);
      set({
        roomMatches: data.bracket,
        totalRounds
      });
    });

    socket.on('bracket-updated', (data: { matches: Match[] }) => {
      set({ roomMatches: data.matches });
    });
    
    // Listen for tournament code generated for a specific match in the bracket
    socket.on('tournament-code-generated', (data: { matchId: string; code: string }) => {
      set(state => ({
        roomMatches: state.roomMatches.map(m =>
          m.id === data.matchId ? { ...m, tournamentCode: data.code } : m
        ),
      }));
    });

    socket.on('match-result', (data: { matchId: string; winnerId: string }) => {
        set(state => ({
            roomMatches: state.roomMatches.map(m =>
                m.id === data.matchId ? { ...m, status: 'COMPLETED', winnerId: data.winnerId } : m
            ),
        }));
    });

    socket.on('bracket-complete', () => {
      console.log('Tournament complete!');
    });

    set({ socket });
  },

  connectToMatch: (matchId: string) => {
    const existingSocket = get().socket;
    if (existingSocket?.connected) {
      existingSocket.emit('leave-match', { matchId: get().currentMatch?.id });
      existingSocket.disconnect();
    }

    const socket = io(`${SOCKET_URL}/match`, {
      auth: {
        token: localStorage.getItem('accessToken'),
      },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Connected to match socket');
      set({ isConnected: true, error: null });

      // Join match room
      socket.emit('join-match', { matchId }, (response: any) => {
        if (response?.success && response?.match) {
          set({ currentMatch: response.match });
        }
      });
    });

    socket.on('connect_error', (error) => {
      console.error('Match socket connection error:', error);
      set({
        isConnected: false,
        error: '매치 서버에 연결할 수 없습니다'
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from match socket');
      set({ isConnected: false });
    });

    // Listen to match events
    socket.on('match-started', (data: { tournamentCode?: string }) => {
      const current = get().currentMatch;
      if (current) {
        set({
          currentMatch: {
            ...current,
            status: 'IN_PROGRESS',
            tournamentCode: data.tournamentCode
          }
        });
      }
    });

    socket.on('match-result', (data: { winnerId: string }) => {
      const current = get().currentMatch;
      if (current) {
        set({
          currentMatch: {
            ...current,
            status: 'COMPLETED',
            winnerId: data.winnerId
          }
        });
      }
    });

    socket.on('tournament-code-generated', (data: { code: string }) => {
      const current = get().currentMatch;
      if (current) {
        set({
          currentMatch: {
            ...current,
            tournamentCode: data.code
          }
        });
      }
    });

    set({ socket });
  },

  disconnect: () => {
    const socket = get().socket;
    const roomId = get().roomId;
    const matchId = get().currentMatch?.id;

    if (socket?.connected) {
      if (roomId) {
        socket.emit('leave-bracket', { roomId });
      }
      if (matchId) {
        socket.emit('leave-match', { matchId });
      }
      socket.disconnect();
    }

    set({
      socket: null,
      isConnected: false
    });
  },

  // ========================================
  // Internal Methods
  // ========================================

  reset: () => {
    get().disconnect();
    set({
      currentMatch: null,
      roomMatches: [],
      roomId: null,
      totalRounds: 0,
      error: null,
      isLoading: false,
    });
  },
}));
