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

/** 플로팅 DM 창에 필요한 상대 유저 정보 */
export interface FloatingDmTarget {
  id: string;
  username: string;
  avatar: string | null;
}

interface FriendStore {
  // Panel state
  isOpen: boolean;

  // 플로팅 DM 창 상태 (롤 스타일 — 패널 왼쪽에 별도 팝업)
  floatingDmTarget: FloatingDmTarget | null;
  // 플로팅 클랜 채팅 창 열림 여부
  isClanChatOpen: boolean;

  // Persisted
  categories: FriendCategory[];
  friendMeta: Record<string, FriendMeta>;
  // 미분류("전체") 카테고리의 접기 상태 — 커스텀 카테고리와 별도 관리
  uncategorizedCollapsed: boolean;

  // Transient (from API)
  friends: Friendship[];
  pendingRequests: Friendship[];
  isLoading: boolean;

  // Panel
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;

  // 플로팅 DM 창 액션
  openFloatingDm: (target: FloatingDmTarget) => void;
  closeFloatingDm: () => void;
  // 플로팅 클랜 채팅 창 액션
  openClanChat: () => void;
  closeClanChat: () => void;
  toggleClanChat: () => void;

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
  // 미분류("전체") 카테고리 접기/펼치기 토글
  toggleUncategorizedCollapse: () => void;
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
      floatingDmTarget: null,
      isClanChatOpen: false,
      categories: [],
      friendMeta: {},
      uncategorizedCollapsed: false,
      friends: [],
      pendingRequests: [],
      isLoading: false,

      openPanel: () => set({ isOpen: true }),
      closePanel: () => set({ isOpen: false }),
      togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),

      // 플로팅 DM 창: 같은 유저면 토글, 다른 유저면 전환
      openFloatingDm: (target) =>
        set((s) =>
          s.floatingDmTarget?.id === target.id
            ? { floatingDmTarget: null }
            : { floatingDmTarget: target }
        ),
      closeFloatingDm: () => set({ floatingDmTarget: null }),

      // 플로팅 클랜 채팅 창
      openClanChat: () => set({ isClanChatOpen: true }),
      closeClanChat: () => set({ isClanChatOpen: false }),
      toggleClanChat: () => set((s) => ({ isClanChatOpen: !s.isClanChatOpen })),

      fetchFriends: async () => {
        set({ isLoading: true });
        try {
          const [friends, pending] = await Promise.all([
            friendApi.getFriends(),
            friendApi.getPendingRequests(),
          ]);

          // 안전망: 백엔드에서 중복 제거를 해도 혹시라도 양방향 레코드(A→B, B→A)가
          // 동시에 내려오면 동일 유저가 두 번 나타나는 버그가 생기므로 프론트에서도 제거.
          // userId·friendId 쌍을 정렬하여 키로 사용하면 방향에 상관없이 중복 감지 가능.
          const seenPairs = new Set<string>();
          const dedupedFriends = (friends as Friendship[]).filter((f) => {
            const pairKey = [f.userId, f.friendId].sort().join('|');
            if (seenPairs.has(pairKey)) return false;
            seenPairs.add(pairKey);
            return true;
          });

          set({ friends: dedupedFriends, pendingRequests: pending });
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

      removeFriend: async (friendUserId) => {
        await friendApi.removeFriend(friendUserId);
        // 해당 유저가 포함된 friendship 레코드 모두 제거
        set((s) => ({
          friends: s.friends.filter(
            (f) => f.userId !== friendUserId && f.friendId !== friendUserId,
          ),
        }));
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

      // 미분류("전체") 카테고리 접기/펼치기
      toggleUncategorizedCollapse: () => {
        set((s) => ({ uncategorizedCollapsed: !s.uncategorizedCollapsed }));
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
      partialize: (s) => ({ categories: s.categories, friendMeta: s.friendMeta, uncategorizedCollapsed: s.uncategorizedCollapsed }),
    }
  )
);
