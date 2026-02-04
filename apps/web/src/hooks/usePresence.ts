"use client";

import { useEffect } from "react";
import { usePresenceStore, type UserStatus } from "@/stores/presence-store";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Hook for managing user presence/online status
 * Automatically connects when user is authenticated
 */
export function usePresence() {
  const { isAuthenticated } = useAuthStore();
  const {
    myStatus,
    friendStatuses,
    isConnected,
    isLoading,
    connect,
    disconnect,
    setStatus,
    fetchFriendsStatuses,
    getFriendStatus,
  } = usePresenceStore();

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && !isConnected) {
      connect();
    }

    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, [isAuthenticated, isConnected, connect, disconnect]);

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
  const { friendStatuses } = usePresenceStore();
  const friend = friendStatuses.get(friendId);
  return friend?.status || "OFFLINE";
}
