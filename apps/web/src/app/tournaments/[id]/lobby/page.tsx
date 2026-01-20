"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Crown, Check, X } from "lucide-react";

// Placeholder for Room data and Participant data
interface Participant {
  id: string;
  username: string;
  isHost: boolean;
  isReady: boolean;
}

interface Room {
  id: string;
  title: string;
  hostId: string;
  currentPlayers: number;
  maxPlayers: number;
  isPrivate: boolean;
  status: "WAITING" | "IN_PROGRESS" | "COMPLETED";
  teamMode: "AUCTION" | "LADDER";
  participants: Participant[];
}

const dummyRoom: Room = {
  id: "room-123",
  title: "경매 내전: 실력자 구함",
  hostId: "user-host", // Placeholder host ID
  currentPlayers: 3,
  maxPlayers: 10,
  isPrivate: false,
  status: "WAITING",
  teamMode: "AUCTION",
  participants: [
    { id: "user-host", username: "HostPlayer", isHost: true, isReady: true },
    { id: "user-1", username: "Player1", isHost: false, isReady: true },
    { id: "user-2", username: "Player2", isHost: false, isReady: false },
  ],
};


export default function TournamentLobbyPage() {
  const params = useParams();
  const roomId = params.id as string;
  // TODO: Replace with real data from a store (e.g., useRoomLobbyStore)
  const [room, setRoom] = useState<Room | null>(dummyRoom);
  // TODO: Get current user ID from auth store
  const currentUserId = "user-1"; 

  useEffect(() => {
    // TODO: Fetch real room data and subscribe to updates
    console.log(`Fetching lobby data for room: ${roomId}`);
  }, [roomId]);

  if (!room) {
    return (
      <div className="flex-grow p-8 text-center text-ui-text-muted">
        <p>로비 정보를 불러오는 중...</p>
      </div>
    );
  }

  const isCurrentUserHost = room.hostId === currentUserId;
  const currentUserIsReady = room.participants.find(p => p.id === currentUserId)?.isReady || false;
  const allPlayersReady = room.participants.length > 0 && room.participants.every(p => p.isReady);


  return (
    <div className="flex-grow p-8">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-ui-text-base">
          {room.title} <span className="text-brand-500 text-xl">#{room.id.slice(0, 4)}</span>
        </h1>
        <p className="text-ui-text-muted mb-6">
          방장: {room.participants.find(p => p.isHost)?.username || 'N/A'} | 팀 구성 방식: {room.teamMode === "AUCTION" ? "경매" : "사다리타기"}
          {room.isPrivate && <span className="ml-2 px-2 py-0.5 bg-ui-border rounded-full text-xs font-semibold">비공개</span>}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Participants List */}
          <div className="md:col-span-2 bg-ui-card border border-ui-border rounded-xl p-6">
            <h2 className="text-2xl font-bold text-ui-text-base mb-4 flex items-center">
              <Users className="h-6 w-6 mr-2 text-ui-text-muted" />
              참가자 ({room.participants.length}/{room.maxPlayers})
            </h2>
            <div className="space-y-2">
              {room.participants.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-ui-background p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    {p.isHost && <Crown className="h-5 w-5 text-lol-accent-gold" />}
                    <span className="font-semibold text-ui-text-base">{p.username}</span>
                  </div>
                  {p.isReady ? (
                    <Check className="h-5 w-5 text-lol-accent-green" />
                  ) : (
                    <X className="h-5 w-5 text-lol-accent-red" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Lobby Controls */}
          <div className="md:col-span-1 bg-ui-card border border-ui-border rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-2xl font-bold text-ui-text-base mb-4">로비 컨트롤</h2>
              <div className="space-y-3">
                <button className="w-full px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-lg transition-colors duration-200">
                  {currentUserIsReady ? "준비 완료" : "준비하기"}
                </button>
                <button className="w-full px-6 py-3 bg-ui-border hover:bg-ui-text-muted text-ui-text-base font-bold rounded-lg transition-colors duration-200">
                  로비 나가기
                </button>
              </div>
            </div>
            
            {isCurrentUserHost && (
                <button
                    className="w-full mt-6 px-6 py-3 bg-lol-accent-green hover:bg-lol-accent-green/80 text-white font-bold rounded-lg transition-colors duration-200"
                    disabled={!allPlayersReady || room.participants.length < 2} // Example: needs at least 2 players and all ready
                >
                    내전 시작
                </button>
            )}
            {!isCurrentUserHost && (
                <p className="mt-6 text-ui-text-muted text-center text-sm">방장이 내전을 시작할 때까지 기다려 주세요.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
