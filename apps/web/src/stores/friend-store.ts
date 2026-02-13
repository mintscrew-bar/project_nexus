import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { friendApi } from '@/lib/api-client';

export interface FriendCategory {
  id: string;
  name: string;
  isCollapsed: boolean;
}

export interface FriendMeta {
  nickname?: string;
  memo?: string;
  categoryId?: string | null; // null = 미분류
}

export interface FriendUser {
  id: string;
  username: string;
  avatar: string | null;
}

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  status: 'PENDING' | 'ACCEPTED' | 'BLOCKED';
  createdAt: string;
  user: FriendUser;
  friend: FriendUser;
}

interface FriendStore {
  // Panel state
  isOpen: boolean;

  // Persisted
  categories: FriendCategory[];
  friendMeta: Record<string, FriendMeta>;

  // Transient (from API)
  friends: Friendship[];
  pendingRequests: Friendship[];
  isLoading: boolean;

  // Panel
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  // Data
  fetchFriends: () => Promise<void>;
  acceptRequest: (id: string) => Promise<void>;
  rejectRequest: (id: string) => Promise<void>;
  removeFriend: (id: string) => Promise<void>;

  // Categories
  addCategory: (name: string) => string;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  toggleCategoryCollapse: (id: string) => void;
  setFriendCategory: (friendId: string, categoryId: string | null) => void;

  // Meta
  setNickname: (friendId: string, nickname: string) => void;
  setMemo: (friendId: string, memo: string) => void;
  getMeta: (friendId: string) => FriendMeta;
  getDisplayName: (friendId: string, username: string) => string;
}

export const useFriendStore = create<FriendStore>()(
  persist(
    (set, get) => ({
      isOpen: false,
      categories: [],
      friendMeta: {},
      friends: [],
      pendingRequests: [],
      isLoading: false,

      openPanel: () => set({ isOpen: true }),
      closePanel: () => set({ isOpen: false }),
      togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),

      fetchFriends: async () => {
        set({ isLoading: true });
        try {
          const [friends, pending] = await Promise.all([
            friendApi.getFriends(),
            friendApi.getPendingRequests(),
          ]);
          set({ friends, pendingRequests: pending });
        } catch {
          // silently fail — panel will show empty state
        } finally {
          set({ isLoading: false });
        }
      },

      acceptRequest: async (id) => {
        await friendApi.acceptRequest(id);
        await get().fetchFriends();
      },

      rejectRequest: async (id) => {
        await friendApi.rejectRequest(id);
        await get().fetchFriends();
      },

      removeFriend: async (id) => {
        await friendApi.removeFriend(id);
        set((s) => ({ friends: s.friends.filter((f) => f.id !== id) }));
      },

      addCategory: (name) => {
        const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        set((s) => ({
          categories: [...s.categories, { id, name, isCollapsed: false }],
        }));
        return id;
      },

      renameCategory: (id, name) => {
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)),
        }));
      },

      deleteCategory: (id) => {
        set((s) => {
          const newMeta: Record<string, FriendMeta> = {};
          for (const [fid, meta] of Object.entries(s.friendMeta)) {
            newMeta[fid] = meta.categoryId === id ? { ...meta, categoryId: null } : meta;
          }
          return { categories: s.categories.filter((c) => c.id !== id), friendMeta: newMeta };
        });
      },

      toggleCategoryCollapse: (id) => {
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, isCollapsed: !c.isCollapsed } : c
          ),
        }));
      },

      setFriendCategory: (friendId, categoryId) => {
        set((s) => ({
          friendMeta: {
            ...s.friendMeta,
            [friendId]: { ...s.friendMeta[friendId], categoryId },
          },
        }));
      },

      setNickname: (friendId, nickname) => {
        set((s) => ({
          friendMeta: {
            ...s.friendMeta,
            [friendId]: { ...s.friendMeta[friendId], nickname: nickname || undefined },
          },
        }));
      },

      setMemo: (friendId, memo) => {
        set((s) => ({
          friendMeta: {
            ...s.friendMeta,
            [friendId]: { ...s.friendMeta[friendId], memo: memo || undefined },
          },
        }));
      },

      getMeta: (friendId) => get().friendMeta[friendId] ?? {},

      getDisplayName: (friendId, username) => {
        return get().friendMeta[friendId]?.nickname || username;
      },
    }),
    {
      name: 'nexus-friends-v1',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        return localStorage;
      }),
      partialize: (s) => ({ categories: s.categories, friendMeta: s.friendMeta }),
    }
  )
);
