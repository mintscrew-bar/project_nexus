import { create } from 'zustand';
import { snakeDraftApi } from '@/lib/api-client';
import {
  connectSnakeDraftSocket,
  disconnectSnakeDraftSocket,
  snakeDraftSocketHelpers,
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
}

interface DraftState {
  roomId: string;
  teams: Team[];
  availablePlayers: Player[];
  pickOrder: string[];
  currentPickIndex: number;
  currentTeamId: string | null;
  timerEnd: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface SnakeDraftStoreState {
  draftState: DraftState | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // REST API methods
  startDraft: (roomId: string, captainSelection: 'RANDOM' | 'TIER') => Promise<void>;
  makePick: (roomId: string, playerId: string) => Promise<void>;
  getDraftState: (roomId: string) => Promise<void>;

  // WebSocket methods
  connectToDraft: (roomId: string) => void;
  disconnectFromDraft: () => void;
}

export const useSnakeDraftStore = create<SnakeDraftStoreState>((set, get) => ({
  draftState: null,
  isConnected: false,
  isLoading: false,
  error: null,

  startDraft: async (roomId: string, captainSelection: 'RANDOM' | 'TIER') => {
    set({ isLoading: true, error: null });
    try {
      await snakeDraftApi.startDraft(roomId, captainSelection);
      set({ isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to start draft.",
        isLoading: false,
      });
    }
  },

  makePick: async (roomId: string, playerId: string) => {
    set({ isLoading: true, error: null });
    try {
      await snakeDraftApi.makePick(roomId, playerId);
      set({ isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to make pick.",
        isLoading: false,
      });
    }
  },

  getDraftState: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const state = await snakeDraftApi.getDraftState(roomId);
      set({ draftState: state, isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to get draft state.",
        isLoading: false,
      });
    }
  },

  connectToDraft: (roomId: string) => {
    const socket = connectSnakeDraftSocket();

    snakeDraftSocketHelpers.joinDraft(roomId);

    snakeDraftSocketHelpers.onDraftStarted((data: DraftState) => {
      set({ draftState: data });
    });

    snakeDraftSocketHelpers.onPickMade((data: {
      teamId: string;
      player: Player;
      nextTeamId: string;
      timerEnd: number;
    }) => {
      set((state) => {
        if (!state.draftState) return state;

        const updatedTeams = state.draftState.teams.map((team) =>
          team.id === data.teamId
            ? { ...team, members: [...team.members, data.player] }
            : team
        );

        const updatedPlayers = state.draftState.availablePlayers.filter(
          (p) => p.id !== data.player.id
        );

        return {
          draftState: {
            ...state.draftState,
            teams: updatedTeams,
            availablePlayers: updatedPlayers,
            currentTeamId: data.nextTeamId,
            currentPickIndex: state.draftState.currentPickIndex + 1,
            timerEnd: data.timerEnd,
          },
        };
      });
    });

    snakeDraftSocketHelpers.onDraftComplete((data: { teams: Team[] }) => {
      set((state) => ({
        draftState: state.draftState
          ? {
              ...state.draftState,
              teams: data.teams,
              status: 'COMPLETED',
            }
          : null,
      }));
    });

    snakeDraftSocketHelpers.onTimerUpdate((data: { timeLeft: number }) => {
      set((state) => ({
        draftState: state.draftState
          ? { ...state.draftState, timerEnd: Date.now() + data.timeLeft * 1000 }
          : null,
      }));
    });

    snakeDraftSocketHelpers.onDraftState((data: DraftState) => {
      set({ draftState: data });
    });

    set({ isConnected: true });
  },

  disconnectFromDraft: () => {
    snakeDraftSocketHelpers.offAllListeners();
    disconnectSnakeDraftSocket();
    set({
      isConnected: false,
      draftState: null,
    });
  },
}));
