import { create } from 'zustand';
import { auctionApi, roomApi } from '@/lib/api-client';
import {
  connectAuctionSocket,
  disconnectAuctionSocket,
  auctionSocketHelpers,
} from '@/lib/socket-client';

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
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface BidHistoryEntry {
  username: string;
  amount: number;
  timestamp: number;
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

  // REST API methods
  startAuction: (roomId: string) => Promise<void>;
  getAuctionState: (roomId: string) => Promise<void>;

  // WebSocket methods
  connectToAuction: (roomId: string) => Promise<void>;
  disconnectFromAuction: () => void;
  placeBid: (amount: number) => void;
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
    status: rawState.status ?? 'IN_PROGRESS',
  };
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
    auctionSocketHelpers.offAllListeners();

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

    auctionSocketHelpers.onPlayerSold((data: any) => {
      set((state) => {
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

    auctionSocketHelpers.onTimerUpdate((data: { timeLeft: number }) => {
      set((state) => ({
        auctionState: state.auctionState
          ? { ...state.auctionState, timerEnd: Date.now() + data.timeLeft * 1000 }
          : null,
      }));
    });

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
          updates.teams = nextTeams.map(t =>
            t.id === data.team.id ? { ...t, ...data.team } : t
          );
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

    set({ isConnected: false });

    // join-room ACK로 초기 상태 수신 (auction-started를 놓친 경우 처리)
    let joinResponse = await auctionSocketHelpers.joinAuction(roomId);

    if (
      !joinResponse?.success &&
      (joinResponse?.error === "join_timeout" ||
        joinResponse?.error === "connect_timeout")
    ) {
      if (get().auctionState || get().teams.length > 0) {
        set({ isConnected: true, isLoading: false, error: null });
        return;
      }
      joinResponse = await auctionSocketHelpers.joinAuction(roomId);
    }

    if (joinResponse?.success) {
      let nextPlayers = Array.isArray(joinResponse.players) ? joinResponse.players : [];
      let nextTeams = Array.isArray(joinResponse.teams) ? joinResponse.teams : [];

      // Refresh fallback: if socket ACK misses payload, recover from room API.
      if ((nextTeams.length === 0 || nextPlayers.length === 0) && joinResponse.state) {
        try {
          const room = await roomApi.getRoom(roomId);
          const fallback = mapRoomFallbackData(room);
          if (nextTeams.length === 0) nextTeams = fallback.teams;
          if (nextPlayers.length === 0) nextPlayers = fallback.players;
        } catch {
          // Keep socket payload as-is when fallback fails.
        }
      }

      const nextState = normalizeAuctionState(joinResponse.state, nextPlayers);
      set({
        players: nextPlayers,
        teams: nextTeams,
        auctionState: nextState,
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

    // Re-join the socket.io room after reconnect to resume receiving events
    socket?.on('connect', async () => {
      set({ isConnected: true });
      const response = await auctionSocketHelpers.joinAuction(roomId);
      if (response?.success) {
        const currentState = get();
        // Prefer fresh server data; fall back to current state if server returns empty
        const nextPlayers = Array.isArray(response.players) && response.players.length > 0
          ? response.players
          : currentState.players;
        const nextTeams = Array.isArray(response.teams) && response.teams.length > 0
          ? response.teams
          : currentState.teams;
        // If server has no auction state (e.g. captain selection phase), keep existing
        const nextAuctionState = response.state
          ? normalizeAuctionState(response.state, nextPlayers)
          : currentState.auctionState;
        set({
          players: nextPlayers,
          teams: nextTeams,
          auctionState: nextAuctionState,
          isConnected: true,
          isLoading: false,
        });
      }
    });
    socket?.on('disconnect', () => set({ isConnected: false }));
  },

  disconnectFromAuction: () => {
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
      set({ error: msg });
      // Auto-clear bid error after 3 seconds
      setTimeout(() => {
        if (get().error === msg) set({ error: null });
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
