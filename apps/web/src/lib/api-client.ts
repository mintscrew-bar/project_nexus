import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getDdragonVersion } from "./ddragon";

// 보이지 않는 유니코드 문자 제거 (복사-붙여넣기 시 포함되는 bidirectional formatting 등)
const stripInvisibleChars = (str: string): string =>
  str.replace(/[\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g, "");

// Next.js rewrites를 사용하므로 상대 경로 사용
const API_BASE_URL = "/api";

// 토큰 저장소 (메모리 기반, 필요시 localStorage로 변경 가능)
let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
let refreshRetryBlockedUntil = 0;

const REFRESH_RETRY_COOLDOWN_MS = 30_000;
const AUTH_USER_STORAGE_KEY = "nexus_auth_user";
const AUTH_HINT_KEY = "nexus_session";

const isRefreshRetryBlocked = () => Date.now() < refreshRetryBlockedUntil;

const blockRefreshRetry = () => {
  refreshRetryBlockedUntil = Date.now() + REFRESH_RETRY_COOLDOWN_MS;
};

const createRefreshBlockedError = () => {
  const error = new Error("Token refresh is temporarily blocked") as Error & {
    response: { status: number };
  };
  error.response = { status: 429 };
  return error;
};

const shouldBlockRefreshRetry = (error: unknown) => {
  if (!axios.isAxiosError(error)) return true;
  const status = error.response?.status;
  return !status || status === 401 || status === 403 || status === 429;
};

// 리프레시 토큰까지 거부(401/403) = 현재 토큰으로는 인증 불가.
// 단, 게임 룸 재연결처럼 화면의 로그인 상태는 유지하고 네트워크 연결만 정리한다.
const isAuthUnavailableError = (error: unknown) => {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
};

function clearCachedAuthState() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
    localStorage.removeItem(AUTH_USER_STORAGE_KEY);
    localStorage.removeItem(AUTH_HINT_KEY);
  } catch {
    // best-effort
  }
}

// 회로차단기: refresh token이 401/403으로 거부되면 세션이 무효한 상태다.
// cached user와 상시 소켓을 같이 정리해 refresh/presence/socket 재시도 루프를 끊는다.
let authUnavailableHandled = false;
async function handleAuthUnavailable() {
  if (authUnavailableHandled) return;
  authUnavailableHandled = true;
  setAccessToken(null); // 토큰 정리 + proactive 예약 해제
  refreshPromise = null;
  clearCachedAuthState();

  try {
    const { disconnectAllSockets } = await import("./socket-client");
    disconnectAllSockets();
  } catch {
    // best-effort
  }

  try {
    const { useAuthStore } = await import("@/stores/auth-store");
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  } catch {
    // best-effort
  }
}

// ── Proactive refresh ──────────────────────────────────────
// access token(기본 15분)이 만료되기 전에 백그라운드에서 미리 갱신해
// 메모리 토큰이 항상 살아있게 한다.
// 단계 전환(로비 → 경매/드래프트 등)에서 새 namespace 소켓이 인증할 때
// 네트워크 왕복 없이 즉시 유효 토큰을 받게 되어 "전환 직후 연결 끊김"이 사라진다.
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const PROACTIVE_REFRESH_LEAD_MS = 60_000; // 만료 1분 전 갱신

const clearProactiveRefresh = () => {
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
};

// 토큰 exp를 디코드해 "만료 1분 전" 갱신을 예약한다.
const scheduleProactiveRefresh = (token: string) => {
  clearProactiveRefresh();
  if (typeof window === "undefined") return; // SSR에서는 예약하지 않음

  let delay: number;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    delay = payload.exp * 1000 - Date.now() - PROACTIVE_REFRESH_LEAD_MS;
  } catch {
    return; // 디코드 실패 시 예약 생략 (reactive refresh가 처리)
  }
  // 이미 만료 1분 이내면 거의 즉시 갱신
  if (delay < 1_000) delay = 1_000;

  proactiveRefreshTimer = setTimeout(() => void proactiveRefresh(), delay);
};

// 예약된 백그라운드 갱신 실행. 성공 시 setAccessToken이 다음 주기를 자동 재예약한다.
async function proactiveRefresh() {
  if (!accessToken) return; // 로그아웃됨 — 중단
  if (isRefreshRetryBlocked()) {
    // 쿨다운 중 — 쿨다운이 끝난 뒤 다시 시도
    proactiveRefreshTimer = setTimeout(
      () => void proactiveRefresh(),
      REFRESH_RETRY_COOLDOWN_MS,
    );
    return;
  }

  try {
    let newToken: string;
    if (refreshPromise) {
      newToken = await refreshPromise;
    } else {
      refreshPromise = refreshAccessToken();
      try {
        newToken = await refreshPromise;
      } finally {
        refreshPromise = null;
      }
    }
    setAccessToken(newToken); // 메모리 갱신 + 다음 주기 재예약
  } catch {
    // 인증 불가(401/403)는 refreshAccessToken 내부 회로차단기가 토큰만 정리한다.
    // 일시 오류면 쿨다운 후 재시도 (토큰이 아직 남아있을 때만).
    if (accessToken) {
      proactiveRefreshTimer = setTimeout(
        () => void proactiveRefresh(),
        REFRESH_RETRY_COOLDOWN_MS,
      );
    }
  }
}

export const setAccessToken = (token: string | null) => {
  accessToken = token;
  if (token) {
    refreshRetryBlockedUntil = 0;
    authUnavailableHandled = false; // 재인증 성공 시 회로차단기 리셋
    scheduleProactiveRefresh(token); // 만료 전 자동 갱신 예약
  } else {
    clearProactiveRefresh(); // 로그아웃 — 예약 정리
  }
};

export const getAccessToken = () => accessToken;

// 백그라운드 탭에서는 브라우저가 setTimeout을 throttle/freeze하므로 proactive 타이머가
// 늦게 뜰 수 있다. 탭이 다시 보이는 순간 토큰을 즉시 보충해, 오래 기다린 로비에서
// 돌아와 바로 "내전 시작"을 눌러도 세션이 항상 살아있도록 한다.
// (ensureValidToken은 만료 임박 시에만 갱신하고, 갱신되면 proactive 타이머도 재예약된다.)
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && accessToken) {
      void ensureValidToken();
    }
  });
}

// Axios 인스턴스 생성
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // 쿠키 전송 (refresh token)
  timeout: 15000, // 15초 — 연결 자체가 끊겼을 때 무한 hang 방지
  headers: {
    "Content-Type": "application/json",
  },
});

