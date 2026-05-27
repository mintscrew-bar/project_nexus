import { create } from "zustand";
import {
  connectRoleSelectionSocket,
  disconnectRoleSelectionSocket,
  roleSelectionSocketHelpers,
} from "@/lib/socket-client";

// 로컬 카운트다운 인터벌 (서버 5초 tick 사이에 매초 감소)
let localCountdownInterval: ReturnType<typeof setInterval> | null = null;

const startLocalCountdown = (initialSeconds: number, setFn: (fn: (s: any) => any) => void) => {
  if (localCountdownInterval) {
    clearInterval(localCountdownInterval);
  }
  setFn((state: any) => ({ ...state, timeRemaining: initialSeconds }));
  localCountdownInterval = setInterval(() => {
    setFn((state: any) => {
      const next = Math.max(0, state.timeRemaining - 1);
      if (next <= 0 && localCountdownInterval) {
        clearInterval(localCountdownInterval);
        localCountdownInterval = null;
      }
      return { ...state, timeRemaining: next };
    });
  }, 1000);
};

const stopLocalCountdown = () => {
  if (localCountdownInterval) {
    clearInterval(localCountdownInterval);
    localCountdownInterval = null;
  }
};

const getSecondsUntil = (timerEndAt?: number | null, fallbackMs?: number) => {
  if (timerEndAt) {
    return Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
  }
  return fallbackMs ? Math.ceil(fallbackMs / 1000) : 15;
};

interface TeamMember {
  id: string;
  userId: string;
  assignedRole: string | null;
  user: {
    id: string;
    username: string;
    avatar?: string | null;
  };
}

interface Team {
  id: string;
  name: string;
  captainId: string;
  color?: string | null;
  members: TeamMember[];
}

interface RoleSelectionRoom {
  id: string;
  name: string;
  teams: Team[];
}

interface RoleSelectionState {
  room: RoleSelectionRoom | null;
  timeRemaining: number;
  isConnected: boolean;
  isLoading: boolean;
  isCompleted: boolean;
  navigationTarget: string | null;
  error: string | null;
  sessionAbortedAt: number | null;
  sessionAbortMessage: string | null;
  hasExtended: boolean;

  connect: (roomId: string) => void;
  disconnect: () => void;
  selectRole: (roomId: string, role: string) => Promise<void>;
  cancelRole: (roomId: string) => Promise<void>;
  extendTimer: (roomId: string) => Promise<void>;
  clearSessionAbort: () => void;
}

