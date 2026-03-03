import { create } from "zustand";
import { authApi, setAccessToken } from "@/lib/api-client";

interface User {
  id: string;
  username: string;
  avatar: string | null;
  email?: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  [key: string]: any;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initializeAuth: () => Promise<void>;
  emailLogin: (credentials: { email: string; password: string }) => Promise<void>;
  loginWithDiscord: () => void;
  loginWithGoogle: () => void;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
}

// ============================================================
// localStorage 캐시 헬퍼 (토큰이 아닌 유저 정보만 저장)
// → 새로고침 시 헤더에 유저 이름이 즉시 표시됨 (플래시 방지)
// ============================================================
const STORAGE_KEY = "nexus_auth_user";

function saveUserToStorage(user: User) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        email: user.email,
      })
    );
  } catch {}
}

function loadUserFromStorage(): User | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? (JSON.parse(data) as User) : null;
  } catch {
    return null;
  }
}

function clearUserFromStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// initializeAuth 중복 호출 방지 (React StrictMode 대응)
let _initPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start true so protected pages wait before redirecting

  initializeAuth: async () => {
    // 이미 초기화 중이면 기존 Promise를 재사용
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
      set({ isLoading: true });

      // 캐시된 유저가 있으면 즉시 헤더에 표시 (isAuthenticated는 false 유지)
      const cachedUser = loadUserFromStorage();
      if (cachedUser) {
        set({ user: cachedUser });
      }

      try {
        // refresh token으로 access token을 먼저 발급받은 뒤 /auth/me 조회
        // 캐시된 유저 없으면 비로그인 가능성 높음 → 타임아웃 짧게 (2초)
        const timeoutMs = cachedUser ? 5000 : 2000;
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("auth_timeout")), timeoutMs)
        );
        const user = await Promise.race([authApi.initSession(), timeout]);
        saveUserToStorage(user);
        set({ user, isAuthenticated: true });
      } catch {
        // 로그인 안 됐거나 세션 만료 (정상 케이스)
        clearUserFromStorage();
        set({ user: null, isAuthenticated: false });
        setAccessToken(null);
      } finally {
        set({ isLoading: false });
        _initPromise = null;
      }
    })();

    return _initPromise;
  },

  emailLogin: async (credentials) => {
    set({ isLoading: true });
    try {
      const { accessToken } = await authApi.emailLogin(credentials);
      setAccessToken(accessToken);
      const user = await authApi.getMe();
      saveUserToStorage(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      console.error("Login failed:", error);
      set({ user: null, isAuthenticated: false, isLoading: false });
      setAccessToken(null);
      throw error; // Re-throw for the component to handle
    }
  },

  loginWithDiscord: () => {
    set({ isLoading: true });
    authApi.login(); // This redirects
  },

  loginWithGoogle: () => {
    set({ isLoading: true });
    authApi.loginWithGoogle(); // This redirects
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authApi.logout(); // This handles token clearing and redirection
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      clearUserFromStorage();
      set({ user: null, isAuthenticated: false, isLoading: false });
      setAccessToken(null);
      window.location.href = '/'; // Redirect to home on logout
    }
  },

  setUser: (user: User | null) => {
    set({ user, isAuthenticated: !!user });
  },

  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const user = await authApi.getMe();
      saveUserToStorage(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      setAccessToken(null);
      throw error;
    }
  },
}));
