import { create } from 'zustand';
import { riotApi } from '@/lib/api-client';

interface ChampionPreference {
  id: string;
  championId: string;
  role: string;
  order: number;
}

export interface RiotAccount {
  id: string;
  gameName: string;
  tagLine: string;
  puuid: string;
  summonerId: string;
  tier: string;
  rank: string;
  lp: number;
  peakTier?: string;
  peakRank?: string;
  mainRole: string;
  subRole: string;
  isPrimary: boolean;
  verifiedAt: string;
  lastSyncedAt: string;
  championPreferences?: ChampionPreference[];
}

interface VerificationData {
  gameName: string;
  tagLine: string;
  currentIconId: number;
  requiredIconId: number;
  expiresIn: number;
}

interface RiotStoreState {
  // State
  accounts: RiotAccount[];
  primaryAccount: RiotAccount | null;
  selectedAccount: RiotAccount | null;
  isLoading: boolean;
  error: string | null;

  // Verification state
  verificationData: VerificationData | null;
  isVerifying: boolean;

  // Actions - Account Management
  fetchAccounts: () => Promise<void>;
  setPrimaryAccount: (accountId: string) => Promise<void>;
  syncAccount: (accountId: string) => Promise<void>;
  selectAccount: (account: RiotAccount | null) => void;
  updateChampions: (accountId: string, role: string, championIds: string[]) => Promise<void>;

  // Actions - Verification Flow
  startVerification: (gameName: string, tagLine: string) => Promise<VerificationData>;
  checkVerification: () => Promise<{ verified: boolean; expected: number; current: number }>;
  registerAccount: (data: {
    gameName: string;
    tagLine: string;
    mainRole: string;
    subRole: string;
    championsByRole: Record<string, string[]>;
    peakTier?: string;
    peakRank?: string;
  }) => Promise<void>;

  // Actions - Utility
  reset: () => void;
  clearError: () => void;
}

export const useRiotStore = create<RiotStoreState>((set, get) => ({
  accounts: [],
  primaryAccount: null,
  selectedAccount: null,
  isLoading: false,
  error: null,
  verificationData: null,
  isVerifying: false,

  // ========================================
  // Account Management
  // ========================================

  fetchAccounts: async () => {
    set({ isLoading: true, error: null });
    try {
      const accounts = await riotApi.getAccounts();
      const primary = accounts.find((acc: RiotAccount) => acc.isPrimary) || accounts[0] || null;
      set({
        accounts,
        primaryAccount: primary,
        selectedAccount: get().selectedAccount || primary,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '계정 목록을 불러올 수 없습니다',
        isLoading: false,
      });
    }
  },

  setPrimaryAccount: async (accountId: string) => {
    set({ isLoading: true, error: null });
    try {
      await riotApi.setPrimaryAccount(accountId);

      // Update local state
      const accounts = get().accounts.map(acc => ({
        ...acc,
        isPrimary: acc.id === accountId,
      }));

      const primary = accounts.find(acc => acc.isPrimary) || null;

      set({
        accounts,
        primaryAccount: primary,
        selectedAccount: primary,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '대표 계정 설정에 실패했습니다',
        isLoading: false,
      });
      throw error;
    }
  },

  syncAccount: async (accountId: string) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await riotApi.syncAccount(accountId);

      // Update local state
      const accounts = get().accounts.map(acc =>
        acc.id === accountId ? { ...acc, ...updated } : acc
      );

      set({
        accounts,
        primaryAccount: accounts.find(a => a.isPrimary) || null,
        selectedAccount: accounts.find(a => a.id === get().selectedAccount?.id) || null,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '계정 동기화에 실패했습니다',
        isLoading: false,
      });
    }
  },

  selectAccount: (account: RiotAccount | null) => {
    set({ selectedAccount: account });
  },

  // ========================================
  // Verification Flow
  // ========================================

  startVerification: async (gameName: string, tagLine: string) => {
    set({ isVerifying: true, error: null });
    try {
      const data = await riotApi.startVerification(gameName, tagLine);
      set({
        verificationData: data,
        isVerifying: false,
      });
      return data;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '소환사를 찾을 수 없습니다',
        isVerifying: false,
      });
      throw error;
    }
  },

  checkVerification: async () => {
    set({ isVerifying: true, error: null });
    try {
      const result = await riotApi.checkVerification();
      set({ isVerifying: false });
      return result;
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '인증 확인에 실패했습니다',
        isVerifying: false,
      });
      throw error;
    }
  },

  registerAccount: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await riotApi.registerAccount(data);

      // Clear verification data
      set({ verificationData: null });

      // Refresh accounts
      await get().fetchAccounts();
    } catch (error: any) {
      set({
        error: error.response?.data?.message || '계정 등록에 실패했습니다',
        isLoading: false,
      });
      throw error;
    }
  },

  updateChampions: async (accountId: string, role: string, championIds: string[]) => {
    set({ isLoading: true, error: null });
    try {
        const updatedPreferences = await riotApi.updateChampions(accountId, role, championIds);
        
        // Update local state
        const accounts = get().accounts.map(acc => {
            if (acc.id === accountId) {
                const otherPreferences = acc.championPreferences?.filter(p => p.role !== role) || [];
                return { ...acc, championPreferences: [...otherPreferences, ...updatedPreferences] };
            }
            return acc;
        });

        set({ accounts, isLoading: false });

    } catch (error: any) {
        set({
            error: error.response?.data?.message || '챔피언 선호도 업데이트에 실패했습니다.',
            isLoading: false,
        });
        throw error;
    }
  },

  // ========================================
  // Utility
  // ========================================

  reset: () => {
    set({
      accounts: [],
      primaryAccount: null,
      selectedAccount: null,
      isLoading: false,
      error: null,
      verificationData: null,
      isVerifying: false,
    });
  },

  clearError: () => {
    set({ error: null });
  },
}));
