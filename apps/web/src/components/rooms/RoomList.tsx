"use client";

import Link from "next/link";
import { Users, Lock, RefreshCcw } from "lucide-react";
import { useEffect } from "react";
import { useRoomStore } from "@/stores/room-store";

export function RoomList() {
  const { rooms, isLoading, error, fetchRooms } = useRoomStore();

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  if (isLoading) {
    return (
      <div className="text-center py-10">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
        <p className="text-ui-text-muted">방 목록 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-lol-accent-red mb-4">에러: {error}</p>
        <button
          onClick={fetchRooms}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center mx-auto"
        >
          <RefreshCcw className="h-4 w-4 mr-2" /> 다시 시도
        </button>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="text-center py-10 text-ui-text-muted">
        <p>생성된 내전 방이 없습니다.</p>
        <p>새로운 방을 생성해보세요!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rooms.map((room) => (
        <div
          key={room.id}
          className="bg-ui-background border border-ui-border rounded-lg p-4 flex items-center justify-between transition-colors duration-200 hover:border-brand-500"
        >
          <div className="flex-grow">
            <h3 className="text-xl font-semibold text-ui-text-base flex items-center space-x-2">
              {room.isPrivate && <Lock className="h-5 w-5 text-ui-text-muted" />}
              <span>{room.title}</span>
            </h3>
            <div className="flex items-center text-ui-text-muted text-sm space-x-3 mt-1">
              <span className="flex items-center">
                <Users className="h-4 w-4 mr-1" /> {room.currentPlayers}/{room.maxPlayers}
              </span>
              <span>
                방식: {room.teamMode === "AUCTION" ? "경매" : "사다리타기"}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  room.status === "WAITING"
                    ? "bg-lol-primary-500 text-lol-dark-500"
                    : room.status === "IN_PROGRESS"
                    ? "bg-brand-500 text-white"
                    : "bg-ui-text-muted text-ui-background"
                }`}
              >
                {room.status === "WAITING" && "대기중"}
                {room.status === "IN_PROGRESS" && "진행중"}
                {room.status === "COMPLETED" && "완료"}
              </span>
            </div>
          </div>
          <Link
            href={`/tournaments/${room.id}/lobby`}
            className="ml-4 px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            참가
          </Link>
        </div>
      ))}
    </div>
  );
}