// 공개 API는 인증 토큰 주입/refresh 재시도와 분리한다.
// 비로그인 방 목록처럼 누구나 볼 수 있는 데이터가 세션 복구 실패에 휘말리지 않게 한다.
const publicApiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 요청 인터셉터: Access Token 추가
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터: 토큰 갱신 처리
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const requestUrl = originalRequest.url ?? "";

    // 401 에러이고, 아직 재시도하지 않은 경우
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !requestUrl.includes("/auth/refresh") &&
      !isRefreshRetryBlocked()
    ) {
      originalRequest._retry = true;

      try {
        // 이미 갱신 중인 요청이 있으면 대기
        if (refreshPromise) {
          const newToken = await refreshPromise;
          setAccessToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }

        // 토큰 갱신
        refreshPromise = refreshAccessToken();
        const newToken = await refreshPromise;
        refreshPromise = null;

        setAccessToken(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        return apiClient(originalRequest);
      } catch (refreshError) {
        // 갱신 실패 — 인증 상태만 초기화하고 리다이렉트는 하지 않음
        // (protected pages가 useAuthStore를 통해 자체적으로 /auth/login으로 리다이렉트함)
        setAccessToken(null);
        refreshPromise = null;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Access Token 갱신 함수
async function refreshAccessToken(): Promise<string> {
  if (isRefreshRetryBlocked()) {
    throw createRefreshBlockedError();
  }

  try {
    const response = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      {},
      {
        withCredentials: true,
      }
    );

    const { accessToken: newToken } = response.data;
    if (!newToken) {
      throw new Error("No access token in refresh response");
    }

    return newToken;
  } catch (error) {
    if (shouldBlockRefreshRetry(error)) {
      blockRefreshRetry();
    }
    // 리프레시 토큰 거부(401/403) → 연결만 정리하고 UI 로그인 상태는 유지
    if (isAuthUnavailableError(error)) {
      void handleAuthUnavailable();
    }
    throw error;
  }
}

// 소켓 인증용: JWT 만료 여부 확인 후 필요 시 갱신하여 유효한 토큰 반환
export async function ensureValidToken(minValidityMs = 30_000): Promise<string | null> {
  if (!accessToken) {
    if (authUnavailableHandled || isRefreshRetryBlocked()) return null;

    if (refreshPromise) {
      try {
        const newToken = await refreshPromise;
        setAccessToken(newToken);
        return newToken;
      } catch {
        return null;
      }
    }

    refreshPromise = refreshAccessToken();
    try {
      const newToken = await refreshPromise;
      setAccessToken(newToken);
      refreshPromise = null;
      return newToken;
    } catch {
      setAccessToken(null);
      refreshPromise = null;
      return null;
    }
  }

  try {
    // JWT payload 디코드 (서명 검증 없이 만료 시간만 확인)
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    const expiresAt = payload.exp * 1000;
    // 필요한 최소 유효시간을 만족하면 기존 토큰 사용
    if (Date.now() < expiresAt - minValidityMs) {
      return accessToken;
    }
  } catch {
    // 디코드 실패 시 갱신 시도
  }

  // 토큰이 만료됐거나 곧 만료되므로 갱신
  if (refreshPromise) {
    try {
      const newToken = await refreshPromise;
      setAccessToken(newToken);
      return newToken;
    } catch {
      return null;
    }
  }

  refreshPromise = refreshAccessToken();
  try {
    const newToken = await refreshPromise;
    setAccessToken(newToken);
    refreshPromise = null;
    return newToken;
  } catch {
    setAccessToken(null);
    refreshPromise = null;
    return null;
  }
}

// 인증 관련 API
export const authApi = {
  login: () => {
    // 동일 오리진 /api 경유 (next.config rewrites 통해 백엔드로 전달)
    // 환경변수 오설정으로 다른 도메인/포트로 튀는 문제를 방지
    window.location.href = "/api/auth/discord";
  },

  logout: async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // 순환 참조 방지: 동적 import로 socket-client 접근
      import("./socket-client").then(({ disconnectAllSockets }) => disconnectAllSockets()).catch(() => {});
      setAccessToken(null);
      // 리다이렉트는 호출자(auth-store)에서 처리 — 상태 정리가 먼저 완료되도록
    }
  },

  getMe: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data;
  },

  // 세션 초기화: refresh token으로 access token을 먼저 얻은 뒤 /auth/me 조회
  // 이렇게 하면 /auth/me 호출 시 401이 발생하지 않음
  initSession: async () => {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken();
    }
    const newToken = await refreshPromise.finally(() => {
      refreshPromise = null;
    });
    setAccessToken(newToken);
    const meResponse = await apiClient.get("/auth/me");
    return meResponse.data;
  },

  signup: async (data: {
    email: string;
    password: string;
    username: string;
    agreedToTerms: boolean;
    agreedToPrivacy: boolean;
  }) => {
    const response = await apiClient.post("/auth/signup", data);
    return response.data;
  },

  emailLogin: async (data: { email: string; password: string }) => {
    const response = await apiClient.post("/auth/login", data);
    return response.data;
  },

  googleLogin: () => {
    window.location.href = "/api/auth/google";
  },

  /**
   * 신규 OAuth 가입자 약관 동의 처리
   * @param token - /auth/agree?token=... 쿼리 파라미터의 임시 토큰
   */
  agreeToTerms: async (
    token: string,
    dto: {
      termsOfService: boolean;
      privacyPolicy: boolean;
      ageVerification: boolean;
      marketingConsent?: boolean;
    },
  ): Promise<{ accessToken: string }> => {
    const response = await apiClient.post(`/auth/agree?token=${token}`, dto);
    return response.data;
  },
};

// 유저 관련 API
export type StreamerPlatform = "CHZZK" | "SOOP" | "YOUTUBE";

export interface StreamerProfile {
  id?: string;
  userId?: string;
  platform: StreamerPlatform;
  channelUrl: string;
  channelName: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StreamerLink {
  id: string;
  userId?: string;
  label: string;
  url: string;
  imageUrl: string | null;
  order: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const userApi = {
  getProfile: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}`);
    return response.data;
  },

  updateProfile: async (data: { username?: string; bio?: string }) => {
    const response = await apiClient.patch("/users/me", data);
    return response.data;
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append("avatar", file);
    const response = await apiClient.post("/users/me/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  syncDiscordAvatar: async () => {
    const response = await apiClient.post("/users/me/avatar/sync-discord");
    return response.data as { avatarUrl: string };
  },

  getStreamerProfiles: async () => {
    const response = await apiClient.get("/users/me/streamer-profiles");
    return response.data as StreamerProfile[];
  },

  upsertStreamerProfile: async (data: {
    platform: StreamerPlatform;
    channelUrl: string;
    channelName?: string;
  }) => {
    const response = await apiClient.put("/users/me/streamer-profile", data);
    return response.data as StreamerProfile;
  },

  deleteStreamerProfile: async (platform: StreamerPlatform) => {
    const response = await apiClient.delete(
      `/users/me/streamer-profile/${platform}`,
    );
    return response.data as { success: boolean };
  },

  getStreamerLinks: async () => {
    const response = await apiClient.get("/users/me/streamer-links");
    return response.data as StreamerLink[];
  },

  createStreamerLink: async (data: {
    label: string;
    url: string;
    order?: number;
  }) => {
    const response = await apiClient.post("/users/me/streamer-links", data);
    return response.data as StreamerLink;
  },

  updateStreamerLink: async (
    linkId: string,
    data: { label: string; url: string; order?: number },
  ) => {
    const response = await apiClient.patch(
      `/users/me/streamer-links/${linkId}`,
      data,
    );
    return response.data as StreamerLink;
  },

  uploadStreamerLinkImage: async (linkId: string, file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    const response = await apiClient.post(
      `/users/me/streamer-links/${linkId}/image`,
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response.data as StreamerLink;
  },

  deleteStreamerLink: async (linkId: string) => {
    const response = await apiClient.delete(`/users/me/streamer-links/${linkId}`);
    return response.data as { success: boolean };
  },

  getStats: async () => {
    const response = await apiClient.get("/users/stats");
    return response.data;
  },

  getUserStats: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}/stats`);
    return response.data;
  },

  getHoverProfile: async (userId: string): Promise<{
    username: string;
    avatar: string | null;
    riotAccount: {
      gameName: string;
      tagLine: string;
      tier: string;
      rank: string;
      lp: number;
      peakTier: string | null;
      peakRank: string | null;
      peakLp: number | null;
      mainRole: string | null;
      subRole: string | null;
      championPreferences: { role: string; championId: string; order: number }[];
    } | null;
    clan: { name: string; tag: string | null } | null;
    streamerProfiles: Pick<StreamerProfile, "platform" | "channelUrl" | "channelName" | "isActive">[];
    streamerLinks: Pick<StreamerLink, "id" | "label" | "url" | "imageUrl" | "order" | "isActive">[];
    stats: { wins: number; losses: number; winRate: number };
    kda: { kills: number; deaths: number; assists: number; games: number } | null;
    reputation: { overallAverage: number; totalRatings: number };
  }> => {
    const response = await apiClient.get(`/users/${userId}/hover-profile`);
    return response.data;
  },

  getSettings: async () => {
    const response = await apiClient.get("/users/settings");
    return response.data;
  },

  updateSettings: async (data: {
    notifyFriendRequest?: boolean;
    notifyFriendAccepted?: boolean;
    notifyMatchStart?: boolean;
    notifyMatchResult?: boolean;
    notifyTeamInvite?: boolean;
    notifyMention?: boolean;
    notifyComment?: boolean;
    notifyClanActivity?: boolean;
    notifySystem?: boolean;
    showOnlineStatus?: boolean;
    showRiotAccounts?: boolean;
    showChampionStats?: boolean;
    allowFriendRequests?: boolean;
    highlightChampionId?: string | null;
    highlightStatType?: string | null;
    theme?: string;
  }) => {
    const response = await apiClient.patch("/users/settings", data);
    return response.data;
  },

  /**
   * 회원 탈퇴: DELETE /users/me 호출
   * 성공 시 서버에서 204 No Content 반환
   */
  deleteAccount: async () => {
    await apiClient.delete("/users/me");
  },
};

