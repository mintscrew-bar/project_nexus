import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { clanApi, friendApi, roomInviteApi } from "@/lib/api-client";

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
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  createdAt: string;
  user: FriendUser;
  friend: FriendUser;
}

/** 클랜 정보 요약 — 친구창의 클랜 초대·가입 요청 줄에 쓴다 */
export interface ClanBrief {
  id: string;
  name: string;
  tag: string;
  /** 클랜은 게임마다 따로라 [롤]/[배그] 를 붙여 보여준다 */
  gameTitle?: "LOL" | "PUBG";
}

/** 내가 받은 클랜 초대 (GET /clans/invitations/my) */
export interface ClanInviteItem {
  id: string;
  createdAt: string;
  clan: ClanBrief;
  inviter: FriendUser;
}

/** 내가 관리하는 클랜에 들어온 가입 요청 (GET /clans/join-requests/managed) */
export interface ClanJoinRequestItem {
  id: string;
  createdAt: string;
  clan: ClanBrief;
  /** 가입을 요청한 사람 */
  inviter: FriendUser;
}

/** 친구에게 받은 내전 초대 (GET /room-invites, 알림 소켓 "room-invite") */
export interface RoomInviteItem {
  roomId: string;
  roomName: string;
  gameTitle: "LOL" | "PUBG";
  playerCount: number;
  maxParticipants: number;
  inviter: FriendUser;
  createdAt: string;
  /** 이 시각이 지나면 서버가 초대를 버린다(30분) */
  expiresAt: string;
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
  /**
   * 친구·클랜 관련 요청은 알림(종)이 아니라 친구창에서 처리한다
   * (운영자 결정, 2026-09-22). 받은 클랜 초대와, 내가 관리하는 클랜의 가입 요청.
   */
  clanInvites: ClanInviteItem[];
  clanJoinRequests: ClanJoinRequestItem[];
  /** 받은 내전 초대. 팝업으로 한 번 뜨고, 놓치면 대기 탭에 남는다. */
  roomInvites: RoomInviteItem[];
  /** 지금 화면 왼쪽 아래 팝업에 띄울 초대(방 id). 닫아도 대기 탭에는 남는다. */
  popupInviteRoomId: string | null;
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
  fetchClanRequests: () => Promise<void>;
  resolveClanInvite: (invitationId: string, accept: boolean) => Promise<void>;
  resolveClanJoinRequest: (
    clanId: string,
    requestId: string,
    accept: boolean,
  ) => Promise<void>;
  fetchRoomInvites: () => Promise<void>;
  /** 알림 소켓으로 초대가 도착했다 — 목록에 넣고 팝업을 띄운다 */
  receiveRoomInvite: (invite: RoomInviteItem) => void;
  /** 팝업만 닫는다(초대는 대기 탭에 남는다) */
  dismissInvitePopup: () => void;
  /** 참가를 눌렀다 — 로비 입장은 화면 이동이 한다. 목록에서만 뺀다 */
  takeRoomInvite: (roomId: string) => void;
  declineRoomInvite: (roomId: string) => Promise<void>;
  inviteFriendToRoom: (roomId: string, friendId: string) => Promise<void>;
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
      clanInvites: [],
      clanJoinRequests: [],
      roomInvites: [],
      popupInviteRoomId: null,
      isLoading: false,

