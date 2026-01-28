"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLobbyStore } from "@/stores/lobby-store";
import { useAuthStore } from "@/stores/auth-store";
import { ChatBox } from "@/components/domain/ChatBox";
import { RoomSettingsModal } from "@/components/domain/RoomSettingsModal";
import { Users, Crown, Check, X, MessageSquare, Settings, UserMinus } from "lucide-react";
import Link from "next/link";


export default function TournamentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  
  const { connect, disconnect, room, isConnected, error, gameStarting, messages, setReady, startGame, sendMessage, kickParticipant } = useLobbyStore();
  const { user: currentUser } = useAuthStore();
  
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

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
      } else if (room.teamMode === "SNAKE_DRAFT") {
        // TODO: Redirect to snake draft page
        router.push(`/tournaments/${room.id}/draft`);
      }
    }
    if (room?.status === 'DRAFT_COMPLETED') {
        router.push(`/tournaments/${room.id}/bracket`);
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
  const currentUserParticipant = room.participants.find(p => p.userId === currentUser?.id);
  const currentUserIsReady = currentUserParticipant?.isReady || false;
  const allPlayersReady = room.participants.length > 0 && room.participants.every(p => p.isReady);

  return (
    <>
    <div className="flex-grow p-8">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-text-primary">
          {room.name} <span className="text-accent-primary text-xl">#{room.id.slice(0, 4)}</span>
        </h1>
        <p className="text-text-secondary mb-6">
          방장: {room.participants.find(p => p.isHost)?.username || 'N/A'} | 팀 구성 방식: {room.teamMode === "AUCTION" ? "경매" : "스네이크"}
          {room.isPrivate && <span className="ml-2 px-2 py-0.5 bg-bg-tertiary rounded-full text-xs font-semibold">비공개</span>}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Participants List */}
          <div className="lg:col-span-1 bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
            <h2 className="text-2xl font-bold text-text-primary mb-4 flex items-center">
              <Users className="h-6 w-6 mr-2 text-text-secondary" />
              참가자 ({room.participants.length}/{room.maxParticipants})
            </h2>
            <div className="space-y-2">
              {room.participants.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-bg-tertiary p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    {p.isHost && <Crown className="h-5 w-5 text-accent-gold" />}
                    <span className="font-semibold text-text-primary">{p.username}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.isReady ? (
                      <Check className="h-5 w-5 text-accent-success" />
                    ) : (
                      <X className="h-5 w-5 text-accent-danger" />
                    )}
                    {isCurrentUserHost && p.userId !== currentUser?.id && (
                      <button
                        onClick={() => {
                          if (window.confirm(`${p.username}님을 강퇴하시겠습니까?`)) {
                            kickParticipant(room.id, p.id);
                          }
                        }}
                        className="p-1 text-red-500 hover:text-red-700"
                        title="강퇴"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Box */}
          <div className="lg:col-span-1 bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
            <h2 className="text-2xl font-bold text-text-primary mb-4 flex items-center">
              <MessageSquare className="h-6 w-6 mr-2 text-text-secondary" />
              채팅
            </h2>
            <div className="h-[400px]">
              <ChatBox
                messages={messages}
                onSendMessage={sendMessage}
                currentUserId={currentUser?.id}
                className="h-full"
              />
            </div>
          </div>

          {/* Lobby Controls */}
          <div className="lg:col-span-1 bg-bg-secondary border border-bg-tertiary rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-2xl font-bold text-text-primary mb-4">로비 컨트롤</h2>
              <div className="space-y-3">
                {isCurrentUserHost && (
                    <button
                        className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors duration-200 flex items-center justify-center"
                        onClick={() => setIsSettingsModalOpen(true)}
                    >
                        <Settings className="h-5 w-5 mr-2" />
                        방 설정
                    </button>
                )}
                {room.status === 'DRAFT_COMPLETED' ? (
                  <Link
                    href={`/tournaments/${room.id}/bracket`}
                    className="w-full text-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-colors duration-200 block"
                  >
                    대진표 보기
                  </Link>
                ) : (
                  <button 
                    className="w-full px-6 py-3 bg-accent-primary hover:bg-accent-hover text-white font-bold rounded-lg transition-colors duration-200"
                    onClick={() => setReady(!currentUserIsReady)}
                  >
                    {currentUserIsReady ? "준비 취소" : "준비하기"}
                  </button>
                )}
                <button 
                  className="w-full px-6 py-3 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-bold rounded-lg transition-colors duration-200"
                  onClick={() => disconnect()} // Should probably navigate back too
                >
                  로비 나가기
                </button>
              </div>
            </div>
            
            {isCurrentUserHost && room.status === 'WAITING' && (
                <button
                    className="w-full mt-6 px-6 py-3 bg-accent-success hover:bg-accent-success/80 text-white font-bold rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!allPlayersReady || room.participants.length < 2}
                    onClick={() => startGame()}
                >
                    내전 시작
                </button>
            )}
            {!isCurrentUserHost && room.status === 'WAITING' && (
                <p className="mt-6 text-text-secondary text-center text-sm">방장이 내전을 시작할 때까지 기다려 주세요.</p>
            )}
          </div>
        </div>
      </div>
    </div>
    {isCurrentUserHost && (
        <RoomSettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            room={room}
        />
    )}
    </>
  );
}