// 방 관련 API
export const roomApi = {
  getRooms: async (params?: {
    mode?: string;
    status?: string;
    maxSize?: number;
  }) => {
    const response = await publicApiClient.get("/rooms", { params });
    return response.data;
  },

  getRoom: async (roomId: string) => {
    const response = await publicApiClient.get(`/rooms/${roomId}`);
    return response.data;
  },

  createRoom: async (data: {
    name: string;
    maxParticipants: number;
    teamMode: "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
    password?: string;
    allowSpectators?: boolean;
    discordGuildId?: string;
    startingPoints?: number;
    minBidIncrement?: number;
    bidTimeLimit?: number;
    pickTimeLimit?: number;
    captainSelection?: "RANDOM" | "TIER" | "MANUAL" | "VOLUNTEER";
    bracketFormat?: string;
  }) => {
    const response = await apiClient.post("/rooms", data);
    return response.data;
  },
  
  update: async (roomId: string, data: any) => {
    const response = await apiClient.put(`/rooms/${roomId}`, data);
    return response.data;
  },

  joinRoom: async (
    roomId: string,
    password?: string,
    asSpectator?: boolean,
  ) => {
    const response = await apiClient.post(`/rooms/${roomId}/join`, {
      password,
      asSpectator,
    });
    return response.data;
  },

  leaveRoom: async (roomId: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/leave`);
    return response.data;
  },

  toggleSpectator: async (roomId: string) => {
    const response = await apiClient.post(
      `/rooms/${roomId}/toggle-spectator`,
    );
    return response.data;
  },

  toggleReady: async (roomId: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/ready`);
    return response.data;
  },

  kick: async (roomId: string, participantId: string) => {
    const response = await apiClient.delete(`/rooms/${roomId}/participants/${participantId}`);
    return response.data;
  },

  deleteRoom: async (roomId: string) => {
    const response = await apiClient.delete(`/rooms/${roomId}`);
    return response.data;
  },

  abortToLobby: async (roomId: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/abort-to-lobby`);
    return response.data;
  },

  // 토너먼트 완료 후 로비 복귀 (COMPLETED -> WAITING 리셋)
  returnToLobby: async (roomId: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/return-to-lobby`);
    return response.data;
  },

  getChatMessages: async (roomId: string, limit = 50, offset = 0) => {
    const response = await apiClient.get(`/rooms/${roomId}/messages`, {
      params: { limit, offset },
    });
    return response.data;
  },
};

// 경매 관련 API
export const auctionApi = {
  startAuction: async (roomId: string) => {
    const response = await apiClient.post(`/auctions/${roomId}/start`);
    return response.data;
  },

  getAuctionState: async (roomId: string) => {
    const response = await apiClient.get(`/auctions/${roomId}/state`);
    return response.data;
  },
};

