import { create } from "zustand";
import { authApi, userApi, setAccessToken } from "@/lib/api-client";

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
  logout: () => Promise<void>;
  /** 회원 탈퇴: 계정 삭제 후 로그아웃 처리 */
  deleteAccount: () => Promise<void>;
  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
}

// ============================================================
// sessionStorage 캐시 헬퍼 (토큰이 아닌 유저 정보만 저장)
// → 새로고침 시 헤더에 유저 이름이 즉시 표시됨 (플래시 방지)
// → sessionStorage 사용: 탭/브라우저 종료 시 자동 삭제되어 공유 PC 안전
// → role 필드 제외: 캐시된 role로 admin 메뉴가 잠시 노출되는 문제 방지
// ============================================================
const STORAGE_KEY = "nexus_auth_user";

function saveUserToStorage(user: User) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      })
    );
  } catch {}
}

function loadUserFromStorage(): User | null {
  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    return data ? (JSON.parse(data) as User) : null;
  } catch {
    return null;
  }
}

function clearUserFromStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    // 기존 localStorage 캐시가 남아있을 수 있으므로 정리
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

  /**
   * 회원 탈퇴: 서버에서 유저 계정을 삭제한 뒤 로컬 인증 상태를 초기화한다.
   * - userApi.deleteAccount() → DELETE /users/me (204 No Content)
   * - 서버 로그아웃(refresh token 무효화) 후 홈으로 리다이렉트
   */
  deleteAccount: async () => {
    set({ isLoading: true });
    try {
      // 서버에서 유저 레코드 삭제
      await userApi.deleteAccount();
      // refresh token 쿠키 무효화 및 서버 세션 정리
      await authApi.logout();
    } catch (error) {
      console.error("회원 탈퇴 실패:", error);
      set({ isLoading: false });
      throw error; // 컴포넌트에서 에러 핸들링 가능하도록 re-throw
    } finally {
      // 로컬 캐시 및 인증 상태 초기화
      clearUserFromStorage();
      set({ user: null, isAuthenticated: false, isLoading: false });
      setAccessToken(null);
      window.location.href = '/'; // 홈으로 리다이렉트
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
