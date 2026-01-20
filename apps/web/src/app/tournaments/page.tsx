"use client";

import { useState } from "react";
import Link from "next/link";
import { RoomList } from "@/components/rooms/RoomList"; // Import RoomList
import { RoomCreationForm } from "@/components/rooms/RoomCreationForm"; // Import RoomCreationForm

export default function TournamentsPage() {
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const handleRoomCreated = (roomData: any) => {
    // TODO: Handle successful room creation (e.g., refresh list, navigate to lobby)
    console.log("Room created:", roomData);
    setIsCreatingRoom(false);
  };

  return (
    <div className="flex-grow p-8">
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-text-primary">내전 방 목록</h1>
          <button
            onClick={() => setIsCreatingRoom(true)}
            className="px-6 py-2 bg-accent-primary hover:bg-accent-hover text-white font-bold rounded-lg transition-colors duration-200"
          >
            방 생성
          </button>
        </div>

        {isCreatingRoom ? (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-bold text-text-primary mb-4">새 내전 방 생성</h2>
            <RoomCreationForm onCancel={() => setIsCreatingRoom(false)} /> {/* Integrate RoomCreationForm here */}
          </div>
        ) : (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
            <h2 className="text-2xl font-bold text-text-primary mb-4">참여 가능한 방</h2>
            <RoomList /> {/* Integrate RoomList here */}
          </div>
        )}
      </div>
    </div>
  );
}