export const useRoleSelectionStore = create<RoleSelectionState>((set) => ({
  room: null,
  timeRemaining: 60,
  isConnected: false,
  isLoading: true,
  isCompleted: false,
  navigationTarget: null,
  error: null,
  sessionAbortedAt: null,
  sessionAbortMessage: null,
  hasExtended: false,

  connect: (roomId: string) => {
    set({
      isLoading: true,
      error: null,
      isCompleted: false,
      navigationTarget: null,
      sessionAbortedAt: null,
      sessionAbortMessage: null,
    });
    const socket = connectRoleSelectionSocket();
    // Clear existing listeners (game events + raw socket events) to prevent duplication
    roleSelectionSocketHelpers.offAllListeners();
    socket?.off('connect');
    socket?.off('disconnect');

    const doJoin = (isReconnect = false) => {
      roleSelectionSocketHelpers.joinRoom(roomId).then((response: any) => {
        if (response?.success) {
          const initialSeconds = getSecondsUntil(
            response.timerEndAt,
            response.timeRemaining,
          );
          set({
            room: response.room ?? null,
            timeRemaining: initialSeconds,
            isLoading: false,
            isConnected: true,
            error: null,
          });
          // 로컬 카운트다운 시작 (서버 5초 보정 tick 사이에 매초 감소)
          startLocalCountdown(initialSeconds, set);
        } else {
          const errorMsg = response?.error || "Failed to join role selection room.";
          const displayMsg =
            errorMsg === "join_timeout" || errorMsg === "connect_timeout"
              ? "서버 연결에 실패했습니다. 새로고침 해주세요."
              : errorMsg;
          if (isReconnect) {
            // 재연결 실패: 기존 UI 데이터는 유지하되 isConnected만 false로
            set({ isConnected: false, isLoading: false });
          } else {
            set({ error: displayMsg, isLoading: false, isConnected: false });
          }
        }
      }).catch(() => {
        if (isReconnect) {
          set({ isConnected: false, isLoading: false });
        } else {
          set({
            error: "서버 연결에 실패했습니다. 새로고침 해주세요.",
            isLoading: false,
            isConnected: false,
          });
        }
      });
    };

    doJoin(false);

    // Re-join the socket.io room after reconnect to resume receiving events
    socket?.on('connect', () => {
      set({ isConnected: true });
      doJoin(true);
    });
    socket?.on('disconnect', () => set({ isConnected: false }));

    roleSelectionSocketHelpers.onRoleSelected(
      (data: { userId: string; teamId: string; role: string; memberId: string }) => {
        set((state) => {
          if (!state.room) return state;
          const updatedTeams = state.room.teams.map((team) => {
            if (team.id !== data.teamId) return team;
            return {
              ...team,
              members: team.members.map((m) =>
                m.id === data.memberId ? { ...m, assignedRole: data.role } : m,
              ),
            };
          });
          return { room: { ...state.room, teams: updatedTeams } };
        });
      },
    );

    roleSelectionSocketHelpers.onTimerTick((data: { timeRemaining: number; timerEndAt?: number | null }) => {
      const syncedSeconds = getSecondsUntil(data.timerEndAt, data.timeRemaining);
      startLocalCountdown(syncedSeconds, set);
    });

    roleSelectionSocketHelpers.onTimerExtended((data: { timerEndAt: number; timeRemaining: number; extendedBy: string }) => {
      const syncedSeconds = getSecondsUntil(data.timerEndAt, data.timeRemaining);
      startLocalCountdown(syncedSeconds, set);
    });

    roleSelectionSocketHelpers.onRoleCancelled((data: { userId: string; teamId: string; memberId: string }) => {
      set((state) => {
        if (!state.room) return state;
        const updatedTeams = state.room.teams.map((team) => {
          if (team.id !== data.teamId) return team;
          return {
            ...team,
            members: team.members.map((m) =>
              m.id === data.memberId ? { ...m, assignedRole: null } : m,
            ),
          };
        });
        return { room: { ...state.room, teams: updatedTeams } };
      });
    });

    roleSelectionSocketHelpers.onRoleSelectionNavigation((data) => {
      set({ navigationTarget: data.target });
    });

    roleSelectionSocketHelpers.onRoleSelectionCompleted(() => {
      set({ isCompleted: true });
    });

    roleSelectionSocketHelpers.onRoleSelectionError((data: any) => {
      set({
        error: data.message || "An error occurred while completing role selection.",
      });
    });

    roleSelectionSocketHelpers.onSessionAborted((data: { message?: string }) => {
      set({
        sessionAbortedAt: Date.now(),
        sessionAbortMessage:
          data?.message ?? "Session aborted. Returning to lobby.",
      });
    });
  },

  disconnect: () => {
    stopLocalCountdown();
    roleSelectionSocketHelpers.offAllListeners();
    disconnectRoleSelectionSocket();
    set({
      isConnected: false,
      room: null,
      timeRemaining: 60,
      isLoading: false,
      isCompleted: false,
      navigationTarget: null,
      error: null,
      sessionAbortedAt: null,
      sessionAbortMessage: null,
      hasExtended: false,
    });
  },

  selectRole: async (roomId: string, role: string) => {
    const response = await roleSelectionSocketHelpers.selectRole(roomId, role);
    if (response?.error) {
      set({ error: response.error });
      throw new Error(response.error);
    }
  },

  cancelRole: async (roomId: string) => {
    const response = await roleSelectionSocketHelpers.cancelRole(roomId);
    if (response?.error) {
      throw new Error(response.error);
    }
  },

  extendTimer: async (roomId: string) => {
    const response = await roleSelectionSocketHelpers.extendTimer(roomId);
    if (response?.error) {
      throw new Error(response.error);
    }
    set({ hasExtended: true });
  },

  clearSessionAbort: () => {
    set({ sessionAbortedAt: null, sessionAbortMessage: null });
  },
}));
