import { create } from "zustand";
import {
  connectRoleSelectionSocket,
  disconnectRoleSelectionSocket,
  roleSelectionSocketHelpers,
} from "@/lib/socket-client";

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
  error: string | null;

  connect: (roomId: string) => void;
  disconnect: () => void;
  selectRole: (roomId: string, role: string) => Promise<void>;
}

export const useRoleSelectionStore = create<RoleSelectionState>((set, get) => ({
  room: null,
  timeRemaining: 120,
  isConnected: false,
  isLoading: true,
  isCompleted: false,
  error: null,

  connect: (roomId: string) => {
    set({ isLoading: true, error: null, isCompleted: false });
    connectRoleSelectionSocket();

    roleSelectionSocketHelpers.joinRoom(roomId).then((response: any) => {
      if (response?.success) {
        set({
          room: response.room ?? null,
          timeRemaining: response.timeRemaining
            ? Math.ceil(response.timeRemaining / 1000)
            : 120,
          isLoading: false,
          isConnected: true,
        });
      } else {
        set({
          error: response?.error || "역할 선택 방에 참여할 수 없습니다.",
          isLoading: false,
          isConnected: true,
        });
      }
    });

    roleSelectionSocketHelpers.onRoleSelected(
      (data: { userId: string; teamId: string; role: string; memberId: string }) => {
        set((state) => {
          if (!state.room) return state;
          const updatedTeams = state.room.teams.map((team) => {
            if (team.id !== data.teamId) return team;
            return {
              ...team,
              members: team.members.map((m) =>
                m.id === data.memberId
                  ? { ...m, assignedRole: data.role }
                  : m
              ),
            };
          });
          return { room: { ...state.room, teams: updatedTeams } };
        });
      }
    );

    roleSelectionSocketHelpers.onTimerTick(
      (data: { timeRemaining: number }) => {
        set({ timeRemaining: Math.ceil(data.timeRemaining / 1000) });
      }
    );

    roleSelectionSocketHelpers.onRoleSelectionCompleted(() => {
      set({ isCompleted: true });
    });

    roleSelectionSocketHelpers.onRoleSelectionError((data: any) => {
      set({ error: data.message || "역할 선택 중 오류가 발생했습니다." });
    });
  },

  disconnect: () => {
    roleSelectionSocketHelpers.offAllListeners();
    disconnectRoleSelectionSocket();
    set({
      isConnected: false,
      room: null,
      timeRemaining: 120,
      isLoading: false,
      isCompleted: false,
      error: null,
    });
  },

  selectRole: async (roomId: string, role: string) => {
    const response = await roleSelectionSocketHelpers.selectRole(roomId, role);
    if (response?.error) {
      set({ error: response.error });
      throw new Error(response.error);
    }
  },
}));