      openPanel: () => set({ isOpen: true }),
      closePanel: () => set({ isOpen: false }),
      togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),

      // 플로팅 DM 창: 같은 유저면 토글, 다른 유저면 전환
      openFloatingDm: (target) =>
        set((s) =>
          s.floatingDmTarget?.id === target.id
            ? { floatingDmTarget: null }
            : { floatingDmTarget: target },
        ),
      closeFloatingDm: () => set({ floatingDmTarget: null }),

      // 플로팅 클랜 채팅 창
      openClanChat: () => set({ isClanChatOpen: true }),
      closeClanChat: () => set({ isClanChatOpen: false }),
      toggleClanChat: () => set((s) => ({ isClanChatOpen: !s.isClanChatOpen })),

      fetchFriends: async () => {
        // 클랜 요청도 친구창 "대기" 탭에 같이 나온다. 친구 목록과 따로 실패해도 되게
        // 기다리지 않고 나란히 부른다. 받은 내전 초대도 같다.
        void get().fetchClanRequests();
        void get().fetchRoomInvites();
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
            const pairKey = [f.userId, f.friendId].sort().join("|");
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

      fetchClanRequests: async () => {
        // 둘 중 하나가 실패해도 나머지는 보여준다(운영진이 아니면 가입 요청은 빈 배열).
        const [invites, joinRequests] = await Promise.allSettled([
          clanApi.getMyInvitations(),
          clanApi.getManagedJoinRequests(),
        ]);
        set({
          clanInvites:
            invites.status === "fulfilled" ? invites.value : get().clanInvites,
          clanJoinRequests:
            joinRequests.status === "fulfilled"
              ? joinRequests.value
              : get().clanJoinRequests,
        });
      },

      resolveClanInvite: async (invitationId, accept) => {
        await clanApi.resolveInvitation(invitationId, accept);
        set((s) => ({
          clanInvites: s.clanInvites.filter((item) => item.id !== invitationId),
        }));
      },

      resolveClanJoinRequest: async (clanId, requestId, accept) => {
        await clanApi.resolveJoinRequest(clanId, requestId, accept);
        set((s) => ({
          clanJoinRequests: s.clanJoinRequests.filter(
            (item) => item.id !== requestId,
          ),
        }));
      },

      fetchRoomInvites: async () => {
        try {
          const invites: RoomInviteItem[] = await roomInviteApi.getReceived();
          set((s) => ({
            roomInvites: invites,
            // 팝업에 떠 있던 초대가 이미 무효(방 시작·만료)면 팝업도 닫는다.
            popupInviteRoomId: invites.some(
              (i) => i.roomId === s.popupInviteRoomId,
            )
              ? s.popupInviteRoomId
              : null,
          }));
        } catch {
          // 대기 탭이 비어 보일 뿐이다. 조용히 넘어간다.
        }
      },

      receiveRoomInvite: (invite) => {
        set((s) => ({
          // 같은 방 초대는 하나만 — 새로 온 것(초대한 사람·인원)으로 바꾼다.
          roomInvites: [
            invite,
            ...s.roomInvites.filter((i) => i.roomId !== invite.roomId),
          ],
          popupInviteRoomId: invite.roomId,
        }));
      },

      dismissInvitePopup: () => set({ popupInviteRoomId: null }),

      takeRoomInvite: (roomId) => {
        // 서버의 초대는 입장이 성공하면 지워진다(RoomService.joinRoom). 입장이
        // 실패하면 서버에 남아 있어, 다음 목록 조회 때 대기 탭에 다시 나타난다.
        set((s) => ({
          roomInvites: s.roomInvites.filter((i) => i.roomId !== roomId),
          popupInviteRoomId:
            s.popupInviteRoomId === roomId ? null : s.popupInviteRoomId,
        }));
      },

      declineRoomInvite: async (roomId) => {
        get().takeRoomInvite(roomId);
        await roomInviteApi.decline(roomId);
      },

      inviteFriendToRoom: async (roomId, friendId) => {
        await roomInviteApi.invite(roomId, friendId);
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
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, name } : c,
          ),
        }));
      },

      deleteCategory: (id) => {
        set((s) => {
          const newMeta: Record<string, FriendMeta> = {};
          for (const [fid, meta] of Object.entries(s.friendMeta)) {
            newMeta[fid] =
              meta.categoryId === id ? { ...meta, categoryId: null } : meta;
          }
          return {
            categories: s.categories.filter((c) => c.id !== id),
            friendMeta: newMeta,
          };
        });
      },

      toggleCategoryCollapse: (id) => {
        set((s) => ({
          categories: s.categories.map((c) =>
            c.id === id ? { ...c, isCollapsed: !c.isCollapsed } : c,
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
            [friendId]: {
              ...s.friendMeta[friendId],
              nickname: nickname || undefined,
            },
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
      name: "nexus-friends-v1",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined")
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        return localStorage;
      }),
      // 보안: friendMeta(닉네임·메모)는 민감 정보이므로 persist 제외
      // → 공유 PC에서 친구 닉네임/메모가 localStorage에 남는 문제 방지
      // → 카테고리 구조와 접기 상태만 유지 (개인정보 미포함)
      partialize: (s) => ({
        categories: s.categories,
        uncategorizedCollapsed: s.uncategorizedCollapsed,
      }),
    },
  ),
);
