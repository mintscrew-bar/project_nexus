"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRoomStore } from "@/stores/room-store";
import { RoomCard } from "@/components/domain";
import { LoadingSpinner, EmptyState, Button } from "@/components/ui";
import { RefreshCcw, Home } from "lucide-react";

export function RoomList() {
  const router = useRouter();
  const { rooms, isLoading, error, fetchRooms } = useRoomStore();

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <LoadingSpinner size="lg" />
        <p className="text-text-secondary mt-4">방 목록 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={RefreshCcw}
        title="방 목록을 불러올 수 없습니다"
        description={error}
        action={{
          label: "다시 시도",
          onClick: () => fetchRooms(),
        }}
      />
    );
  }

  if (rooms.length === 0) {
    return (
      <EmptyState
        icon={Home}
        title="생성된 내전 방이 없습니다"
        description="새로운 방을 생성해서 친구들과 내전을 시작해보세요!"
        action={{
          label: "방 생성하기",
          onClick: () => {}, // Modal will handle this
        }}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
      {rooms.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          onClick={() => router.push(`/tournaments/${room.id}/lobby`)}
        />
      ))}
    </div>
  );
}
