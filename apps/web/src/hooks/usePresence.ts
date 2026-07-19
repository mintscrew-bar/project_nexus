"use client";

import { useEffect, useRef } from "react";
import { usePresenceStore, type UserStatus } from "@/stores/presence-store";
import { useAuthStore } from "@/stores/auth-store";
import { useShallow } from "zustand/react/shallow";

// 5분 비활동 시 자리비움으로 전환 (Discord와 동일)
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Hook for managing user presence/online status
 * Automatically connects when user is authenticated
 */
export function usePresence() {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  
  const {
    myStatus,
    friendStatuses,
    isConnected,
    isLoading,
    isManualOffline,
    connect,
    disconnect,
    setStatus,
    fetchFriendsStatuses,
    getFriendStatus,
  } = usePresenceStore(useShallow(state => ({
    myStatus: state.myStatus,
    friendStatuses: state.friendStatuses,
    isConnected: state.isConnected,
    isLoading: state.isLoading,
    isManualOffline: state.isManualOffline,
    connect: state.connect,
    disconnect: state.disconnect,
    setStatus: state.setStatus,
    fetchFriendsStatuses: state.fetchFriendsStatuses,
    getFriendStatus: state.getFriendStatus,
  })));

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStatusRef = useRef<"ONLINE" | "AWAY">("ONLINE");

  // Auto-connect when authenticated (수동 오프라인 시 재연결 억제)
  useEffect(() => {
    if (isAuthenticated && !isConnected && !isManualOffline) {
      connect();
    }

    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [isAuthenticated, isConnected, isManualOffline, connect, disconnect]);

  // 자동 자리비움 감지 (수동 오프라인 시 비활성)
  useEffect(() => {
    if (!isAuthenticated || !isConnected || isManualOffline) return;

    const goOnline = () => {
      if (currentStatusRef.current === "AWAY") {
        currentStatusRef.current = "ONLINE";
        setStatus("ONLINE");
      }
      resetIdleTimer();
    };

    const goAway = () => {
      if (currentStatusRef.current === "ONLINE") {
        currentStatusRef.current = "AWAY";
        setStatus("AWAY");
      }
    };

    const resetIdleTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(goAway, IDLE_TIMEOUT_MS);
    };

    // 탭 가시성 변경 감지
    const handleVisibilityChange = () => {
      if (document.hidden) {
        goAway();
      } else {
        goOnline();
      }
    };

    // 활동 이벤트 (throttle — 10초마다 한 번만 처리)
    let lastActivity = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivity < 10_000) return;
      lastActivity = now;
      goOnline();
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 초기 타이머 시작
    resetIdleTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isAuthenticated, isConnected, isManualOffline, setStatus]);

  return {
    myStatus,
    friendStatuses,
    isConnected,
    isLoading,
    setStatus,
    fetchFriendsStatuses,
    getFriendStatus,
  };
}

/**
 * Hook for getting a specific friend's status
 */
export function useFriendStatus(friendId: string): UserStatus {
  const status = usePresenceStore(state => state.friendStatuses.get(friendId)?.status);
  return status || "OFFLINE";
}
