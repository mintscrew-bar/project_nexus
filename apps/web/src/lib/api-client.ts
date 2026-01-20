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
        window.location.href = "/auth/login";
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

  logout: async () => {
    try {
      await apiClient.post("/api/auth/logout");
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
    const response = await apiClient.post("/users/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },

  getStats: async () => {
    const response = await apiClient.get("/users/stats");
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
    title: string;
    maxSize: 10 | 15 | 20;
    mode: "AUCTION" | "SNAKE_DRAFT";
    isPrivate: boolean;
    password?: string;
  }) => {
    const response = await apiClient.post("/rooms", data);
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

  kickParticipant: async (roomId: string, userId: string) => {
    const response = await apiClient.post(`/rooms/${roomId}/kick/${userId}`);
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
  generateBracket: async (roomId: string) => {
    const response = await apiClient.post(`/matches/${roomId}/bracket`);
    return response.data;
  },

  getBracket: async (roomId: string) => {
    const response = await apiClient.get(`/matches/${roomId}/bracket`);
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

  reportResult: async (
    matchId: string,
    data: { winnerTeamId: string; statsJson?: any }
  ) => {
    const response = await apiClient.post(`/matches/${matchId}/result`, data);
    return response.data;
  },
};

// Riot API 관련 API
export const riotApi = {
  verifyAccount: async (data: {
    gameName: string;
    tagLine: string;
    verificationCode: string;
  }) => {
    const response = await apiClient.post("/riot/verify", data);
    return response.data;
  },

  getMyAccounts: async () => {
    const response = await apiClient.get("/riot/accounts");
    return response.data;
  },

  syncAccount: async (accountId: string) => {
    const response = await apiClient.post(`/riot/sync/${accountId}`);
    return response.data;
  },

  setPrimaryAccount: async (accountId: string) => {
    const response = await apiClient.post(`/riot/primary/${accountId}`);
    return response.data;
  },

  setPositions: async (data: { primaryPosition: string; secondaryPosition: string }) => {
    const response = await apiClient.post("/riot/positions", data);
    return response.data;
  },

  updateChampions: async (accountId: string, championIds: number[]) => {
    const response = await apiClient.post(`/riot/champions/${accountId}`, {
      championIds,
    });
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
    const response = await apiClient.get("/friends/pending");
    return response.data;
  },

  sendRequest: async (targetUserId: string) => {
    const response = await apiClient.post("/friends/request", { targetUserId });
    return response.data;
  },

  acceptRequest: async (friendshipId: string) => {
    const response = await apiClient.post(`/friends/${friendshipId}/accept`);
    return response.data;
  },

  rejectRequest: async (friendshipId: string) => {
    const response = await apiClient.post(`/friends/${friendshipId}/reject`);
    return response.data;
  },

  cancelRequest: async (friendshipId: string) => {
    const response = await apiClient.delete(`/friends/${friendshipId}/cancel`);
    return response.data;
  },

  removeFriend: async (friendshipId: string) => {
    const response = await apiClient.delete(`/friends/${friendshipId}`);
    return response.data;
  },

  blockUser: async (targetUserId: string) => {
    const response = await apiClient.post("/friends/block", { targetUserId });
    return response.data;
  },

  unblockUser: async (friendshipId: string) => {
    const response = await apiClient.post(`/friends/${friendshipId}/unblock`);
    return response.data;
  },

  getStats: async () => {
    const response = await apiClient.get("/friends/stats");
    return response.data;
  },
};
