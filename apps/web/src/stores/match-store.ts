import { create } from 'zustand';
import { matchApi } from '@/lib/api-client';
import {
  connectMatchSocket,
  disconnectMatchSocket,
  matchSocketHelpers,
} from '@/lib/socket-client';

interface Team {
  id: string;
  name: string;
  score?: number;
  members?: Array<{
    id: string;
    username: string;
  }>;
}

export interface Match {
  id: string;
  roomId: string;
  round: number;
  matchNumber: number;
  bracketRound?: string;
  teamA?: Team;
  teamB?: Team;
  teamAId?: string;
  teamBId?: string;
  winnerId?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  tournamentCode?: string;
  scheduledTime?: string;
}

interface TeamStanding {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
}

interface MatchStoreState {
  // State
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  sessionAbortedAt: number | null;
  sessionAbortMessage: string | null;

  // Match data
  currentMatch: Match | null;
  roomMatches: Match[];
  roomId: string | null;
  totalRounds: number;

  // Tournament completion
  tournamentCompleted: boolean;
  finalStandings: TeamStanding[];

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
  clearSessionAbort: () => void;
}

export const useMatchStore = create<MatchStoreState>((set, get) => ({
  // Initial state
  isConnected: false,
  isLoading: false,
  error: null,
  sessionAbortedAt: null,
  sessionAbortMessage: null,
  currentMatch: null,
  roomMatches: [],
  roomId: null,
  totalRounds: 0,
  tournamentCompleted: false,
  finalStandings: [],

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
            ? { ...m, status: 'COMPLETED' as const, winnerId }
            : m
        ),
      }));
    } catch (error: any) {
      console.error('Failed to report result:', error);
      throw error;
    }
  },

  generateTournamentCode: async (matchId: string) => {
    try {
      const result = await matchApi.generateTournamentCode?.(matchId);
      if (result) {
        set(state => ({
          roomMatches: state.roomMatches.map(m =>
            m.id === matchId ? { ...m, tournamentCode: result.tournamentCode } : m
          ),
        }));
      }
    } catch (error: any) {
      console.error('Failed to generate tournament code:', error);
      throw error;
    }
  },

  // ========================================
  // WebSocket Methods
  // ========================================

  connectToBracket: (roomId: string) => {
    // Clean up existing connection
    get().disconnect();

    const socket = connectMatchSocket();
    if (!socket) return;

    // Clear existing listeners to prevent duplication
    matchSocketHelpers.offAllListeners();
    socket.off('connect');
    socket.off('disconnect');
    socket.off('connect_error');

    const joinBracket = () => {
      matchSocketHelpers.joinBracket(roomId).then((response: any) => {
        if (response?.success && response?.matches) {
          const totalRounds = Math.max(...response.matches.map((m: Match) => m.round), 0);
          set({ roomMatches: response.matches, totalRounds });
        } else if (response && !response.success) {
          set({ error: response.error || '대진표 참가에 실패했습니다' });
        }
      });
    };

    socket.on('connect', () => {
      console.log('Connected to match socket');
      set({ isConnected: true, error: null, roomId });
      joinBracket();
    });

    socket.on('connect_error', (error: any) => {
      console.error('Match socket connection error:', error);
      set({ isConnected: false, error: '대진표 서버에 연결할 수 없습니다' });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from match socket');
      set({ isConnected: false });
    });

    // Listen to bracket events
    matchSocketHelpers.onBracketGenerated((data: { bracket: Match[] }) => {
      const totalRounds = Math.max(...data.bracket.map(m => m.round), 0);
      set({ roomMatches: data.bracket, totalRounds });
    });

    matchSocketHelpers.onBracketUpdated((data: { matches: Match[] }) => {
      set({ roomMatches: data.matches });
    });

    matchSocketHelpers.onTournamentCodeGenerated((data: { matchId: string; code: string }) => {
      set(state => ({
        roomMatches: state.roomMatches.map(m =>
          m.id === data.matchId ? { ...m, tournamentCode: data.code } : m
        ),
      }));
    });

    matchSocketHelpers.onMatchResult((data: { matchId: string; winnerId: string }) => {
      set(state => ({
        roomMatches: state.roomMatches.map(m =>
          m.id === data.matchId ? { ...m, status: 'COMPLETED' as const, winnerId: data.winnerId } : m
        ),
      }));
    });

    matchSocketHelpers.onBracketComplete(() => {
      console.log('Tournament complete!');
    });

    matchSocketHelpers.onTournamentCompleted((data: { standings: TeamStanding[]; completedAt: string }) => {
      set({ tournamentCompleted: true, finalStandings: data.standings });
    });

    matchSocketHelpers.onSessionAborted((data: { message?: string }) => {
      set({
        sessionAbortedAt: Date.now(),
        sessionAbortMessage: data?.message ?? 'Session aborted. Returning to lobby.',
      });
    });

    // If already connected, join immediately
    if (socket.connected) {
      set({ isConnected: true, roomId });
      joinBracket();
    }

    set({ sessionAbortedAt: null, sessionAbortMessage: null });
  },

  connectToMatch: (matchId: string) => {
    // Clean up existing connection
    get().disconnect();

    const socket = connectMatchSocket();
    if (!socket) return;

    matchSocketHelpers.offAllListeners();
    socket.off('connect');
    socket.off('disconnect');
    socket.off('connect_error');

    const joinMatch = () => {
      const ackTimeout = setTimeout(() => {
        console.warn('[Match] join-match ACK timeout');
      }, 15000);

      socket.emit('join-match', { matchId }, (response: any) => {
        clearTimeout(ackTimeout);
        if (response?.success && response?.match) {
          set({ currentMatch: response.match });
        } else if (response && !response.success) {
          set({ error: response.error || '매치 참가에 실패했습니다' });
        }
      });
    };

    socket.on('connect', () => {
      console.log('Connected to match socket');
      set({ isConnected: true, error: null });
      joinMatch();
    });

    socket.on('connect_error', (error: any) => {
      console.error('Match socket connection error:', error);
      set({ isConnected: false, error: '매치 서버에 연결할 수 없습니다' });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from match socket');
      set({ isConnected: false });
    });

    matchSocketHelpers.onMatchStarted((data: { tournamentCode?: string }) => {
      const current = get().currentMatch;
      if (current) {
        set({
          currentMatch: { ...current, status: 'IN_PROGRESS', tournamentCode: data.tournamentCode }
        });
      }
    });

    matchSocketHelpers.onMatchResult((data: { winnerId: string }) => {
      const current = get().currentMatch;
      if (current) {
        set({
          currentMatch: { ...current, status: 'COMPLETED', winnerId: data.winnerId }
        });
      }
    });

    matchSocketHelpers.onTournamentCodeGenerated((data: { code: string }) => {
      const current = get().currentMatch;
      if (current) {
        set({
          currentMatch: { ...current, tournamentCode: data.code }
        });
      }
    });

    matchSocketHelpers.onSessionAborted((data: { message?: string }) => {
      set({
        sessionAbortedAt: Date.now(),
        sessionAbortMessage: data?.message ?? 'Session aborted. Returning to lobby.',
      });
    });

    // If already connected, join immediately
    if (socket.connected) {
      set({ isConnected: true });
      joinMatch();
    }

    set({ sessionAbortedAt: null, sessionAbortMessage: null });
  },

  disconnect: () => {
    const roomId = get().roomId;
    const matchId = get().currentMatch?.id;

    if (roomId) {
      matchSocketHelpers.leaveBracket(roomId);
    }
    if (matchId) {
      matchSocketHelpers.leaveMatch(matchId);
    }

    matchSocketHelpers.offAllListeners();
    disconnectMatchSocket();

    set({
      isConnected: false,
      error: null,
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
      sessionAbortedAt: null,
      sessionAbortMessage: null,
      tournamentCompleted: false,
      finalStandings: [],
    });
  },

  clearSessionAbort: () => {
    set({ sessionAbortedAt: null, sessionAbortMessage: null });
  },
}));
