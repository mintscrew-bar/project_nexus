import { create } from 'zustand';
import { riotApi } from '@/lib/api-client';

export interface Champion {
  id: string; // e.g. "Aatrox"
  key: string; // e.g. "266"
  name: string; // e.g. "Aatrox"
  title: string;
  blurb: string;
  info: any;
  image: {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
  tags: string[];
}

interface DdragonStoreState {
  champions: Champion[];
  championMap: Map<string, Champion>;
  version: string | null;
  isLoading: boolean;
  error: string | null;
  fetchChampions: () => Promise<void>;
}

export const useDdragonStore = create<DdragonStoreState>((set, get) => ({
  champions: [],
  championMap: new Map(),
  version: null,
  isLoading: false,
  error: null,
  fetchChampions: async () => {
    // Do not refetch if already loaded
    if (get().champions.length > 0) return;

    set({ isLoading: true, error: null });
    try {
      const response = await riotApi.getChampions();
      const championData = response.data;
      
      const champions: Champion[] = Object.values(championData);
      const championMap = new Map(champions.map(c => [c.key, c]));

      set({
        champions: champions.sort((a, b) => a.name.localeCompare(b.name)),
        championMap,
        version: response.version,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.message || '챔피언 목록을 불러올 수 없습니다.',
        isLoading: false,
      });
    }
  },
}));
