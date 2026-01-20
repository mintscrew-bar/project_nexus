"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useLobbyStore } from "@/stores/lobby-store";
import { useAuthStore } from "@/stores/auth-store";
import { Users, Crown, Check, X } from "lucide-react";
import Link from "next/link";


export default function TournamentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  
  const { connect, disconnect, room, isConnected, error, gameStarting, setReady, startGame } = useLobbyStore();
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    if (roomId) {
      connect(roomId);
    }
    return () => {
      disconnect();
    };
  }, [roomId, connect, disconnect]);

  useEffect(() => {
    if (gameStarting && room) {
      if (room.teamMode === "AUCTION") {
        router.push(`/auction/${room.id}`);
      }
      // Add other team selection methods later
    }
  }, [gameStarting, room, router]);

  if (!isConnected && !error) {
    return (
      <div className="flex-grow p-8 text-center text-text-secondary">
        <p>로비에 연결하는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow p-8 text-center">
        <p className="text-accent-danger mb-4">로비에 연결할 수 없습니다: {error}</p>
        <Link href="/tournaments" className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-lg">
          로비 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  if (!room) {
    return (
        <div className="flex-grow p-8 text-center text-text-secondary">
            <p>방 정보를 기다리는 중...</p>
        </div>
    );
  }
  
  const isCurrentUserHost = room.hostId === currentUser?.id;
  const currentUserParticipant = room.participants.find(p => p.id === currentUser?.id);
  const currentUserIsReady = currentUserParticipant?.isReady || false;
  const allPlayersReady = room.participants.length > 0 && room.participants.every(p => p.isReady);

  return (
    <div className="flex-grow p-8">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-text-primary">
          {room.title} <span className="text-accent-primary text-xl">#{room.id.slice(0, 4)}</span>
        </h1>
        <p className="text-text-secondary mb-6">
          방장: {room.participants.find(p => p.isHost)?.username || 'N/A'} | 팀 구성 방식: {room.teamMode === "AUCTION" ? "경매" : "사다리타기"}
          {room.isPrivate && <span className="ml-2 px-2 py-0.5 bg-bg-tertiary rounded-full text-xs font-semibold">비공개</span>}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Participants List */}
          <div className="md:col-span-2 bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
            <h2 className="text-2xl font-bold text-text-primary mb-4 flex items-center">
              <Users className="h-6 w-6 mr-2 text-text-secondary" />
              참가자 ({room.participants.length}/{room.maxPlayers})
            </h2>
            <div className="space-y-2">
              {room.participants.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-bg-tertiary p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    {p.isHost && <Crown className="h-5 w-5 text-accent-gold" />}
                    <span className="font-semibold text-text-primary">{p.username}</span>
                  </div>
                  {p.isReady ? (
                    <Check className="h-5 w-5 text-accent-success" />
                  ) : (
                    <X className="h-5 w-5 text-accent-danger" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Lobby Controls */}
          <div className="md:col-span-1 bg-bg-secondary border border-bg-tertiary rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-2xl font-bold text-text-primary mb-4">로비 컨트롤</h2>
              <div className="space-y-3">
                <button 
                  className="w-full px-6 py-3 bg-accent-primary hover:bg-accent-hover text-white font-bold rounded-lg transition-colors duration-200"
                  onClick={() => setReady(!currentUserIsReady)}
                >
                  {currentUserIsReady ? "준비 취소" : "준비하기"}
                </button>
                <button 
                  className="w-full px-6 py-3 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-bold rounded-lg transition-colors duration-200"
                  onClick={() => disconnect()} // Should probably navigate back too
                >
                  로비 나가기
                </button>
              </div>
            </div>
            
            {isCurrentUserHost && (
                <button
                    className="w-full mt-6 px-6 py-3 bg-accent-success hover:bg-accent-success/80 text-white font-bold rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!allPlayersReady || room.participants.length < 2}
                    onClick={() => startGame()}
                >
                    내전 시작
                </button>
            )}
            {!isCurrentUserHost && (
                <p className="mt-6 text-text-secondary text-center text-sm">방장이 내전을 시작할 때까지 기다려 주세요.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
