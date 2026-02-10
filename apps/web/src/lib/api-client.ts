import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// Next.js rewrites를 사용하므로 상대 경로 사용
const API_BASE_URL = "/api";

// 토큰 저장소 (메모리 기반, 필요시 localStorage로 변경 가능)
let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

// Axios 인스턴스 생성
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // 쿠키 전송 (refresh token)
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

    // 401 에러이고, 아직 재시도하지 않은 경우
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // 이미 갱신 중인 요청이 있으면 대기
        if (refreshPromise) {
          const newToken = await refreshPromise;
          accessToken = newToken;
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }

        // 토큰 갱신
        refreshPromise = refreshAccessToken();
        const newToken = await refreshPromise;
        refreshPromise = null;

        accessToken = newToken;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        return apiClient(originalRequest);
      } catch (refreshError) {
        // 갱신 실패 시 로그아웃 처리
        accessToken = null;
        // 이미 로그인 페이지에 있으면 리다이렉트하지 않음 (무한 루프 방지)
        if (!window.location.pathname.startsWith("/auth/login")) {
          window.location.href = "/auth/login";
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Access Token 갱신 함수
async function refreshAccessToken(): Promise<string> {
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
    throw new Error("Failed to refresh token");
  }
}

// 인증 관련 API
export const authApi = {
  login: () => {
    // Discord OAuth로 리다이렉트
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    window.location.href = `${apiUrl}/api/auth/discord`;
  },

  loginWithGoogle: () => {
    // Google OAuth로 리다이렉트
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    window.location.href = `${apiUrl}/api/auth/google`;
  },

  logout: async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      accessToken = null;
      window.location.href = "/";
    }
  },

  getMe: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data;
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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    window.location.href = `${apiUrl}/api/auth/google`;
  },
};

// 유저 관련 API
export const userApi = {
  getProfile: async (userId: string) => {
    const response = await apiClient.get(`/users/${userId}`);
    return response.data;
  },

  updateProfile: async (data: { username?: string; bio?: string }) => {
    const response = await apiClient.patch("/users/profile", data);
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

  getStats: async () => {
    const response = await apiClient.get("/users/stats");
    return response.data;
  },

  getSettings: async () => {
    const response = await apiClient.get("/users/settings");
    return response.data;
  },

  updateSettings: async (data: {
    notifyMatchStart?: boolean;
    notifyMatchResult?: boolean;
    notifyClanActivity?: boolean;
    showOnlineStatus?: boolean;
    showMatchHistory?: boolean;
    allowFriendRequests?: boolean;
    theme?: string;
  }) => {
    const response = await apiClient.patch("/users/settings", data);
    return response.data;
  },
};

// 방 관련 API
export const roomApi = {
  getRooms: async (params?: {
    mode?: string;
    status?: string;
    maxSize?: number;
  }) => {
    const response = await apiClient.get("/rooms", { params });
    return response.data;
  },

  getRoom: async (roomId: string) => {
    const response = await apiClient.get(`/rooms/${roomId}`);
    return response.data;
  },

  createRoom: async (data: {
    name: string;
    maxParticipants: number;
    teamMode: "AUCTION" | "SNAKE_DRAFT";
    password?: string;
    allowSpectators?: boolean;
    startingPoints?: number;
    minBidIncrement?: number;
    bidTimeLimit?: number;
    pickTimeLimit?: number;
    captainSelection?: "RANDOM" | "TIER";
  }) => {
    const response = await apiClient.post("/rooms", data);
    return response.data;
  },
  
  update: async (roomId: string, data: any) => {
    const response = await apiClient.put(`/rooms/${roomId}`, data);
    return response.data;
  },

  joinRoom: async (roomId: string, password?: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/join`, {
      password,
    });
    return response.data;
  },

  leaveRoom: async (roomId: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/leave`);
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

  makePick: async (roomId: string, playerId: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/snake-draft/pick`, {
      playerId,
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
    const response = await apiClient.get(`/matches/${matchId}`);
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
    data: { winnerTeamId: string; statsJson?: any }
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
};

// Riot API 관련 API
export const riotApi = {
  // 챔피언 목록 조회 (Data Dragon)
  getChampions: async () => {
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    const response = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`
    );
    const data = await response.json();
    return { data: data.data, version: data.version };
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

  // 소환사 정보 조회
  getSummoner: async (gameName: string, tagLine: string) => {
    console.log('getSummoner called with:', { gameName, tagLine });

    // axios가 URL 인코딩을 자동으로 처리하도록 함
    const response = await apiClient.get(`/riot/summoner/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`);
    console.log('getSummoner response:', response.data);
    return response.data;
  },
};

// 클랜 관련 API
export const clanApi = {
  getClans: async (params?: { search?: string; isRecruiting?: boolean }) => {
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
    data: { name?: string; description?: string; isRecruiting?: boolean }
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
    const response = await apiClient.post(`/clans/${clanId}/kick/${userId}`);
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
    const response = await apiClient.post(`/clans/${clanId}/transfer`, {
      newOwnerId,
    });
    return response.data;
  },

  getChatMessages: async (clanId: string, limit = 50, offset = 0) => {
    const response = await apiClient.get(`/clans/${clanId}/messages`, {
      params: { limit, offset },
    });
    return response.data;
  },
};

// 커뮤니티 관련 API
export const communityApi = {
  getPosts: async (params?: {
    category?: string;
    limit?: number;
    offset?: number;
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
    category: "NOTICE" | "FREE" | "TIP" | "QNA";
  }) => {
    const response = await apiClient.post("/community/posts", data);
    return response.data;
  },

  updatePost: async (
    postId: string,
    data: { title?: string; content?: string }
  ) => {
    const response = await apiClient.patch(`/community/posts/${postId}`, data);
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
    const response = await apiClient.post("/reputation/rate", data);
    return response.data;
  },

  getUserRatings: async (userId: string, limit = 10, offset = 0) => {
    const response = await apiClient.get(`/reputation/user/${userId}/ratings`, {
      params: { limit, offset },
    });
    return response.data;
  },

  reportUser: async (data: {
    targetUserId: string;
    matchId: string;
    reason: "TOXICITY" | "AFK" | "GRIEFING" | "CHEATING" | "OTHER";
    description: string;
  }) => {
    const response = await apiClient.post("/reputation/report", data);
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

  getSummonerRiotMatches: async (
    gameName: string,
    tagLine: string,
    count: number = 20,
    queueId?: number,
    start: number = 0
  ) => {
    const response = await apiClient.get(
      `/stats/summoner/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}/matches`,
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
};
