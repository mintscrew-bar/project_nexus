import { create } from 'zustand';
import { snakeDraftApi, roomApi } from '@/lib/api-client';
import {
  connectSnakeDraftSocket,
  disconnectSnakeDraftSocket,
  snakeDraftSocketHelpers,
} from '@/lib/socket-client';

interface Player {
  id: string;
  username: string;
  tier: string;
  rank?: string;
  mmr?: number;
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
  sessionAbortedAt: number | null;
  sessionAbortMessage: string | null;

  // REST API methods
  startDraft: (roomId: string, captainSelection: 'RANDOM' | 'TIER') => Promise<void>;
  makePick: (roomId: string, playerId: string) => Promise<void>;
  getDraftState: (roomId: string) => Promise<void>;

  // WebSocket methods
  connectToDraft: (roomId: string) => Promise<void>;
  disconnectFromDraft: () => void;
  clearSessionAbort: () => void;
}

export const useSnakeDraftStore = create<SnakeDraftStoreState>((set, get) => ({
  draftState: null,
  isConnected: false,
  isLoading: false,
  error: null,
  sessionAbortedAt: null,
  sessionAbortMessage: null,

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
      const response = await snakeDraftSocketHelpers.makePick(roomId, playerId);
      if (response?.error) {
        const msg = response.error === 'pick_timeout'
          ? '픽 요청 시간이 초과되었습니다.'
          : response.error;
        set({ error: msg, isLoading: false });
        setTimeout(() => {
          if (get().error === msg) set({ error: null });
        }, 3000);
        return;
      }
      set({ isLoading: false });
    } catch (err: any) {
      set({
        error: err.message || "Failed to make pick.",
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

  connectToDraft: async (roomId: string) => {
    const socket = connectSnakeDraftSocket();
    // Clear existing listeners (game events + raw socket events) to prevent duplication
    snakeDraftSocketHelpers.offAllListeners();
    socket?.off('connect');
    socket?.off('disconnect');
    set({
      isLoading: true,
      error: null,
      sessionAbortedAt: null,
      sessionAbortMessage: null,
    });

    let isRefetchingDraftState = false;
    const refetchDraftState = async () => {
      if (isRefetchingDraftState) return;
      isRefetchingDraftState = true;
      try {
        const fallback = await snakeDraftApi.getDraftState(roomId);
        if (fallback?.state) {
          set({ draftState: fallback.state, error: null });
        }
      } catch (err: any) {
        set({ error: err.response?.data?.message || err.message || "Failed to sync draft state." });
      } finally {
        isRefetchingDraftState = false;
      }
    };

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
        if (!state.draftState) {
          void refetchDraftState();
          return state;
        }

        const targetTeam = state.draftState.teams.find((team) => team.id === data.teamId);
        if (!targetTeam || !data.player?.id) {
          void refetchDraftState();
          return state;
        }

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

    snakeDraftSocketHelpers.onDraftComplete((data?: { teams: Team[] }) => {
      set((state) => ({
        draftState: state.draftState
          ? {
              ...state.draftState,
              ...(data?.teams ? { teams: data.teams } : {}),
              status: 'COMPLETED' as const,
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

    snakeDraftSocketHelpers.onNextPick((data: { currentTeamId: string; timerEnd: number }) => {
      set((state) => {
        if (!state.draftState) return state;
        return {
          draftState: {
            ...state.draftState,
            currentTeamId: data.currentTeamId,
            timerEnd: data.timerEnd,
          },
        };
      });
    });

    snakeDraftSocketHelpers.onAutoPickMade(() => {
      // Auto-pick notification — state already updated via pick-made event
    });

    snakeDraftSocketHelpers.onTimerExpired(() => {
      // Timer expired — auto-pick will follow via pick-made event
    });

    snakeDraftSocketHelpers.onSessionAborted((data: { message?: string }) => {
      set({
        sessionAbortedAt: Date.now(),
        sessionAbortMessage:
          data?.message ?? "Session aborted. Returning to lobby.",
      });
    });

    // 재연결 핸들러를 초기 join 전에 등록 (join 성공/실패 모두에서 reconnect 가능)
    socket?.on('connect', async () => {
      set({ isConnected: true });
      const response = await snakeDraftSocketHelpers.joinDraft(roomId);
      if (response?.success && response.state) {
        set({ draftState: response.state, isLoading: false, error: null });
      } else if (response?.success) {
        set({ isConnected: true, isLoading: false, error: null });
      } else {
        set({
          draftState: null,
          isConnected: false,
          error: response?.error || 'Failed to rejoin draft after reconnect.',
        });
      }
    });
    socket?.on('disconnect', () => set({ isConnected: false }));

    let joinResponse = await snakeDraftSocketHelpers.joinDraft(roomId);

    // On timeout, retry once if we have no existing state
    if (
      !joinResponse?.success &&
      (joinResponse?.error === 'join_timeout' || joinResponse?.error === 'connect_timeout')
    ) {
      if (get().draftState && socket?.connected) {
        set({ isConnected: true, isLoading: false, error: null });
        return;
      }
      joinResponse = await snakeDraftSocketHelpers.joinDraft(roomId);
    }

    if (joinResponse?.state) {
      set({ draftState: joinResponse.state });
    } else if (joinResponse?.success && !joinResponse?.state) {
      try {
        const fallback = await snakeDraftApi.getDraftState(roomId);
        if (fallback?.state) {
          set({ draftState: fallback.state });
        }
      } catch {
        // 폴백 실패는 무시
      }
    }

    if (!joinResponse?.success && joinResponse?.error) {
      set({
        isConnected: false,
        isLoading: false,
        error: joinResponse.error === 'join_timeout' || joinResponse.error === 'connect_timeout'
          ? '서버 연결에 실패했습니다. 새로고침 해주세요.'
          : joinResponse.error,
      });
      return;
    }

    set({ isConnected: true, isLoading: false });
  },

  disconnectFromDraft: () => {
    snakeDraftSocketHelpers.offAllListeners();
    disconnectSnakeDraftSocket();
    set({
      isConnected: false,
      isLoading: false,
      draftState: null,
      error: null,
      sessionAbortedAt: null,
      sessionAbortMessage: null,
    });
  },

  clearSessionAbort: () => {
    set({ sessionAbortedAt: null, sessionAbortMessage: null });
  },
}));
