import { create } from "zustand";
import { authApi, setAccessToken } from "@/lib/api-client";

interface User {
  id: string;
  username: string;
  avatar: string | null;
  email?: string;
  // Add other fields from your User model as needed
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
  isLoading: true,

  initializeAuth: async () => {
    set({ isLoading: true });
    try {
      // The interceptor in api-client will handle token refresh.
      // We just need to ask for the user profile.
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true });
    } catch (error) {
      // This is expected if the user is not logged in.
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
