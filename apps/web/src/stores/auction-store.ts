import { create } from 'zustand';
import { auctionApi, roomApi } from '@/lib/api-client';
import {
  connectAuctionSocket,
  disconnectAuctionSocket,
  auctionSocketHelpers,
} from '@/lib/socket-client';
import { useLobbyStore } from '@/stores/lobby-store';

let bidErrorToken = 0;

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
  captainName?: string;
  members: Player[];
  remainingGold: number;
  remainingBudget: number;
}

interface AuctionState {
  roomId: string;
  currentPlayerIndex: number;
  currentPlayer: Player | null;
  currentHighestBid: number;
  currentHighestBidder: string | null;
  currentHighestBidderName?: string | null;
  timerEnd: number;
  yuchalCount: number;
  maxYuchalCycles: number;
  bidIncrement: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface BidHistoryEntry {
  username: string;
  amount: number;
  timestamp: number;
  /** 선수 구분 마커 (bid-resolved 시 삽입) */
  playerLabel?: string;
  isSeparator?: boolean;
}

type CaptainSelectionMode = 'TIER' | 'MANUAL' | 'VOLUNTEER';

interface Participant {
  id: string;
  username: string;
  avatar?: string;
  tier?: string;
  rank?: string;
  mmr?: number;
}

interface CaptainSelectionPhase {
  mode: CaptainSelectionMode;
  requiredCount: number;
  volunteers: string[];
  timerEnd: number | null;
  participants: Participant[];
  hostId: string;
}

interface AuctionStoreState {
  auctionState: AuctionState | null;
  players: Player[];
  teams: Team[];
  bidHistory: BidHistoryEntry[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  currentUserId: string | null;
  currentUserIsCaptain: boolean;
  currentUserTeam: Team | null;
  captainSelectionPhase: CaptainSelectionPhase | null;
  sessionAbortedAt: number | null;
  sessionAbortMessage: string | null;
  /** 최근 낙찰 정보 (피드백 표시용, 일정 시간 후 자동 클리어) */
  lastSoldEvent: { playerName: string; teamName: string; price: number; timestamp: number } | null;
  processedSoldPlayerIds: Set<string>;

  // REST API methods
  startAuction: (roomId: string) => Promise<void>;
  getAuctionState: (roomId: string) => Promise<void>;

  // WebSocket methods
  connectToAuction: (roomId: string) => Promise<void>;
  disconnectFromAuction: () => void;
  placeBid: (amount: number) => Promise<void>;
  setCurrentUserId: (userId: string) => void;

  // Captain selection
  volunteerAsCaptain: (roomId: string) => void;
  finalizeVolunteers: (roomId: string, selectedUserIds?: string[]) => void;
  selectManualCaptains: (roomId: string, userIds: string[]) => void;
  clearSessionAbort: () => void;
}

function resolveCurrentPlayer(rawState: any, players: Player[]): Player | null {
  if (!players.length) return null;
  // Prefer server-provided currentPlayer over index-based lookup
  if (rawState?.currentPlayer?.id) {
    const found = players.find(p => p.id === rawState.currentPlayer.id);
    if (found) return found;
  }
  const idx = typeof rawState?.currentPlayerIndex === 'number' ? rawState.currentPlayerIndex : 0;
  return players[idx] ?? players[0] ?? null;
}

function normalizeAuctionState(rawState: any, players: Player[]): AuctionState | null {
  if (!rawState) return null;

  return {
    roomId: rawState.roomId ?? '',
    currentPlayerIndex: typeof rawState.currentPlayerIndex === 'number' ? rawState.currentPlayerIndex : 0,
    currentPlayer: rawState.currentPlayer ?? resolveCurrentPlayer(rawState, players),
    currentHighestBid: typeof rawState.currentHighestBid === 'number' ? rawState.currentHighestBid : 0,
    currentHighestBidder: rawState.currentHighestBidder ?? null,
    currentHighestBidderName: rawState.currentHighestBidderName ?? null,
    timerEnd: typeof rawState.timerEnd === 'number' ? rawState.timerEnd : Date.now(),
    yuchalCount: typeof rawState.yuchalCount === 'number' ? rawState.yuchalCount : 0,
    maxYuchalCycles: typeof rawState.maxYuchalCycles === 'number' ? rawState.maxYuchalCycles : 0,
    bidIncrement: typeof rawState.bidIncrement === 'number' ? rawState.bidIncrement : 50,
    status: rawState.status ?? 'IN_PROGRESS',
  };
}

function getAuctionPlayerName(player: any): string {
  return player?.username ?? player?.user?.username ?? player?.name ?? '???';
}

function mapRoomFallbackData(room: any): { teams: Team[]; players: Player[] } {
  const teams: Team[] = Array.isArray(room?.teams)
    ? room.teams.map((team: any) => ({
        id: team.id,
        name: team.name,
        captainId: team.captainId,
        captainName: team.captainName ?? team.captain?.username ?? undefined,
        members: Array.isArray(team.members)
          ? team.members.map((m: any) => ({
              id: m.userId ?? m.user?.id ?? '',
              username: m.user?.username ?? 'Unknown',
              tier: m.user?.riotAccounts?.[0]?.tier ?? 'UNRANKED',
              rank: m.user?.riotAccounts?.[0]?.rank,
              mmr: undefined,
              position: m.assignedRole ?? 'FLEX',
              avatar: m.user?.avatar ?? undefined,
            }))
          : [],
        remainingGold: team.remainingBudget ?? team.remainingGold ?? 0,
        remainingBudget: team.remainingBudget ?? 0,
      }))
    : [];

  const players: Player[] = Array.isArray(room?.participants)
    ? room.participants
        .filter((p: any) => !p.teamId && !p.isCaptain && p.role === 'PLAYER')
        .map((p: any) => ({
          id: p.userId ?? p.id,
          username: p.username ?? 'Unknown',
          tier: p.riotAccount?.tier ?? 'UNRANKED',
          rank: p.riotAccount?.rank,
          mmr: undefined,
          position: p.riotAccount?.mainRole ?? 'FLEX',
          avatar: p.avatar ?? undefined,
        }))
    : [];

  return { teams, players };
}

export const useAuctionStore = create<AuctionStoreState>((set, get) => ({
  auctionState: null,
  players: [],
  teams: [],
  bidHistory: [],
  isConnected: false,
  isLoading: false,
  error: null,
  currentUserId: null,
  currentUserIsCaptain: false,
  currentUserTeam: null,
  captainSelectionPhase: null,
  sessionAbortedAt: null,
  sessionAbortMessage: null,
  lastSoldEvent: null,
  processedSoldPlayerIds: new Set(),

  startAuction: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      await auctionApi.startAuction(roomId);
      set({ isLoading: false });
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to start auction.",
        isLoading: false,
      });
    }
  },