// Snake Draft 관련 API
export const snakeDraftApi = {
  startDraft: async (roomId: string, captainSelection: "RANDOM" | "TIER") => {
    const response = await apiClient.post(`/rooms/${roomId}/snake-draft/start`, {
      captainSelection,
    });
    return response.data;
  },

  makePick: async (roomId: string, targetPlayerId: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/snake-draft/pick`, {
      targetPlayerId,
    });
    return response.data;
  },

  getDraftState: async (roomId: string) => {
    const response = await apiClient.get(`/rooms/${roomId}/snake-draft/state`);
    return response.data;
  },
};

// 매치/토너먼트 관련 API
export const matchApi = {
  getUserMatches: async (params?: { status?: string; limit?: number; offset?: number }) => {
    const response = await apiClient.get("/matches/my", { params });
    return response.data;
  },

  generateBracket: async (roomId: string) => {
    const response = await apiClient.post(`/matches/bracket/${roomId}`);
    return response.data;
  },

  getBracket: async (roomId: string) => {
    const response = await apiClient.get(`/matches/bracket/${roomId}`);
    return response.data;
  },

  getMatch: async (matchId: string) => {
    const response = await apiClient.get(`/matches/${matchId}/details`);
    return response.data;
  },

  startMatch: async (matchId: string) => {
    const response = await apiClient.post(`/matches/${matchId}/start`);
    return response.data;
  },

  generateTournamentCode: async (matchId: string) => {
    const response = await apiClient.post(`/matches/${matchId}/tournament-code`);
    return response.data;
  },

  reportResult: async (
    matchId: string,
    data: { winnerId: string; statsJson?: any }
  ) => {
    const response = await apiClient.post(`/matches/${matchId}/result`, data);
    return response.data;
  },

  getLiveStatus: async (matchId: string) => {
    const response = await apiClient.get(`/matches/${matchId}/live-status`);
    return response.data;
  },

  getUserMatchHistory: async (userId: string, limit: number = 20, offset: number = 0) => {
    const response = await apiClient.get(`/matches/user/${userId}/history`, {
      params: { limit, offset },
    });
    return response.data;
  },

  submitVote: async (matchId: string, data: { votedForId: string; voteType: 'MVP' | 'ACE' }) => {
    const response = await apiClient.post(`/matches/${matchId}/vote`, data);
    return response.data;
  },

  getMatchVotes: async (matchId: string) => {
    const response = await apiClient.get(`/matches/${matchId}/votes`);
    return response.data;
  },
};

// Riot API 관련 API
export const discordApi = {
  // "내 디스코드 서버에 봇 추가" OAuth 설치 URL 발급
  getGuildInstallUrl: async (): Promise<{ url: string }> => {
    const response = await apiClient.get("/discord/guild-link/install-url");
    return response.data;
  },

  getMyGuildLinks: async (): Promise<{
    home: { guildId: string | null; guildName: string };
    guilds: Array<{
      guildId: string;
      guildName: string | null;
      status: "PENDING" | "ACTIVE" | "DISABLED";
      activatedAt: string | null;
      createdAt: string;
    }>;
  }> => {
    const response = await apiClient.get("/discord/guild-links/me");
    return response.data;
  },
};

export const riotApi = {
  // 챔피언 목록 조회 (Data Dragon) — 백엔드 /stats/ddragon-version 으로 최신 패치 자동 추적
  getChampions: async () => {
    const version = await getDdragonVersion();
    const response = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`
    );
    const data = await response.json();
    return { data: data.data, version: data.version };
  },

  getItems: async (locale: string = "ko_KR") => {
    const response = await apiClient.get("/riot/ddragon/items", {
      params: { locale },
    });
    return response.data;
  },

  // 인증 시작
  startVerification: async (gameName: string, tagLine: string) => {
    const response = await apiClient.post("/riot/verify/start", { gameName, tagLine });
    return response.data;
  },

  // 인증 확인
  checkVerification: async () => {
    const response = await apiClient.get("/riot/verify/check");
    return response.data;
  },

  // 계정 등록
  registerAccount: async (data: any) => {
    const response = await apiClient.post("/riot/register", data);
    return response.data;
  },

  // 계정 목록 조회
  getAccounts: async () => {
    const response = await apiClient.get("/riot/accounts");
    return response.data;
  },

  // 티어 동기화
  syncAccount: async (accountId: string) => {
    const response = await apiClient.post(`/riot/accounts/${accountId}/sync`);
    return response.data;
  },

  // 대표 계정 설정
  setPrimaryAccount: async (accountId: string) => {
    const response = await apiClient.put(`/riot/accounts/${accountId}/primary`);
    return response.data;
  },

  // 챔피언 선호도 업데이트
  updateChampions: async (accountId: string, role: string, championIds: string[]) => {
    const response = await apiClient.put(`/riot/accounts/${accountId}/champions/${role}`, {
      championIds,
    });
    return response.data;
  },

  // 계정 정보 수정 (역할, 챔피언)
  updateAccount: async (accountId: string, data: {
    mainRole: string;
    subRole: string;
    championsByRole?: Record<string, string[]>;
    peakTier?: string;
    peakRank?: string;
    peakLp?: number;
  }) => {
    const response = await apiClient.put(`/riot/accounts/${accountId}`, data);
    return response.data;
  },

  // 계정 삭제
  deleteAccount: async (accountId: string) => {
    await apiClient.delete(`/riot/accounts/${accountId}`);
  },

  // 소환사 정보 조회
  getSummoner: async (gameName: string, tagLine: string) => {
    const response = await apiClient.get(`/riot/summoner/${encodeURIComponent(stripInvisibleChars(gameName))}/${encodeURIComponent(stripInvisibleChars(tagLine))}`);
    return response.data;
  },

  // 라이브 게임 조회 (Spectator-V5)
  getLiveGame: async (gameName: string, tagLine: string) => {
    const response = await apiClient.get(
      `/riot/summoner/${encodeURIComponent(stripInvisibleChars(gameName))}/${encodeURIComponent(stripInvisibleChars(tagLine))}/live`
    );
    return response.data as { isLive: boolean; gameInfo?: any };
  },

  // 챔피언 숙련도 조회 (champion-mastery-v4)
  getSummonerMastery: async (gameName: string, tagLine: string) => {
    const response = await apiClient.get(
      `/riot/summoner/${encodeURIComponent(stripInvisibleChars(gameName))}/${encodeURIComponent(stripInvisibleChars(tagLine))}/mastery`
    );
    return response.data as Array<{
      championId: number;
      championPoints: number;
      championLevel: number;
    }>;
  },
};

// 클랜 관련 API
export const clanApi = {
  getClans: async (params?: {
    search?: string;
    isRecruiting?: boolean;
    minTier?: string;
    sort?: string;
  }) => {
    const response = await apiClient.get("/clans", { params });
    return response.data;
  },

  getClan: async (clanId: string) => {
    const response = await apiClient.get(`/clans/${clanId}`);
    return response.data;
  },

  getMyClan: async () => {
    const response = await apiClient.get("/clans/my");
    return response.data;
  },

  createClan: async (data: {
    name: string;
    tag: string;
    description?: string;
    isRecruiting?: boolean;
  }) => {
    const response = await apiClient.post("/clans", data);
    return response.data;
  },

  updateClan: async (
    clanId: string,
    data: {
      name?: string;
      description?: string;
      isRecruiting?: boolean;
      maxMembers?: number;
      minTier?: string;
      discord?: string;
      officerCanManageSettings?: boolean;
      officerCanManageMembers?: boolean;
      officerCanManageAnnouncements?: boolean;
      officerCanManageInvitations?: boolean;
    }
  ) => {
    const response = await apiClient.patch(`/clans/${clanId}`, data);
    return response.data;
  },

  deleteClan: async (clanId: string) => {
    const response = await apiClient.delete(`/clans/${clanId}`);
    return response.data;
  },

  joinClan: async (clanId: string) => {
    const response = await apiClient.post(`/clans/${clanId}/join`);
    return response.data;
  },

  leaveClan: async (clanId: string) => {
    const response = await apiClient.post(`/clans/${clanId}/leave`);
    return response.data;
  },

  kickMember: async (clanId: string, userId: string) => {
    // 컨트롤러: DELETE /clans/:id/members/:memberId
    const response = await apiClient.delete(`/clans/${clanId}/members/${userId}`);
    return response.data;
  },

  updateMemberRole: async (
    clanId: string,
    userId: string,
    role: "OWNER" | "OFFICER" | "MEMBER"
  ) => {
    const response = await apiClient.patch(`/clans/${clanId}/members/${userId}/role`, {
      role,
    });
    return response.data;
  },

  transferOwnership: async (clanId: string, newOwnerId: string) => {
    // 컨트롤러: POST /clans/:id/transfer-ownership
    const response = await apiClient.post(`/clans/${clanId}/transfer-ownership`, {
      newOwnerId,
    });
    return response.data;
  },

  // cursor 기반 페이지네이션으로 변경
  getChatMessages: async (clanId: string, cursor?: string, limit = 50) => {
    const response = await apiClient.get(`/clans/${clanId}/messages`, {
      params: { cursor, limit },
    });
    return response.data as { messages: any[]; nextCursor: string | null };
  },

  deleteChatMessage: async (clanId: string, messageId: string) => {
    const response = await apiClient.delete(
      `/clans/${clanId}/messages/${messageId}`,
    );
    return response.data;
  },

  // 공지사항
  getAnnouncements: async (clanId: string) => {
    const response = await apiClient.get(`/clans/${clanId}/announcements`);
    return response.data;
  },

  createAnnouncement: async (clanId: string, content: string) => {
    const response = await apiClient.post(`/clans/${clanId}/announcements`, {
      content,
    });
    return response.data;
  },

  deleteAnnouncement: async (clanId: string, announcementId: string) => {
    const response = await apiClient.delete(
      `/clans/${clanId}/announcements/${announcementId}`,
    );
    return response.data;
  },

  unpinAnnouncement: async (clanId: string, announcementId: string) => {
    const response = await apiClient.patch(
      `/clans/${clanId}/announcements/${announcementId}/unpin`,
      {},
    );
    return response.data;
  },

  // 초대/가입 요청
  inviteUser: async (clanId: string, inviteeId: string) => {
    const response = await apiClient.post(`/clans/${clanId}/invite`, {
      inviteeId,
    });
    return response.data;
  },

  getSentInvitations: async (clanId: string) => {
    const response = await apiClient.get(`/clans/${clanId}/invitations/sent`);
    return response.data;
  },

  cancelInvitation: async (clanId: string, invitationId: string) => {
    const response = await apiClient.delete(
      `/clans/${clanId}/invitations/${invitationId}`,
    );
    return response.data;
  },

  generateInviteCode: async (clanId: string) => {
    const response = await apiClient.post(`/clans/${clanId}/invite-code`);
    return response.data as { code: string; expiresAt: string };
  },

  requestToJoin: async (clanId: string) => {
    const response = await apiClient.post(`/clans/${clanId}/request-join`);
    return response.data;
  },

  joinByCode: async (code: string) => {
    const response = await apiClient.post("/clans/join-by-code", { code });
    return response.data;
  },

  getMyInvitations: async () => {
    const response = await apiClient.get("/clans/invitations/my");
    return response.data;
  },

  resolveInvitation: async (invitationId: string, accept: boolean) => {
    const response = await apiClient.post(
      `/clans/invitations/${invitationId}/resolve`,
      { accept },
    );
    return response.data;
  },

  getPendingJoinRequests: async (clanId: string) => {
    const response = await apiClient.get(`/clans/${clanId}/join-requests`);
    return response.data;
  },

  resolveJoinRequest: async (
    clanId: string,
    requestId: string,
    accept: boolean,
  ) => {
    const response = await apiClient.post(
      `/clans/${clanId}/join-requests/${requestId}/resolve`,
      { accept },
    );
    return response.data;
  },

  // 활동 로그
  getActivityLogs: async (clanId: string, cursor?: string, limit = 20) => {
    const response = await apiClient.get(`/clans/${clanId}/activity-logs`, {
      params: { cursor, limit },
    });
    return response.data as { logs: any[]; nextCursor: string | null };
  },

  // 통계
  getClanStats: async (clanId: string) => {
    const response = await apiClient.get(`/clans/${clanId}/stats`);
    return response.data;
  },
};

