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
    const response = await apiClient.get("/api/auth/me");
    return response.data;
  },
};
