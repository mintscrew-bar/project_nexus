import { create } from "zustand";

export type LabTabKey = "meta" | "champions" | "compositions" | "oracle";
export type LabPeriod = "30d" | "90d" | "all";
export type LabPosition = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT" | "ALL";

type LabCacheKey = LabTabKey | "global";

interface LabStoreState {
  activeTab: LabTabKey;
  period: LabPeriod;
  position: LabPosition;
  cacheVersion: Record<LabCacheKey, number>;
  setActiveTab: (tab: LabTabKey) => void;
  setPeriod: (period: LabPeriod) => void;
  setPosition: (position: LabPosition) => void;
  invalidateTabCache: (tab: LabCacheKey) => void;
  invalidateAllCaches: () => void;
}

const initialCacheVersion: Record<LabCacheKey, number> = {
  meta: 0,
  champions: 0,
  compositions: 0,
  oracle: 0,
  global: 0,
};

export const useLabStore = create<LabStoreState>((set) => ({
  activeTab: "meta",
  period: "30d",
  position: "ALL",
  cacheVersion: initialCacheVersion,
  setActiveTab: (activeTab) => set({ activeTab }),
  setPeriod: (period) => set({ period }),
  setPosition: (position) => set({ position }),
  invalidateTabCache: (tab) =>
    set((state) => ({
      cacheVersion: {
        ...state.cacheVersion,
        [tab]: state.cacheVersion[tab] + 1,
      },
    })),
  invalidateAllCaches: () =>
    set((state) => ({
      cacheVersion: {
        meta: state.cacheVersion.meta + 1,
        champions: state.cacheVersion.champions + 1,
        compositions: state.cacheVersion.compositions + 1,
        oracle: state.cacheVersion.oracle + 1,
        global: state.cacheVersion.global + 1,
      },
    })),
}));