// 커뮤니티 관련 API
export const communityApi = {
  getPosts: async (params?: {
    category?: string;
    boardId?: string;
    boardSlug?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    search?: string;
    tag?: string; // 태그 필터
  }) => {
    const response = await apiClient.get("/community/posts", { params });
    return response.data;
  },

  getPost: async (postId: string) => {
    const response = await apiClient.get(`/community/posts/${postId}`);
    return response.data;
  },

  createPost: async (data: {
    title: string;
    content: string;
    boardId?: string;
    category?: "NOTICE" | "FREE" | "TIP" | "QNA";
    tags?: string[];
  }) => {
    const response = await apiClient.post("/community/posts", data);
    return response.data;
  },

  updatePost: async (
    postId: string,
    data: { title?: string; content?: string; tags?: string[] }
  ) => {
    const response = await apiClient.patch(`/community/posts/${postId}`, data);
    return response.data;
  },

  getPopularTags: async (limit = 20): Promise<{ name: string; count: number }[]> => {
    const response = await apiClient.get("/community/tags/popular", { params: { limit } });
    return response.data;
  },

  // 게시글 본문 이미지 업로드 → { url } 반환
  uploadImage: async (file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append("image", file);
    const response = await apiClient.post("/community/images", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  deletePost: async (postId: string) => {
    const response = await apiClient.delete(`/community/posts/${postId}`);
    return response.data;
  },

  togglePin: async (postId: string) => {
    const response = await apiClient.post(`/community/posts/${postId}/pin`);
    return response.data;
  },

  createComment: async (postId: string, data: { content: string; parentId?: string }) => {
    const response = await apiClient.post(`/community/posts/${postId}/comments`, data);
    return response.data;
  },

  updateComment: async (commentId: string, content: string) => {
    const response = await apiClient.patch(`/community/comments/${commentId}`, {
      content,
    });
    return response.data;
  },

  deleteComment: async (commentId: string) => {
    const response = await apiClient.delete(`/community/comments/${commentId}`);
    return response.data;
  },

  likePost: async (postId: string) => {
    const response = await apiClient.post(`/community/posts/${postId}/like`);
    return response.data;
  },

  unlikePost: async (postId: string) => {
    const response = await apiClient.delete(`/community/posts/${postId}/like`);
    return response.data;
  },

  hasLikedPost: async (postId: string) => {
    const response = await apiClient.get(`/community/posts/${postId}/liked`);
    return response.data;
  },

  getCommentLikedStatus: async (commentIds: string[]): Promise<Record<string, boolean>> => {
    const response = await apiClient.post("/community/comments/liked-status", { commentIds });
    return response.data;
  },

  likeComment: async (commentId: string) => {
    const response = await apiClient.post(`/community/comments/${commentId}/like`);
    return response.data;
  },

  unlikeComment: async (commentId: string) => {
    const response = await apiClient.delete(`/community/comments/${commentId}/like`);
    return response.data;
  },

  hasLikedComment: async (commentId: string) => {
    const response = await apiClient.get(`/community/comments/${commentId}/liked`);
    return response.data;
  },

  bookmarkPost: async (postId: string) => {
    const response = await apiClient.post(`/community/posts/${postId}/bookmark`);
    return response.data;
  },

  unbookmarkPost: async (postId: string) => {
    const response = await apiClient.delete(`/community/posts/${postId}/bookmark`);
    return response.data;
  },

  hasBookmarkedPost: async (postId: string) => {
    const response = await apiClient.get(`/community/posts/${postId}/bookmarked`);
    return response.data;
  },

  getBookmarks: async (limit = 20, offset = 0) => {
    const response = await apiClient.get("/community/bookmarks", { params: { limit, offset } });
    return response.data;
  },

  reportPost: async (postId: string, data: { reason: string; description: string }) => {
    const response = await apiClient.post("/community/reports", { postId, ...data });
    return response.data;
  },

  reportComment: async (commentId: string, data: { reason: string; description: string }) => {
    const response = await apiClient.post("/community/reports", { commentId, ...data });
    return response.data;
  },
};

// 게시판(Board) 타입
export interface Board {
  id: string;
  slug: string;
  name: string;
  fullName: string | null;
  description: string | null;
  iconName: string | null;
  color: string | null;
  order: number;
  isActive: boolean;
  isHidden: boolean;
  writeRole: "USER" | "MODERATOR" | "ADMIN" | null;
  createdAt: string;
  updatedAt: string;
  _count?: { posts: number };
}

export interface BoardInput {
  name: string;
  slug?: string;
  fullName?: string | null;
  description?: string | null;
  iconName?: string | null;
  color?: string | null;
  order?: number;
  writeRole?: "USER" | "MODERATOR" | "ADMIN" | null;
  isActive?: boolean;
  isHidden?: boolean;
}

// 게시판 API
export const boardApi = {
  // 공개: 활성 게시판 목록
  list: async (): Promise<Board[]> => {
    const response = await apiClient.get("/boards");
    return response.data;
  },
  // 관리자: 전체 목록 (숨김/비활성 포함, 글 수 포함)
  listForAdmin: async (): Promise<Board[]> => {
    const response = await apiClient.get("/boards/admin");
    return response.data;
  },
  create: async (data: BoardInput): Promise<Board> => {
    const response = await apiClient.post("/boards", data);
    return response.data;
  },
  update: async (id: string, data: Partial<BoardInput>): Promise<Board> => {
    const response = await apiClient.patch(`/boards/${id}`, data);
    return response.data;
  },
  remove: async (id: string) => {
    const response = await apiClient.delete(`/boards/${id}`);
    return response.data;
  },
  reorder: async (items: Array<{ id: string; order: number }>) => {
    const response = await apiClient.patch("/boards/admin/reorder", { items });
    return response.data;
  },
};

// 평판/신고 관련 API
export const reputationApi = {
  rateUser: async (data: {
    targetUserId: string;
    matchId: string;
    skillRating: number;
    attitudeRating: number;
    communicationRating: number;
    comment?: string;
  }) => {
    const response = await apiClient.post("/reputation/ratings", data);
    return response.data;
  },

  getUserRatings: async (userId: string, limit = 10) => {
    const response = await apiClient.get(`/reputation/users/${userId}/ratings`, {
      params: { limit },
    });
    return response.data;
  },

  getUserStats: async (userId: string): Promise<{
    totalRatings: number;
    averageSkill: number;
    averageAttitude: number;
    averageCommunication: number;
    overallAverage: number;
  }> => {
    const response = await apiClient.get(`/reputation/users/${userId}/stats`);
    return response.data;
  },

  reportUser: async (data: {
    targetUserId: string;
    matchId?: string;
    /** 클랜 채팅 메시지 신고 시 메시지 ID */
    clanChatMessageId?: string;
    reason: "TOXICITY" | "AFK" | "GRIEFING" | "CHEATING" | "OTHER";
    description: string;
  }) => {
    const response = await apiClient.post("/reputation/reports", data);
    return response.data;
  },

  getMyReports: async (limit = 10, offset = 0) => {
    const response = await apiClient.get("/reputation/my-reports", {
      params: { limit, offset },
    });
    return response.data;
  },

  getReportsAgainstMe: async (limit = 10, offset = 0) => {
    const response = await apiClient.get("/reputation/reports-against-me", {
      params: { limit, offset },
    });
    return response.data;
  },

  getPendingReports: async (limit = 20, offset = 0) => {
    const response = await apiClient.get("/reputation/admin/reports", {
      params: { limit, offset },
    });
    return response.data;
  },

  reviewReport: async (
    reportId: string,
    data: { status: "APPROVED" | "REJECTED"; reviewNotes?: string }
  ) => {
    const response = await apiClient.post(`/reputation/admin/reports/${reportId}/review`, data);
    return response.data;
  },

  banUser: async (data: {
    userId: string;
    reason: string;
    duration?: number;
    isPermanent?: boolean;
  }) => {
    const response = await apiClient.post("/reputation/admin/ban", data);
    return response.data;
  },

  unbanUser: async (userId: string) => {
    const response = await apiClient.post(`/reputation/admin/unban/${userId}`);
    return response.data;
  },
};

// 친구 관련 API
export const friendApi = {
  getFriends: async () => {
    const response = await apiClient.get("/friends");
    return response.data;
  },

  getPendingRequests: async () => {
    const response = await apiClient.get("/friends/requests/pending");
    return response.data;
  },

  getSentRequests: async () => {
    const response = await apiClient.get("/friends/requests/sent");
    return response.data;
  },

  sendRequest: async (targetUserId: string) => {
    const response = await apiClient.post(`/friends/requests/${targetUserId}`);
    return response.data;
  },

  acceptRequest: async (friendshipId: string) => {
    const response = await apiClient.post(`/friends/requests/${friendshipId}/accept`);
    return response.data;
  },

  rejectRequest: async (friendshipId: string) => {
    const response = await apiClient.post(`/friends/requests/${friendshipId}/reject`);
    return response.data;
  },

  cancelRequest: async (friendshipId: string) => {
    const response = await apiClient.delete(`/friends/requests/${friendshipId}`);
    return response.data;
  },

  removeFriend: async (friendId: string) => {
    const response = await apiClient.delete(`/friends/${friendId}`);
    return response.data;
  },

  blockUser: async (targetUserId: string) => {
    const response = await apiClient.post(`/friends/block/${targetUserId}`);
    return response.data;
  },

  unblockUser: async (targetUserId: string) => {
    const response = await apiClient.delete(`/friends/block/${targetUserId}`);
    return response.data;
  },

  getBlockedUsers: async () => {
    const response = await apiClient.get("/friends/blocked");
    return response.data;
  },

  getFriendshipStatus: async (targetUserId: string) => {
    const response = await apiClient.get(`/friends/status/${targetUserId}`);
    return response.data;
  },

  getStats: async () => {
    const response = await apiClient.get("/friends/stats");
    return response.data;
  },
};

// 온라인 상태 관련 API
export const presenceApi = {
  getMyStatus: async () => {
    const response = await apiClient.get("/presence/me");
    return response.data;
  },

  updateMyStatus: async (status: "ONLINE" | "AWAY") => {
    const response = await apiClient.put("/presence/me", { status });
    return response.data;
  },

  getUserStatus: async (userId: string) => {
    const response = await apiClient.get(`/presence/user/${userId}`);
    return response.data;
  },

  getFriendsStatuses: async () => {
    const response = await apiClient.get("/presence/friends");
    return response.data;
  },
};

// 알림 관련 API
export const notificationApi = {
  getNotifications: async (limit = 20, offset = 0) => {
    const response = await apiClient.get("/notifications", {
      params: { limit, offset },
    });
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await apiClient.get("/notifications/unread-count");
    return response.data;
  },

  markAsRead: async (notificationId: string) => {
    const response = await apiClient.post(`/notifications/${notificationId}/read`);
    return response.data;
  },

  markAllAsRead: async () => {
    const response = await apiClient.post("/notifications/read-all");
    return response.data;
  },

  deleteNotification: async (notificationId: string) => {
    const response = await apiClient.delete(`/notifications/${notificationId}`);
    return response.data;
  },

  deleteAllRead: async () => {
    const response = await apiClient.delete("/notifications/read/all");
    return response.data;
  },
};

// 전적 통계 관련 API
export const statsApi = {
  getLabOverview: async () => {
    const response = await apiClient.get("/stats/lab/overview");
    return response.data;
  },

  getLabMetaRadar: async (period: "30d" | "90d" | "all" = "30d") => {
    const response = await apiClient.get("/stats/lab/meta/radar", {
      params: { period },
    });
    return response.data;
  },

  getLabPatchImpact: async () => {
    const response = await apiClient.get("/stats/lab/meta/patch-impact");
    return response.data;
  },

  getLabBanRates: async (period: "30d" | "90d" | "all" = "30d") => {
    const response = await apiClient.get("/stats/lab/meta/ban-rates", {
      params: { period },
    });
    return response.data;
  },

  getLabChampionDetail: async (
    championId: number,
    period: "30d" | "90d" | "all" = "30d",
    source: "custom" | "ranked-community" | "ranked-meta" = "custom",
  ) => {
    const response = await apiClient.get(
      `/stats/lab/champions/${championId}`,
      { params: { period, source } },
    );
    return response.data;
  },

  getLabChampions: async (params?: {
    period?: "30d" | "90d" | "all";
    position?: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";
    includeLowSample?: boolean;
    source?: "custom" | "ranked-community" | "ranked-meta";
  }) => {
    const response = await apiClient.get("/stats/lab/champions", {
      params,
    });
    return response.data;
  },

  getLabChampionMastery: async (
    championId: number,
    source: "custom" | "ranked-community" | "ranked-meta" = "custom",
  ) => {
    const response = await apiClient.get(
      `/stats/lab/champions/${championId}/mastery`,
      { params: { source } },
    );
    return response.data;
  },

  getLabSynergy: async (params?: {
    period?: "30d" | "90d" | "all";
    championId?: number;
    limit?: number;
    source?: "custom" | "ranked-community" | "all";
  }) => {
    const response = await apiClient.get("/stats/lab/synergy", { params });
    return response.data;
  },

  getLabCounter: async (params?: {
    period?: "30d" | "90d" | "all";
    championId?: number;
    vsChampionId?: number;
    position?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get("/stats/lab/counter", { params });
    return response.data;
  },

  getLabCompositions: async (params?: {
    period?: "30d" | "90d" | "all";
    source?: "custom" | "ranked-community" | "all";
  }) => {
    const response = await apiClient.get("/stats/lab/compositions", { params });
    return response.data;
  },

  getLabAuctionEfficiency: async (params?: { period?: "30d" | "90d" | "all" }) => {
    const response = await apiClient.get("/stats/lab/oracle/auction-efficiency", {
      params,
    });
    return response.data;
  },

  getLabBalanceScore: async (data: { teamA: string[]; teamB: string[] }) => {
    const response = await apiClient.post("/stats/lab/oracle/balance-score", data);
    return response.data;
  },

  getLabBanRecommend: async (params: {
    period?: "30d" | "90d" | "all";
    userIds?: string[];
    teamAUserIds?: string[];
    teamBUserIds?: string[];
  }) => {
    const query = {
      period: params.period,
      userIds: params.userIds?.join(","),
      teamAUserIds: params.teamAUserIds?.join(","),
      teamBUserIds: params.teamBUserIds?.join(","),
    };
    const response = await apiClient.get("/stats/lab/oracle/ban-recommend", {
      params: query,
    });
    return response.data;
  },

  // Task 37: 유저 간 직접 대전 상성
  getLabHeadToHead: async (userAId: string, userBId: string) => {
    const response = await apiClient.get("/stats/lab/oracle/head-to-head", {
      params: { userAId, userBId },
    });
    return response.data;
  },

  // Task 38: 시간대별/요일별 패턴
  getLabPlayPatterns: async (period: "30d" | "90d" | "all" = "30d") => {
    const response = await apiClient.get("/stats/lab/meta/play-patterns", {
      params: { period },
    });
    return response.data;
  },

  // Task 39: 외부 고티어 랭크 메타 챔피언 스냅샷
  getLabRankedSnapshots: async (params?: {
    period?: "7d" | "30d" | "current_patch";
    position?: string;
  }) => {
    const response = await apiClient.get("/stats/lab/meta/ranked-snapshots", {
      params,
    });
    return response.data;
  },

  // 랩 데이터 단계 (등록 유저 누구나 조회 가능)
  getLabDataPhase: async () => {
    const response = await apiClient.get("/stats/lab/data-phase");
    return response.data as {
      phase: number;
      totalMatches: number;
      nextPhaseThreshold: number | null;
      remainingUntilNextPhase: number | null;
      snapshotLastComputedAt: string | null;
    };
  },

  getChampionStats: async (
    gameName: string,
    tagLine: string,
    queueGroup: "ranked" | "normal" | "aram" | "custom" | "all" = "ranked",
  ) => {
    const response = await apiClient.get("/stats/champion-stats", {
      params: {
        gameName: stripInvisibleChars(gameName),
        tagLine: stripInvisibleChars(tagLine),
        queueGroup,
      },
    });
    return response.data;
  },

  getFetchStatus: async (userId: string) => {
    const response = await apiClient.get(`/stats/fetch-status/${userId}`);
    return response.data;
  },

  refreshStats: async (
    userId: string,
    queueGroup: "ranked" | "normal" | "aram" | "custom" | "all" = "ranked",
  ) => {
    const response = await apiClient.post(`/stats/refresh/${userId}`, undefined, {
      params: { queueGroup },
    });
    return response.data;
  },

  getUserChampionStats: async (userId: string) => {
    const response = await apiClient.get(`/stats/user/${userId}/champion-stats`);
    return response.data;
  },

  getUserPositionStats: async (userId: string) => {
    const response = await apiClient.get(`/stats/user/${userId}/position-stats`);
    return response.data;
  },

  getUserRiotAccounts: async (userId: string) => {
    const response = await apiClient.get(`/stats/user/${userId}/riot-accounts`);
    return response.data;
  },

  findUserByRiotAccount: async (gameName: string, tagLine: string) => {
    const response = await apiClient.get("/stats/summoner", {
      params: { gameName, tagLine },
    });
    return response.data;
  },

  searchUsers: async (query: string, limit: number = 10) => {
    const response = await apiClient.get("/stats/users/search", {
      params: { q: query, limit },
    });
    return response.data;
  },

  // 랭크 챔피언 통계 — 시즌 전체 집계 (DB 캐시 활용, 백엔드가 모든 페이징 처리)
  getRankedChampionStats: async (gameName: string, tagLine: string) => {
    const response = await apiClient.get(
      `/stats/summoner/${encodeURIComponent(stripInvisibleChars(gameName))}/${encodeURIComponent(stripInvisibleChars(tagLine))}/ranked-champion-stats`
    );
    return response.data;
  },

  // 챔피언 시즌 누적 통계 (등록 무관, background 스캔)
  getChampionSeasonStats: async (gameName: string, tagLine: string) => {
    const response = await apiClient.get(
      `/stats/summoner/${encodeURIComponent(stripInvisibleChars(gameName))}/${encodeURIComponent(stripInvisibleChars(tagLine))}/champion-season`
    );
    return response.data as {
      queueGroup: string;
      season: string;
      stats: Array<{
        championId: number;
        championName: string;
        championNameKorean?: string;
        games: number;
        wins: number;
        losses: number;
        kills: number;
        deaths: number;
        assists: number;
      }>;
      status: "idle" | "queued" | "scanning" | "done" | "error";
      scannedCount: number;
      lastScanAt: string | null;
    };
  },

  getSummonerRiotMatches: async (
    gameName: string,
    tagLine: string,
    count: number = 20,
    queueId?: number,
    start: number = 0
  ) => {
    const response = await apiClient.get(
      `/stats/summoner/${encodeURIComponent(stripInvisibleChars(gameName))}/${encodeURIComponent(stripInvisibleChars(tagLine))}/matches`,
      {
        params: { count, queueId, start },
      }
    );
    return response.data;
  },

  getUserRiotMatches: async (
    userId: string,
    count: number = 20,
    queueId?: number
  ) => {
    const response = await apiClient.get(`/stats/user/${userId}/riot-matches`, {
      params: { count, queueId },
    });
    return response.data;
  },

  getMatchTimeline: async (matchId: string) => {
    const response = await apiClient.get(
      `/stats/match/${encodeURIComponent(matchId)}/timeline`
    );
    return response.data;
  },

  getUserAuctionStats: async (userId: string) => {
    const response = await apiClient.get(`/stats/user/${userId}/auction-stats`);
    return response.data;
  },

  // DDragon 최신 버전 조회 — 프로필 아이콘 URL 생성에 사용
  getDdragonVersion: async (): Promise<string> => {
    const response = await apiClient.get<{ version: string }>("/stats/ddragon-version");
    return response.data.version;
  },
};

// ========================================
// Ranking API
// ========================================

export const rankingApi = {
  getGlobalRanking: async (page: number = 1, limit: number = 50) => {
    const response = await apiClient.get("/ranking/global", {
      params: { page, limit },
    });
    return response.data;
  },

  getClanRanking: async (clanId: string, page: number = 1, limit: number = 50) => {
    const response = await apiClient.get(`/ranking/clan/${clanId}`, {
      params: { page, limit },
    });
    return response.data;
  },

  getUserRanking: async (userId: string) => {
    const response = await apiClient.get(`/ranking/user/${userId}`);
    return response.data;
  },

  recalculate: async () => {
    const response = await apiClient.post("/ranking/recalculate");
    return response.data;
  },
};

// ========================================
// Admin API
// ========================================

export const adminApi = {
  // Stats
  getStats: async () => {
    const response = await apiClient.get("/admin/stats");
    return response.data;
  },
  getSystemStatus: async () => {
    const response = await apiClient.get("/health");
    return response.data as {
      status: "ok" | "degraded";
      timestamp: string;
      services: {
        database: { status: "healthy" | "unhealthy"; error?: string };
        redis: { status: "healthy" | "unhealthy"; error?: string };
      };
    };
  },
  getMatchQueueStats: async () => {
    const response = await apiClient.get("/admin/matches/queue-stats");
    return response.data;
  },
  recomputeLabSnapshots: async () => {
    const response = await apiClient.post("/admin/lab/recompute-snapshots");
    return response.data as { champion: number; synergy: number; counter: number };
  },
  triggerMatchFetch: async (queueGroup?: "ranked" | "normal" | "aram" | "custom") => {
    const response = await apiClient.post("/admin/matches/trigger-fetch", undefined, {
      params: queueGroup ? { queueGroup } : undefined,
    });
    return response.data;
  },
  recomputeMatchStats: async (params: { userId?: string; puuid?: string }) => {
    const response = await apiClient.post("/admin/matches/recompute-stats", undefined, {
      params,
    });
    return response.data;
  },
  // Users
  getUsers: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    kind?: "users" | "bots" | "all";
    role?: "USER" | "MODERATOR" | "ADMIN";
  }) => {
    const response = await apiClient.get("/admin/users", { params });
    return response.data;
  },
  updateUserRole: async (userId: string, role: "USER" | "MODERATOR" | "ADMIN") => {
    const response = await apiClient.patch(`/admin/users/${userId}/role`, { role });
    return response.data;
  },
  banUser: async (userId: string, reason: string, banUntil?: string) => {
    const response = await apiClient.post(`/admin/users/${userId}/ban`, { reason, banUntil });
    return response.data;
  },
  unbanUser: async (userId: string) => {
    const response = await apiClient.post(`/admin/users/${userId}/unban`);
    return response.data;
  },
  restrictUser: async (userId: string, restrictedUntil: string) => {
    const response = await apiClient.post(`/admin/users/${userId}/restrict`, { restrictedUntil });
    return response.data;
  },
  unrestrictUser: async (userId: string) => {
    const response = await apiClient.post(`/admin/users/${userId}/unrestrict`);
    return response.data;
  },
  // Discord 길드 연동 (멀티 길드)
  getDiscordGuildLinks: async () => {
    const response = await apiClient.get("/admin/discord/guild-links");
    return response.data;
  },
  sendDiscordTestAlert: async () => {
    const response = await apiClient.post("/admin/discord/test-alert");
    return response.data as { ok: boolean };
  },
  approveDiscordGuildLink: async (id: string) => {
    const response = await apiClient.patch(`/admin/discord/guild-links/${id}/approve`);
    return response.data;
  },
  disableDiscordGuildLink: async (id: string) => {
    const response = await apiClient.patch(`/admin/discord/guild-links/${id}/disable`);
    return response.data;
  },
  // Reports
  getReports: async (params?: { page?: number; limit?: number; status?: string; category?: string }) => {
    const response = await apiClient.get("/admin/reports", { params });
    return response.data;
  },
  reviewReport: async (reportId: string, status: "APPROVED" | "REJECTED", reviewerNote: string, category?: string) => {
    const response = await apiClient.patch(`/admin/reports/${reportId}/review`, { status, reviewerNote, category });
    return response.data;
  },
  // Announcements
  sendAnnouncement: async (title: string, message: string, link?: string) => {
    const response = await apiClient.post("/admin/announcements", { title, message, link });
    return response.data;
  },
  // Chat Logs
  getChatLogs: async (params?: { page?: number; limit?: number; category?: string; roomName?: string; userId?: string; search?: string }) => {
    const response = await apiClient.get("/admin/chat-logs", { params });
    return response.data;
  },
  // Community
  getPosts: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await apiClient.get("/admin/posts", { params });
    return response.data;
  },
  deletePost: async (postId: string) => {
    const response = await apiClient.delete(`/admin/posts/${postId}`);
    return response.data;
  },
  pinPost: async (postId: string, isPinned: boolean) => {
    const response = await apiClient.patch(`/admin/posts/${postId}/pin`, { isPinned });
    return response.data;
  },
  deleteComment: async (commentId: string) => {
    const response = await apiClient.delete(`/admin/comments/${commentId}`);
    return response.data;
  },
  // Clans
  getClans: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await apiClient.get("/admin/clans", { params });
    return response.data;
  },
  deleteClan: async (clanId: string) => {
    const response = await apiClient.delete(`/admin/clans/${clanId}`);
    return response.data;
  },
  // Rooms
  getRooms: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await apiClient.get("/admin/rooms", { params });
    return response.data;
  },
  closeRoom: async (roomId: string) => {
    const response = await apiClient.post(`/admin/rooms/${roomId}/close`);
    return response.data;
  },
  addBotToRoom: async (roomId: string, count = 1) => {
    const response = await apiClient.post(`/admin/rooms/${roomId}/add-bot`, { count });
    return response.data as { addedCount: number; participants: any[] };
  },
  seedHighTiers: async () => {
    const response = await apiClient.post("/admin/matches/seed-high-tiers");
    return response.data;
  },
};

