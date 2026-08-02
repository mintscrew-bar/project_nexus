"use client";

import { useEffect } from "react";
import { useRoomStore } from "@/stores/room-store";

/**
 * 방 관련 기능을 관리하는 훅
 */
export function useRoom(roomId?: string) {
  const {
    currentRoom,
    participants,
    chatMessages,
    typingUsers,
    isConnected,
    isLoading,
    error,
    joinRoom,
    leaveRoom,
    toggleReady,
    connectToRoom,
    disconnectFromRoom,
    sendChatMessage,
    setTypingStatus,
  } = useRoomStore();

  // 방 ID가 있으면 자동으로 연결
  useEffect(() => {
    if (roomId && !isConnected) {
      connectToRoom(roomId);
    }

    return () => {
      if (isConnected) {
        disconnectFromRoom();
      }
    };
  }, [roomId, isConnected, connectToRoom, disconnectFromRoom]);

  return {
    currentRoom,
    participants,
    chatMessages,
    typingUsers,
    isConnected,
    isLoading,
    error,
    joinRoom,
    leaveRoom,
    toggleReady,
    sendChatMessage,
    setTypingStatus,
  };
}
