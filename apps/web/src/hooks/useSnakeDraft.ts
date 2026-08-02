"use client";

import { useEffect } from "react";
import { useSnakeDraftStore } from "@/stores/snake-draft-store";

/**
 * Snake Draft 관련 기능을 관리하는 훅
 */
export function useSnakeDraft(roomId?: string) {
  const {
    draftState,
    isConnected,
    isLoading,
    error,
    startDraft,
    makePick,
    getDraftState,
    connectToDraft,
    disconnectFromDraft,
  } = useSnakeDraftStore();

  // 방 ID가 있으면 자동으로 연결
  useEffect(() => {
    if (roomId && !isConnected) {
      connectToDraft(roomId);
    }

    return () => {
      if (isConnected) {
        disconnectFromDraft();
      }
    };
  }, [roomId, isConnected, connectToDraft, disconnectFromDraft]);

  return {
    draftState,
    isConnected,
    isLoading,
    error,
    startDraft,
    makePick,
    getDraftState,
  };
}