// ========================================
// DM API
// ========================================

export const dmApi = {
  getConversations: async () => {
    const response = await apiClient.get("/dm/conversations");
    return response.data;
  },

  getMessages: async (userId: string, cursor?: string) => {
    const response = await apiClient.get(`/dm/conversations/${userId}`, {
      params: cursor ? { cursor } : undefined,
    });
    return response.data;
  },

  markAsRead: async (userId: string) => {
    const response = await apiClient.post(`/dm/conversations/${userId}/read`);
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await apiClient.get("/dm/unread-count");
    return response.data;
  },
};

// 이의신청 관련 API
export const appealApi = {
  /** 이의신청 제출 (밴/임시제재 상태인 유저) */
  submit: async (reason: string) => {
    const response = await apiClient.post("/users/me/appeals", { reason });
    return response.data;
  },

  /** 내 가장 최근 이의신청 조회 */
  getLatest: async () => {
    const response = await apiClient.get("/users/me/appeals/latest");
    return response.data;
  },

  // ── 관리자용 ──

  /** 이의신청 목록 조회 */
  list: async (params: { page?: number; limit?: number; status?: string }) => {
    const response = await apiClient.get("/admin/appeals", { params });
    return response.data;
  },

  /** 이의신청 처리 (승인/거절) */
  review: async (appealId: string, status: "APPROVED" | "REJECTED", adminNote?: string) => {
    const response = await apiClient.patch(`/admin/appeals/${appealId}/review`, { status, adminNote });
    return response.data;
  },
};

