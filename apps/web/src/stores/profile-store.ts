import { create } from 'zustand';
import { userApi, matchApi } from '@/lib/api-client';

export interface ProfileStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  participations: number;
}

export interface RecentMatch {
  id: string;
  status: string;
  createdAt: string;
  teamA: { name: string };
  teamB: { name: string };
  winner?: { id: string; name: string };
}

interface ProfileStoreState {
  stats: ProfileStats | null;
  statsLoaded: boolean;
  statsLoading: boolean;

  recentMatches: RecentMatch[];
  matchesLoaded: boolean;
  matchesLoading: boolean;

  fetchStats: () => Promise<void>;
  fetchRecentMatches: () => Promise<void>;
  reset: () => void;
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  stats: null,
  statsLoaded: false,
  statsLoading: false,

  recentMatches: [],
  matchesLoaded: false,
  matchesLoading: false,

  fetchStats: async () => {
    if (get().statsLoaded) return;
    set({ statsLoading: true });
    try {
      const data = await userApi.getStats();
      set({ stats: data, statsLoaded: true, statsLoading: false });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      set({ statsLoading: false });
    }
  },

  fetchRecentMatches: async () => {
    if (get().matchesLoaded) return;
    set({ matchesLoading: true });
    try {
      const data = await matchApi.getUserMatches({ limit: 5 });
      set({ recentMatches: data, matchesLoaded: true, matchesLoading: false });
    } catch (error) {
      console.error('Failed to fetch recent matches:', error);
      set({ matchesLoading: false });
    }
  },

  reset: () => {
    set({
      stats: null,
      statsLoaded: false,
      statsLoading: false,
      recentMatches: [],
      matchesLoaded: false,
      matchesLoading: false,
    });
  },
}));
