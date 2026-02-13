"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { useLobbyStore } from "@/stores/lobby-store";
import { useAuthStore } from "@/stores/auth-store";
import { useFriendStore } from "@/stores/friend-store";
import { ChatBox } from "@/components/domain/ChatBox";
import { RoomSettingsModal } from "@/components/domain/RoomSettingsModal";
import { UserSettingsModal } from "@/components/domain/UserSettingsModal";
import { TierBadge } from "@/components/domain/TierBadge";
import { ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Users, Crown, Check, X, MessageSquare, Settings, UserMinus, UserCog, UserPlus, CheckCircle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { friendApi } from "@/lib/api-client";

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";

// Champion icon URL helper
function getChampionIconUrl(championId: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${championId}.png`;
}

// Position icon URLs from Data Dragon
const POSITION_ICON_URLS = {
  TOP: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-top.svg",
  JUNGLE: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-jungle.svg",
  MID: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-middle.svg",
  MIDDLE: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-middle.svg",
  ADC: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-bottom.svg",
  BOTTOM: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-bottom.svg",
  SUPPORT: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-utility.svg",
  UTILITY: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-utility.svg",
} as const;

const POSITION_LABELS: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  MIDDLE: "미드",
  ADC: "원딜",
  BOTTOM: "원딜",
  SUPPORT: "서포터",
  UTILITY: "서포터",
};

// Position icon component
function PositionIcon({ position, className = "", opacity = 1, showLabel = false }: { position: string; className?: string; opacity?: number; showLabel?: boolean }) {
  const iconUrl = POSITION_ICON_URLS[position as keyof typeof POSITION_ICON_URLS];

  if (!iconUrl) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconUrl}
        alt={position}
        className={`w-4 h-4 brightness-0 invert ${className}`}
        style={{ opacity }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      {showLabel && (
        <span className="text-xs text-text-secondary">{POSITION_LABELS[position] || position}</span>
      )}
    </span>
  );
}

// Champion icon component
function ChampionIcon({ championId, size = 24 }: { championId: string; size?: number }) {
  return (
    <div
      className="rounded-full overflow-hidden bg-bg-tertiary flex-shrink-0 border border-bg-tertiary"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getChampionIconUrl(championId)}
        alt={championId}
        width={size}
        height={size}
        className="w-full h-full object-cover"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    </div>
  );
}

// Player hover tooltip component
function PlayerHoverTooltip({ participant, currentUserId }: { participant: any; currentUserId: string }) {
  const riot = participant.riotAccount;
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const champions = riot?.championPreferences || [];

  // Group champions by role
  const champsByRole: Record<string, string[]> = {};
  for (const cp of champions) {
    if (!champsByRole[cp.role]) champsByRole[cp.role] = [];
    champsByRole[cp.role].push(cp.championId);
  }
  // Sort by order
  for (const cp of champions.sort((a: any, b: any) => a.order - b.order)) {
    // already pushed above, re-sort
  }

  const rolesToShow = [mainRole, subRole].filter(Boolean) as string[];

  return (
    <div className="absolute left-full ml-2 top-0 w-64 bg-bg-elevated border border-bg-tertiary rounded-xl shadow-2xl p-4 z-50 animate-fade-in pointer-events-none">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-bg-tertiary">
        <div className="relative w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
          {participant.avatar ? (
            <Image src={participant.avatar} alt={participant.username} fill className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Users className="h-5 w-5 text-text-tertiary" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {riot ? (
            <>
              <p className="text-sm font-bold text-text-primary truncate">{riot.gameName}<span className="text-text-tertiary font-normal">#{riot.tagLine}</span></p>
              <p className="text-xs text-text-tertiary truncate">{participant.username}</p>
            </>
          ) : (
            <p className="text-sm font-bold text-text-primary truncate">{participant.username}</p>
          )}
          {riot?.tier && (
            <div className="mt-1">
              <TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon />
            </div>
          )}
        </div>
      </div>

      {/* Positions */}
      {rolesToShow.length > 0 && (
        <div className="mb-3 pb-3 border-b border-bg-tertiary">
          <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">포지션</p>
          <div className="flex items-center gap-3">
            {mainRole && (
              <div className="flex items-center gap-1.5">
                <PositionIcon position={mainRole} className="!w-5 !h-5" />
                <span className="text-xs font-medium text-text-primary">{POSITION_LABELS[mainRole] || mainRole}</span>
                <span className="text-[10px] text-accent-primary font-semibold">주</span>
              </div>
            )}
            {subRole && (
              <div className="flex items-center gap-1.5">
                <PositionIcon position={subRole} className="!w-5 !h-5" opacity={0.7} />
                <span className="text-xs font-medium text-text-secondary">{POSITION_LABELS[subRole] || subRole}</span>
                <span className="text-[10px] text-text-tertiary font-semibold">부</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Champion Preferences */}
      {rolesToShow.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">선호 챔피언</p>
          <div className="space-y-2">
            {rolesToShow.map((role) => {
              const champs = champsByRole[role] || [];
              if (champs.length === 0) return null;
              return (
                <div key={role} className="flex items-center gap-2">
                  <PositionIcon position={role} className="!w-3.5 !h-3.5 flex-shrink-0" />
                  <div className="flex items-center gap-1">
                    {champs.slice(0, 4).map((champId, idx) => (
                      <ChampionIcon key={idx} championId={champId} size={28} />
                    ))}
                    {champs.length > 4 && (
                      <span className="text-[10px] text-text-tertiary ml-0.5">+{champs.length - 4}</span>
                    )}
                  </div>
                </div>
              );
            })}
            {rolesToShow.every((role) => !champsByRole[role]?.length) && (
              <p className="text-xs text-text-tertiary italic">등록된 선호 챔피언이 없습니다</p>
            )}
          </div>
        </div>
      )}

      {!riot && (
        <p className="text-xs text-text-tertiary italic">등록된 라이엇 계정이 없습니다</p>
      )}
    </div>
  );
}


export default function TournamentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const { connect, disconnect, room, isConnected, error, gameStarting, messages, setReady, startGame, sendMessage, kickParticipant } = useLobbyStore();
  const { user: currentUser } = useAuthStore();

  const { addToast } = useToast();
  const { friends, fetchFriends } = useFriendStore();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isUserSettingsModalOpen, setIsUserSettingsModalOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; username: string } | null>(null);
  const [isKicking, setIsKicking] = useState(false);
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState<string | null>(null);
  const [sentFriendIds, setSentFriendIds] = useState<Set<string>>(new Set());
  const hasRedirected = useRef(false);

  // Fetch friends list to check existing friendships
  useEffect(() => {
    if (currentUser?.id) fetchFriends();
  }, [currentUser?.id, fetchFriends]);

  // Build set of existing friend user IDs
  const friendUserIds = new Set(
    friends.map((f) => f.userId === currentUser?.id ? f.friendId : f.userId)
  );

  const handleAddFriend = useCallback(async (userId: string) => {
    setAddingFriend(userId);
    try {
      await friendApi.sendRequest(userId);
      setSentFriendIds((prev) => new Set(prev).add(userId));
      addToast("친구 요청을 보냈습니다!", "success");
    } catch (e: any) {
      addToast(e?.response?.data?.message ?? "친구 요청에 실패했습니다.", "error");
    } finally {
      setAddingFriend(null);
    }
  }, [addToast]);

  useEffect(() => {
    if (roomId) {
      connect(roomId);
    }
    return () => {
      disconnect();
    };
  }, [roomId, connect, disconnect]);

  useEffect(() => {
    if (hasRedirected.current || !room) return;

    // gameStarting takes priority: redirect to draft/auction phase
    if (gameStarting) {
      hasRedirected.current = true;
      disconnect();
      if (room.teamMode === "AUCTION") {
        router.push(`/auction/${room.id}`);
      } else {
        router.push(`/draft/${room.id}`);
      }
      return;
    }

    // Already past draft phase: go straight to bracket
    if (room.status === 'IN_PROGRESS') {
      hasRedirected.current = true;
      disconnect();
      router.push(`/tournaments/${room.id}/bracket`);
    }
  }, [gameStarting, room, router, disconnect]);

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
              {room.participants.map(p => {
                const riot = p.riotAccount;
                const mainRole = riot?.mainRole || null;
                const subRole = riot?.subRole || null;
                const isSelf = p.userId === currentUser?.id;
                const isFriend = friendUserIds.has(p.userId);
                const isSent = sentFriendIds.has(p.userId);

                // Get top champions for main role (for compact preview)
                const mainRoleChamps = (riot?.championPreferences || [])
                  .filter((cp) => cp.role === mainRole)
                  .sort((a, b) => a.order - b.order)
                  .slice(0, 3);

                return (
                  <div
                    key={p.id}
                    className="relative flex items-center justify-between bg-bg-tertiary p-3 rounded-lg hover:bg-bg-elevated transition-colors group"
                    onMouseEnter={() => setHoveredPlayer(p.id)}
                    onMouseLeave={() => setHoveredPlayer(null)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
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

                      {/* Info */}
                      <div className="flex flex-col min-w-0 flex-1">
                        {/* Row 1: Name + Tier */}
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {p.isHost && <Crown className="h-3.5 w-3.5 text-accent-gold flex-shrink-0" />}
                          <span className="font-semibold text-sm text-text-primary truncate">
                            {riot ? riot.gameName : p.username}
                          </span>
                          {riot && (
                            <span className="text-xs text-text-tertiary flex-shrink-0">#{riot.tagLine}</span>
                          )}
                          {riot?.tier && (
                            <TierBadge
                              tier={riot.tier}
                              rank={riot.rank || undefined}
                              size="sm"
                              showIcon={false}
                              className="flex-shrink-0"
                            />
                          )}
                        </div>

                        {/* Row 2: Username (if riot) + Positions */}
                        <div className="flex items-center gap-2">
                          {riot && (
                            <span className="text-[11px] text-text-tertiary truncate">{p.username}</span>
                          )}
                          {(mainRole || subRole) && (
                            <div className="flex items-center gap-1">
                              {mainRole && <PositionIcon position={mainRole} className="!w-4 !h-4" />}
                              {subRole && <PositionIcon position={subRole} className="!w-3.5 !h-3.5" opacity={0.5} />}
                            </div>
                          )}
                        </div>

                        {/* Row 3: Champion preview (compact) */}
                        {mainRoleChamps.length > 0 && (
                          <div className="flex items-center gap-0.5 mt-1">
                            {mainRoleChamps.map((cp, idx) => (
                              <ChampionIcon key={idx} championId={cp.championId} size={20} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side: actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {/* Friend Add Button */}
                      {!isSelf && !isFriend && !isSent && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddFriend(p.userId); }}
                          disabled={addingFriend === p.userId}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-accent-primary hover:text-accent-hover hover:bg-accent-primary/10 rounded-md transition-all disabled:opacity-50"
                          title="친구 추가"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      )}
                      {!isSelf && isSent && (
                        <span className="p-1.5 text-text-tertiary" title="친구 요청됨">
                          <CheckCircle className="h-4 w-4" />
                        </span>
                      )}
                      {!isSelf && isFriend && (
                        <span className="p-1.5 text-accent-success" title="친구">
                          <Check className="h-4 w-4" />
                        </span>
                      )}

                      {/* Ready status */}
                      {p.isReady ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-accent-success bg-accent-success/10 px-2 py-1 rounded-md">
                          <Check className="h-3.5 w-3.5" />
                          준비
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium text-text-tertiary bg-bg-secondary px-2 py-1 rounded-md">
                          <X className="h-3.5 w-3.5" />
                          대기
                        </span>
                      )}

                      {/* Kick button (host only) */}
                      {isCurrentUserHost && !isSelf && (
                        <button
                          onClick={() => setKickTarget({ id: p.id, username: p.username })}
                          className="opacity-0 group-hover:opacity-100 p-1 text-accent-danger hover:text-accent-danger/80 transition-opacity"
                          title="강퇴"
                        >
                          <UserMinus className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Hover Tooltip */}
                    {hoveredPlayer === p.id && (
                      <PlayerHoverTooltip participant={p} currentUserId={currentUser?.id || ""} />
                    )}
                  </div>
                );
              })}
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
