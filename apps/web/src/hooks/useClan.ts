"use client";

import { useEffect } from "react";
import { useClanStore } from "@/stores/clan-store";

/**
 * 클랜 관련 기능을 관리하는 훅
 */
export function useClan(clanId?: string) {
  const {
    currentClan,
    chatMessages,
    typingUsers,
    isConnected,
    isLoading,
    error,
    connectToClan,
    disconnectFromClan,
    sendChatMessage,
    setTypingStatus,
  } = useClanStore();

  // 클랜 ID가 있으면 자동으로 연결
  useEffect(() => {
    if (clanId && !isConnected) {
      connectToClan(clanId);
    }

    return () => {
      if (isConnected) {
        disconnectFromClan();
      }
    };
  }, [clanId, isConnected, connectToClan, disconnectFromClan]);

  return {
    currentClan,
    chatMessages,
    typingUsers,
    isConnected,
    isLoading,
    error,
    sendChatMessage,
    setTypingStatus,
  };
}