"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";

/**
 * 인증 상태를 관리하는 훅
 * 컴포넌트 마운트 시 사용자 정보를 자동으로 가져옵니다.
 */
export function useAuth() {
  const { user, isAuthenticated, isLoading, fetchUser, logout } =
    useAuthStore();

  useEffect(() => {
    // 토큰이 있으면 사용자 정보 가져오기
    if (!isAuthenticated && !isLoading) {
      fetchUser();
    }
  }, [isAuthenticated, isLoading, fetchUser]);

  return {
    user,
    isAuthenticated,
    isLoading,
    logout,
  };
}