  getAuctionState: async (roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await auctionApi.getAuctionState(roomId);
      if (response.state) {
        set({
          auctionState: normalizeAuctionState(response.state, get().players),
          isLoading: false,
        });
      } else {
        set({ error: response.error || "Auction not started", isLoading: false });
      }
    } catch (err: any) {
      set({
        error: err.response?.data?.message || err.message || "Failed to get auction state.",
        isLoading: false,
      });
    }
  },

  connectToAuction: async (roomId: string) => {
    set({
      isLoading: true,
      error: null,
      sessionAbortedAt: null,
      sessionAbortMessage: null,
    });
    const socket = connectAuctionSocket();
    // Clear existing listeners (game events + raw socket events) to prevent duplication
    auctionSocketHelpers.offAllListeners();
    socket?.off('connect');
    socket?.off('disconnect');

    // 팀장 선정 단계 이벤트
    auctionSocketHelpers.onCaptainSelectionPhase((data: CaptainSelectionPhase) => {
      set({ captainSelectionPhase: data });
    });

    auctionSocketHelpers.onVolunteerListUpdated((data: { volunteers: string[] }) => {
      set((state) => ({
        captainSelectionPhase: state.captainSelectionPhase
          ? { ...state.captainSelectionPhase, volunteers: data.volunteers }
          : null,
      }));
    });

    auctionSocketHelpers.onVolunteerFinalized(() => {
      set({ captainSelectionPhase: null });
    });

    auctionSocketHelpers.onCaptainsConfirmed(() => {
      set({ captainSelectionPhase: null });
    });

    // auction-started: 서버 키가 auctionState (data.state는 레거시 호환)
    auctionSocketHelpers.onAuctionStarted((data: any) => {
      const nextPlayers = data.players ?? [];
      const nextState = normalizeAuctionState(data.auctionState ?? data.state ?? null, nextPlayers);
      set({
        auctionState: nextState,
        teams: data.teams ?? [],
        players: nextPlayers,
        captainSelectionPhase: null,
        processedSoldPlayerIds: new Set(),
      });
    });

    auctionSocketHelpers.onNewBid((data: { userId: string; username: string; amount: number; timerEnd: number }) => {
      set((state) => ({
        auctionState: state.auctionState
          ? {
              ...state.auctionState,
              currentHighestBid: data.amount,
              currentHighestBidder: (data as any).teamId ?? data.userId,
              currentHighestBidderName: data.username ?? null,
              timerEnd: data.timerEnd,
            }
          : null,
        bidHistory: [...state.bidHistory, { username: data.username, amount: data.amount, timestamp: Date.now() }],
      }));
    });

    // player-sold는 bid-resolved 직후에 도착하므로,
    // bid-resolved가 이미 teams/players를 갱신한 경우 중복 처리 방지 (no-op)
    // bid-resolved에 teams/players가 없는 레거시 호환용으로만 동작
    auctionSocketHelpers.onPlayerSold((data: any) => {
      set((state) => {
        const playerId = data?.player?.id;
        if (playerId && state.processedSoldPlayerIds.has(playerId)) {
          return state;
        }
        const processedSoldPlayerIds = new Set(state.processedSoldPlayerIds);
        if (playerId) processedSoldPlayerIds.add(playerId);

        const nextPlayers = data?.player
          ? state.players.filter((p) => p.id !== data.player.id)
          : state.players;

        const nextTeams = Array.isArray(data?.teams)
          ? data.teams
          : data?.team
            ? state.teams.map((team) => (team.id === data.team.id ? { ...team, ...data.team } : team))
            : state.teams;

        return {
          teams: nextTeams,
          players: nextPlayers,
          processedSoldPlayerIds,
          auctionState: state.auctionState
            ? normalizeAuctionState(state.auctionState, nextPlayers)
            : null,
        };
      });
    });

    auctionSocketHelpers.onPlayerUnsold((data: { player: Player; yuchalCount: number }) => {
      set((state) => ({
        auctionState: state.auctionState
          ? { ...state.auctionState, yuchalCount: data.yuchalCount }
          : null,
      }));
    });

    auctionSocketHelpers.onAuctionComplete((data?: { teams?: Team[] }) => {
      set((state) => ({
        teams: Array.isArray(data?.teams) ? data!.teams! : state.teams,
        auctionState: state.auctionState
          ? { ...state.auctionState, status: 'COMPLETED' }
          : null,
      }));
    });

    // timer-update는 무시 — timerEnd는 initial state·new-bid에서 절대값으로 설정됨.
    // 정수 timeLeft로 재계산하면 최대 1초 drift가 발생해 표시가 오락가락하는 문제 있음.
    auctionSocketHelpers.onTimerUpdate((_data: { timeLeft: number }) => { /* no-op */ });

    auctionSocketHelpers.onBidResolved((data: {
      sold: boolean;
      player?: any;
      team?: any;
      price?: number;
      nextPlayer?: any;
      state?: AuctionState;
      teams?: Team[];
      players?: Player[];
    }) => {
      set((state) => {
        const updates: Partial<AuctionStoreState> = {};

        const nextPlayers = Array.isArray(data.players) ? data.players : state.players;
        const nextTeams = Array.isArray(data.teams) ? data.teams : state.teams;

        if (Array.isArray(data.players)) {
          updates.players = data.players;
        }
        if (Array.isArray(data.teams)) {
          updates.teams = data.teams;
        }

        if (data.state) {
          updates.auctionState = normalizeAuctionState(data.state, nextPlayers);
        }
        if (data.sold && data.team) {
          const processedSoldPlayerIds = new Set(state.processedSoldPlayerIds);
          if (data.player?.id) processedSoldPlayerIds.add(data.player.id);
          updates.processedSoldPlayerIds = processedSoldPlayerIds;
          updates.teams = nextTeams.map(t =>
            t.id === data.team.id ? { ...t, ...data.team } : t
          );
          // 낙찰 피드백 정보 저장 (5초 후 자동 클리어)
          const soldEvent = {
            playerName: getAuctionPlayerName(data.player),
            teamName: data.team?.name ?? '???',
            price: data.price ?? 0,
            timestamp: Date.now(),
          };
          updates.lastSoldEvent = soldEvent;
          setTimeout(() => {
            // 다른 이벤트로 교체되지 않았을 때만 클리어
            if (get().lastSoldEvent?.timestamp === soldEvent.timestamp) {
              set({ lastSoldEvent: null });
            }
          }, 5000);
        }

        // 다음 선수 구분 마커 삽입
        const nextPlayerName = data.state?.currentPlayer?.username
          ?? data.nextPlayer?.username;
        if (nextPlayerName) {
          updates.bidHistory = [
            ...state.bidHistory,
            {
              username: '',
              amount: 0,
              timestamp: Date.now(),
              playerLabel: nextPlayerName,
              isSeparator: true,
            },
          ];
        }

        return { ...state, ...updates };
      });
    });

    auctionSocketHelpers.onTimerExpired(() => {
      // Timer expired is followed by bid-resolved, no action needed here
    });

    auctionSocketHelpers.onSessionAborted((data: { message?: string }) => {
      set({
        sessionAbortedAt: Date.now(),
        sessionAbortMessage:
          data?.message ?? "Session aborted. Returning to lobby.",
      });
    });

    // 재연결 핸들러를 초기 join 전에 등록 (join 성공/실패 모두에서 reconnect 가능)
    socket?.on('connect', async () => {
      // 재연결 시 세션 중단 상태 초기화 (이전 세션 상태 잔류 방지)
      set({ isConnected: true, sessionAbortedAt: null, sessionAbortMessage: null });
      const response = await auctionSocketHelpers.joinAuction(roomId);
      if (response?.success) {
        useLobbyStore.getState().disconnect({ skipLeave: true });
        const currentState = get();
        const nextPlayers = Array.isArray(response.players) && response.players.length > 0
          ? response.players
          : currentState.players;
        const nextTeams = Array.isArray(response.teams) && response.teams.length > 0
          ? response.teams
          : currentState.teams;
        const nextAuctionState = response.state
          ? normalizeAuctionState(response.state, nextPlayers)
          : currentState.auctionState;
        const nextCaptainPhase = response.captainSelectionPhase !== undefined
          ? response.captainSelectionPhase
          : currentState.captainSelectionPhase;
        set({
          players: nextPlayers,
          teams: nextTeams,
          auctionState: nextAuctionState,
          captainSelectionPhase: nextCaptainPhase,
          isConnected: true,
          isLoading: false,
          error: null,
        });
      } else {
        set({
          auctionState: null,
          players: [],
          teams: [],
          isConnected: false,
          error: response?.error || 'Failed to rejoin auction after reconnect.',
        });
      }
    });
    socket?.on('disconnect', () => set({ isConnected: false }));

    // join-room ACK로 초기 상태 수신 (auction-started를 놓친 경우 처리)
    let joinResponse = await auctionSocketHelpers.joinAuction(roomId);

    if (
      !joinResponse?.success &&
      (joinResponse?.error === "join_timeout" ||
        joinResponse?.error === "connect_timeout")
    ) {
      if ((get().auctionState || get().teams.length > 0) && socket?.connected) {
        try {
          const fallbackState = await auctionApi.getAuctionState(roomId);
          if (fallbackState?.state) {
            set((state) => ({
              auctionState: normalizeAuctionState(fallbackState.state, state.players),
              isConnected: true,
              isLoading: false,
              error: null,
            }));
          } else {
            set({ isConnected: true, isLoading: false, error: null });
          }
        } catch {
          set({ isConnected: true, isLoading: false, error: null });
        }
        return;
      }
      joinResponse = await auctionSocketHelpers.joinAuction(roomId);
    }

    if (joinResponse?.success) {
      useLobbyStore.getState().disconnect({ skipLeave: true });
      let nextPlayers = Array.isArray(joinResponse.players) ? joinResponse.players : [];
      let nextTeams = Array.isArray(joinResponse.teams) ? joinResponse.teams : [];
      let nextAuctionState = joinResponse.state;

      if ((nextTeams.length === 0 || nextPlayers.length === 0) && joinResponse.state) {
        try {
          const room = await roomApi.getRoom(roomId);
          const fallback = mapRoomFallbackData(room);
          if (nextTeams.length === 0) nextTeams = fallback.teams;
          if (nextPlayers.length === 0) nextPlayers = fallback.players;
          const fallbackState = await auctionApi.getAuctionState(roomId);
          if (fallbackState?.state) nextAuctionState = fallbackState.state;
        } catch (fallbackErr) {
          // 폴백 REST 호출 실패 — 소켓 페이로드 그대로 유지 (로그만 출력)
          console.error('[auction-store] REST fallback failed:', fallbackErr);
        }
      }

      const nextState = normalizeAuctionState(nextAuctionState, nextPlayers);
      const restoredPhase = joinResponse.captainSelectionPhase ?? null;
      set({
        players: nextPlayers,
        teams: nextTeams,
        auctionState: nextState,
          captainSelectionPhase: restoredPhase,
          processedSoldPlayerIds: new Set(),
          isConnected: true,
        isLoading: false,
        error: null,
      });
      return;
    }

    set({
      isConnected: false,
      isLoading: false,
      error: joinResponse?.error || "Failed to join auction room.",
    });
  },

  disconnectFromAuction: () => {
    // disconnectAuctionSocket 내부에서 connect/disconnect 핸들러도 제거됨
    auctionSocketHelpers.offAllListeners();
    disconnectAuctionSocket();
    set({
      isConnected: false,
      isLoading: false,
      auctionState: null,
      players: [],
      teams: [],
      bidHistory: [],
      error: null,
      currentUserId: null,
      currentUserIsCaptain: false,
      currentUserTeam: null,
      captainSelectionPhase: null,
      sessionAbortedAt: null,
      sessionAbortMessage: null,
      lastSoldEvent: null,
      processedSoldPlayerIds: new Set(),
    });
  },

  placeBid: async (amount: number) => {
    const { auctionState } = get();
    if (!auctionState?.roomId) return;

    const response = await auctionSocketHelpers.placeBid(auctionState.roomId, amount);
    if (response?.error) {
      const msg = response.error === 'bid_timeout'
        ? '입찰 요청 시간이 초과되었습니다.'
        : response.error;
      const token = ++bidErrorToken;
      set({ error: msg });
      // Auto-clear bid error after 3 seconds (다른 에러로 교체된 경우엔 클리어 안 함)
      setTimeout(() => {
        if (bidErrorToken === token && get().error === msg) set({ error: null });
      }, 3000);
    }
  },

  setCurrentUserId: (userId: string) => {
    const { teams } = get();
    const userTeam = teams.find(team => team.captainId === userId);
    set({
      currentUserId: userId,
      currentUserIsCaptain: !!userTeam,
      currentUserTeam: userTeam || null,
    });
  },

  volunteerAsCaptain: async (roomId: string) => {
    const response = await auctionSocketHelpers.volunteerCaptain(roomId);
    if (response?.error) {
      set({ error: response.error });
    }
  },

  finalizeVolunteers: async (roomId: string, selectedUserIds?: string[]) => {
    const response = await auctionSocketHelpers.finalizeVolunteers(roomId, selectedUserIds);
    if (response?.error) {
      set({ error: response.error });
    }
  },

  selectManualCaptains: async (roomId: string, userIds: string[]) => {
    const response = await auctionSocketHelpers.selectManualCaptains(roomId, userIds);
    if (response?.error) {
      set({ error: response.error });
    }
  },

  clearSessionAbort: () => {
    set({ sessionAbortedAt: null, sessionAbortMessage: null });
  },
}));
