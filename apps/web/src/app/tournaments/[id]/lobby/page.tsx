"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLobbyStore } from "@/stores/lobby-store";
import { useAuthStore } from "@/stores/auth-store";
import { ChatBox } from "@/components/domain/ChatBox";
import { RoomSettingsModal } from "@/components/domain/RoomSettingsModal";
import { UserSettingsModal } from "@/components/domain/UserSettingsModal";
import { TierBadge } from "@/components/domain/TierBadge";
import { ConfirmModal } from "@/components/ui";
import { Users, Crown, Check, X, MessageSquare, Settings, UserMinus, UserCog } from "lucide-react";
import Link from "next/link";
import Image from "next/image";


export default function TournamentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const { connect, disconnect, room, isConnected, error, gameStarting, messages, setReady, startGame, sendMessage, kickParticipant } = useLobbyStore();
  const { user: currentUser } = useAuthStore();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isUserSettingsModalOpen, setIsUserSettingsModalOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; username: string } | null>(null);
  const [isKicking, setIsKicking] = useState(false);

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
        router.push(`/draft/${room.id}`);
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
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div className="relative w-10 h-10 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
                      {p.avatar ? (
                        <Image
                          src={p.avatar}
                          alt={p.username}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-text-tertiary" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        {p.isHost && <Crown className="h-4 w-4 text-accent-gold flex-shrink-0" />}
                        <span className="font-semibold text-text-primary truncate">{p.username}</span>
                      </div>
                      {/* Riot Account & Tier */}
                      {p.riotAccount && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-text-tertiary truncate">
                            {p.riotAccount.gameName}#{p.riotAccount.tagLine}
                          </span>
                          {p.riotAccount.tier && (
                            <TierBadge
                              tier={p.riotAccount.tier}
                              rank={p.riotAccount.rank || undefined}
                              size="sm"
                              showIcon={false}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {p.isReady ? (
                      <span className="flex items-center gap-1 text-xs text-accent-success">
                        <Check className="h-4 w-4" />
                        준비
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-text-tertiary">
                        <X className="h-4 w-4" />
                        대기
                      </span>
                    )}
                    {isCurrentUserHost && p.userId !== currentUser?.id && (
                      <button
                        onClick={() => setKickTarget({ id: p.id, username: p.username })}
                        className="p-1 text-accent-danger hover:text-accent-danger/80"
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
                        className="w-full px-6 py-3 bg-accent-primary hover:bg-accent-hover text-white font-bold rounded-lg transition-colors duration-200 flex items-center justify-center"
                        onClick={() => setIsSettingsModalOpen(true)}
                    >
                        <Settings className="h-5 w-5 mr-2" />
                        방 설정
                    </button>
                )}
                {room.status === 'DRAFT_COMPLETED' ? (
                  <Link
                    href={`/tournaments/${room.id}/bracket`}
                    className="w-full text-center px-6 py-3 bg-accent-success hover:bg-accent-success/90 text-white font-bold rounded-lg transition-colors duration-200 block"
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
                  onClick={() => {
                    disconnect();
                    router.push('/tournaments');
                  }}
                >
                  로비 나가기
                </button>
              </div>

              {/* Personal Settings Button */}
              <div className="mt-4 pt-4 border-t border-bg-tertiary">
                <button
                  onClick={() => setIsUserSettingsModalOpen(true)}
                  className="w-full px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors duration-200 flex items-center justify-center text-sm"
                >
                  <UserCog className="h-4 w-4 mr-2" />
                  내 설정
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

    {/* Kick Confirmation Modal */}
    <ConfirmModal
      isOpen={!!kickTarget}
      onClose={() => setKickTarget(null)}
      onConfirm={async () => {
        if (kickTarget && room) {
          setIsKicking(true);
          try {
            await kickParticipant(room.id, kickTarget.id);
          } finally {
            setIsKicking(false);
            setKickTarget(null);
          }
        }
      }}
      title="참가자 강퇴"
      message={`${kickTarget?.username}님을 강퇴하시겠습니까?`}
      confirmText="강퇴"
      cancelText="취소"
      variant="danger"
      isLoading={isKicking}
    />

    {/* User Settings Modal */}
    <UserSettingsModal
      isOpen={isUserSettingsModalOpen}
      onClose={() => setIsUserSettingsModalOpen(false)}
    />
    </>
  );
}
