"use client";

import { useEffect } from "react";
import { useAuctionStore } from "@/stores/auction-store";

/**
 * 경매 관련 기능을 관리하는 훅
 */
export function useAuction(roomId?: string) {
  const {
    auctionState,
    players,
    teams,
    isConnected,
    isLoading,
    error,
    startAuction,
    getAuctionState,
    connectToAuction,
    disconnectFromAuction,
    placeBid,
  } = useAuctionStore();

  // 방 ID가 있으면 자동으로 연결
  useEffect(() => {
    if (roomId && !isConnected) {
      connectToAuction(roomId);
    }

    return () => {
      if (isConnected) {
        disconnectFromAuction();
      }
    };
  }, [roomId, isConnected, connectToAuction, disconnectFromAuction]);

  return {
    auctionState,
    players,
    teams,
    isConnected,
    isLoading,
    error,
    startAuction,
    getAuctionState,
    placeBid,
  };
}
