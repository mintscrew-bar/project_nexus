"use client";

import { useEffect } from "react";
import { useAuctionStore } from "@/stores/auction-store";
import { useAuthStore } from "@/stores/auth-store";

/**
 * 경매 관련 기능을 관리하는 훅
 */
export function useAuction(roomId?: string) {
  const {
    auctionState,
    players,
    teams,
    bidHistory,
    isConnected,
    isLoading,
    error,
    startAuction,
    getAuctionState,
    connectToAuction,
    disconnectFromAuction,
    placeBid,
    captainSelectionPhase,
    volunteerAsCaptain,
    finalizeVolunteers,
    selectManualCaptains,
    sessionAbortedAt,
    sessionAbortMessage,
    clearSessionAbort,
  } = useAuctionStore();
  const { isLoading: authLoading, isAuthenticated } = useAuthStore();

  // 방 ID가 있으면 자동으로 연결
  // connectToAuction/disconnectFromAuction는 zustand 스토어 함수로 참조가 안정적이므로 dependency에서 제외
  useEffect(() => {
    if (!roomId || authLoading || !isAuthenticated) return;

    connectToAuction(roomId);

    return () => {
      disconnectFromAuction();
    };
  }, [roomId, authLoading, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    auctionState,
    players,
    teams,
    bidHistory,
    isConnected,
    isLoading,
    error,
    startAuction,
    getAuctionState,
    placeBid,
    captainSelectionPhase,
    volunteerAsCaptain,
    finalizeVolunteers,
    selectManualCaptains,
    sessionAbortedAt,
    sessionAbortMessage,
    clearSessionAbort,
  };
}
