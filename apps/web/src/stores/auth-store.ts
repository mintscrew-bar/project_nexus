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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start true so protected pages wait before redirecting

  initializeAuth: async () => {
    set({ isLoading: true });
    try {
      // refresh token으로 access token을 먼저 발급받은 뒤 /auth/me 조회
      // → /auth/me에서 불필요한 401이 발생하지 않음
      // Race against a 5s timeout so a slow/unreachable API never blocks the UI
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth_timeout")), 5000)
      );
      const user = await Promise.race([authApi.initSession(), timeout]);
      set({ user, isAuthenticated: true });
    } catch {
      // 로그인 안 됐거나 세션 만료 (정상 케이스)
      set({ user: null, isAuthenticated: false });
      setAccessToken(null);
    } finally {
      set({ isLoading: false });
    }
  },

  emailLogin: async (credentials) => {
    set({ isLoading: true });
    try {
      const { accessToken } = await authApi.emailLogin(credentials);
      setAccessToken(accessToken);
      const user = await authApi.getMe();
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
      // Ensure state is always cleared
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
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      setAccessToken(null);
      throw error;
    }
  },
}));
