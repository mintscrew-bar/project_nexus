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
import { ConfirmModal, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  Users, Crown, Check, X, MessageSquare, Settings,
  UserMinus, UserCog, UserPlus, CheckCircle,
  ArrowLeft, Shield, Swords,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { friendApi } from "@/lib/api-client";

const DDRAGON_VERSION = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";

function getChampionIconUrl(championId: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${championId}.png`;
}

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
  TOP: "탑", JUNGLE: "정글", MID: "미드", MIDDLE: "미드",
  ADC: "원딜", BOTTOM: "원딜", SUPPORT: "서포터", UTILITY: "서포터",
};

function PositionIcon({ position, className = "", opacity = 1, showLabel = false }: { position: string; className?: string; opacity?: number; showLabel?: boolean }) {
  const iconUrl = POSITION_ICON_URLS[position as keyof typeof POSITION_ICON_URLS];
  if (!iconUrl) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconUrl} alt={position} className={`w-4 h-4 brightness-0 invert ${className}`} style={{ opacity }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      {showLabel && <span className="text-xs text-text-secondary">{POSITION_LABELS[position] || position}</span>}
    </span>
  );
}

function ChampionIcon({ championId, size = 24 }: { championId: string; size?: number }) {
  return (
    <div className="rounded-full overflow-hidden bg-bg-tertiary flex-shrink-0 border border-bg-tertiary" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={getChampionIconUrl(championId)} alt={championId} width={size} height={size} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
    </div>
  );
}

function PlayerHoverTooltip({ participant, index, totalCount }: { participant: any; index: number; currentUserId: string; totalCount: number }) {
  const riot = participant.riotAccount;
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const champions = riot?.championPreferences || [];

  const champsByRole: Record<string, string[]> = {};
  for (const cp of champions) {
    if (!champsByRole[cp.role]) champsByRole[cp.role] = [];
    champsByRole[cp.role].push(cp.championId);
  }
  for (const _cp of champions.sort((a: any, b: any) => a.order - b.order)) { /* sorted in-place */ }
  const rolesToShow = [mainRole, subRole].filter(Boolean) as string[];

  const showOnLeft = index >= totalCount / 2;

  return (
    <div className={`absolute top-0 w-64 bg-bg-elevated border border-bg-tertiary rounded-xl shadow-2xl p-4 z-50 animate-fade-in pointer-events-none ${showOnLeft ? 'right-full mr-2' : 'left-full ml-2'}`}>
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-bg-tertiary">
        <div className="relative w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
          {participant.avatar ? (
            <Image src={participant.avatar} alt={participant.username} fill className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Users className="h-5 w-5 text-text-tertiary" /></div>
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
          {riot?.tier && <div className="mt-1"><TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon /></div>}
        </div>
      </div>
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
                    {champs.slice(0, 4).map((champId, idx) => <ChampionIcon key={idx} championId={champId} size={28} />)}
                    {champs.length > 4 && <span className="text-[10px] text-text-tertiary ml-0.5">+{champs.length - 4}</span>}
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
      {!riot && <p className="text-xs text-text-tertiary italic">등록된 라이엇 계정이 없습니다</p>}
    </div>
  );
}

/* ─── Participant Card ─── */
function ParticipantCard({
  p, index, totalCount, isCurrentUserHost, isSelf, isFriend, isSent, addingFriend,
  hoveredPlayer, setHoveredPlayer, handleAddFriend, setKickTarget, currentUserId,
}: any) {
  const riot = p.riotAccount;
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const mainRoleChamps = (riot?.championPreferences || [])
    .filter((cp: any) => cp.role === mainRole)
    .sort((a: any, b: any) => a.order - b.order)
    .slice(0, 3);

  return (
    <div
      className="relative flex items-center justify-between bg-bg-tertiary p-3 rounded-lg hover:bg-bg-elevated transition-colors group animate-slide-in-right"
      onMouseEnter={() => setHoveredPlayer(p.id)}
      onMouseLeave={() => setHoveredPlayer(null)}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative w-10 h-10 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
          {p.avatar ? (
            <Image src={p.avatar} alt={p.username} fill className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Users className="h-5 w-5 text-text-tertiary" /></div>
          )}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            {p.isHost && <Crown className="h-3.5 w-3.5 text-accent-gold flex-shrink-0" />}
            <span className="font-semibold text-sm text-text-primary truncate">{riot ? riot.gameName : p.username}</span>
            {riot && <span className="text-xs text-text-tertiary flex-shrink-0">#{riot.tagLine}</span>}
            {riot?.tier && <TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon={false} className="flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-2">
            {riot && <span className="text-[11px] text-text-tertiary truncate">{p.username}</span>}
            {(mainRole || subRole) && (
              <div className="flex items-center gap-1">
                {mainRole && <PositionIcon position={mainRole} className="!w-4 !h-4" />}
                {subRole && <PositionIcon position={subRole} className="!w-3.5 !h-3.5" opacity={0.5} />}
              </div>
            )}
          </div>
          {mainRoleChamps.length > 0 && (
            <div className="flex items-center gap-0.5 mt-1">
              {mainRoleChamps.map((cp: any, idx: number) => <ChampionIcon key={idx} championId={cp.championId} size={20} />)}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        {!isSelf && !isFriend && !isSent && (
          <button onClick={(e) => { e.stopPropagation(); handleAddFriend(p.userId); }} disabled={addingFriend === p.userId} className="opacity-0 group-hover:opacity-100 p-1.5 text-accent-primary hover:text-accent-hover hover:bg-accent-primary/10 rounded-md transition-all disabled:opacity-50" title="친구 추가">
            <UserPlus className="h-4 w-4" />
          </button>
        )}
        {!isSelf && isSent && <span className="p-1.5 text-text-tertiary" title="친구 요청됨"><CheckCircle className="h-4 w-4" /></span>}
        {!isSelf && isFriend && <span className="p-1.5 text-accent-success" title="친구"><Check className="h-4 w-4" /></span>}
        {p.isReady ? (
          <span className="flex items-center gap-1 text-xs font-medium text-accent-success bg-accent-success/10 px-2 py-1 rounded-md">
            <Check className="h-3.5 w-3.5 animate-bounce-in" />준비
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-text-tertiary bg-bg-secondary px-2 py-1 rounded-md">
            <X className="h-3.5 w-3.5" />대기
          </span>
        )}
        {isCurrentUserHost && !isSelf && (
          <button onClick={() => setKickTarget({ id: p.id, username: p.username })} className="opacity-0 group-hover:opacity-100 p-1 text-accent-danger hover:text-accent-danger/80 transition-opacity" title="강퇴">
            <UserMinus className="h-4 w-4" />
          </button>
        )}
      </div>
      {hoveredPlayer === p.id && <PlayerHoverTooltip participant={p} index={index} currentUserId={currentUserId} totalCount={totalCount} />}
    </div>
  );
}

/* ─── Empty Slot ─── */
function EmptySlot({ index }: { index: number }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-bg-elevated/60"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="w-10 h-10 rounded-full bg-bg-tertiary/40 flex items-center justify-center flex-shrink-0">
        <Users className="h-4 w-4 text-text-muted" />
      </div>
      <span className="text-sm text-text-muted">참가자 대기 중...</span>
    </div>
  );
}


/* ─── Main Page ─── */
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
  const [mobileTab, setMobileTab] = useState<string>("participants");
  const hasRedirected = useRef(false);

  useEffect(() => { if (currentUser?.id) fetchFriends(); }, [currentUser?.id, fetchFriends]);

  const friendUserIds = new Set(friends.map((f) => f.userId === currentUser?.id ? f.friendId : f.userId));

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

  useEffect(() => { if (roomId) connect(roomId); return () => { disconnect(); }; }, [roomId, connect, disconnect]);

  useEffect(() => {
    if (hasRedirected.current || !room) return;
    if (gameStarting) {
      hasRedirected.current = true;
      disconnect();
      router.push(room.teamMode === "AUCTION" ? `/auction/${room.id}` : `/draft/${room.id}`);
      return;
    }
    if (room.status === 'IN_PROGRESS') {
      hasRedirected.current = true;
      disconnect();
      router.push(`/tournaments/${room.id}/bracket`);
    }
  }, [gameStarting, room, router, disconnect]);

  /* ─── Loading / Error States ─── */
  if (!isConnected && !error) {
    return (
      <div className="flex-grow flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3 animate-fade-in">
          <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">로비에 연결하는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow flex items-center justify-center p-8">
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-8 max-w-md text-center">
          <p className="text-accent-danger mb-4">로비에 연결할 수 없습니다: {error}</p>
          <Link href="/tournaments" className="btn-primary inline-block">로비 목록으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex-grow flex items-center justify-center p-8">
        <p className="text-text-secondary animate-fade-in">방 정보를 기다리는 중...</p>
      </div>
    );
  }

  const isCurrentUserHost = room.hostId === currentUser?.id;
  const currentUserParticipant = room.participants.find((p: any) => p.userId === currentUser?.id);
  const currentUserIsReady = currentUserParticipant?.isReady || false;
  const readyCount = room.participants.filter((p: any) => p.isReady).length;
  const totalParticipants = room.participants.length;
  const allPlayersReady = totalParticipants > 0 && readyCount === totalParticipants;
  const emptySlots = Math.max(0, room.maxParticipants - totalParticipants);
  const readyPercent = totalParticipants > 0 ? (readyCount / totalParticipants) * 100 : 0;

  const teamModeLabel = room.teamMode === "AUCTION" ? "경매" : "스네이크";
  const bracketLabel = room.bracketFormat === "SINGLE_ELIMINATION" ? "싱글 엘리미네이션"
    : room.bracketFormat === "DOUBLE_ELIMINATION" ? "더블 엘리미네이션"
    : room.bracketFormat === "ROUND_ROBIN" ? "라운드 로빈" : room.bracketFormat || "미정";

  /* ─── Participants List ─── */
  const participantsList = (
    <div className="space-y-2">
      {room.participants.map((p: any, idx: number) => {
        const isSelf = p.userId === currentUser?.id;
        return (
          <ParticipantCard
            key={p.id} p={p} index={idx} totalCount={totalParticipants}
            isCurrentUserHost={isCurrentUserHost} isSelf={isSelf}
            isFriend={friendUserIds.has(p.userId)} isSent={sentFriendIds.has(p.userId)}
            addingFriend={addingFriend} hoveredPlayer={hoveredPlayer}
            setHoveredPlayer={setHoveredPlayer} handleAddFriend={handleAddFriend}
            setKickTarget={setKickTarget} currentUserId={currentUser?.id || ""}
          />
        );
      })}
      {Array.from({ length: emptySlots }).map((_, i) => <EmptySlot key={`empty-${i}`} index={i} />)}
    </div>
  );

  /* ─── Chat Panel ─── */
  const chatPanel = (
    <ChatBox messages={messages} onSendMessage={sendMessage} currentUserId={currentUser?.id} className="h-full" />
  );

  return (
    <>
      <div className="flex flex-col flex-grow min-h-0">
        {/* ═══ Room Header ═══ */}
        <header className="bg-bg-secondary border-b border-bg-tertiary px-4 py-3 lg:px-6">
          <div className="container mx-auto flex items-center justify-between gap-4">
            {/* Left: back + room info */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => { disconnect(); router.push('/tournaments'); }}
                className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors flex-shrink-0"
                title="로비 나가기"
              >
                <ArrowLeft className="h-5 w-5 text-text-secondary" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-text-primary truncate">{room.name}</h1>
                  <span className="text-accent-primary text-sm font-mono">#{room.id.slice(0, 4)}</span>
                  {room.isPrivate && (
                    <span className="px-1.5 py-0.5 bg-bg-tertiary rounded text-[10px] font-semibold text-text-secondary flex items-center gap-1">
                      <Shield className="h-3 w-3" />비공개
                    </span>
                  )}
                </div>
                {/* Badges row - visible on md+ */}
                <div className="hidden md:flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary rounded-full text-xs text-text-secondary">
                    <Swords className="h-3 w-3" />{teamModeLabel}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary rounded-full text-xs text-text-secondary">
                    <Users className="h-3 w-3" />{totalParticipants}/{room.maxParticipants}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary rounded-full text-xs text-text-secondary">
                    {bracketLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: setting buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setIsUserSettingsModalOpen(true)}
                className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
                title="내 설정"
              >
                <UserCog className="h-5 w-5" />
              </button>
              {isCurrentUserHost && (
                <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
                  title="방 설정"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ═══ Ready Progress Bar ═══ */}
        <div className="bg-bg-secondary/80 border-b border-bg-tertiary px-4 py-2.5 lg:px-6">
          <div className="container mx-auto flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-secondary">준비 현황</span>
                <span className="text-xs font-bold text-text-primary">
                  {readyCount}/{totalParticipants}
                  {allPlayersReady && <span className="ml-1 text-accent-success">✓ 전원 준비 완료</span>}
                </span>
              </div>
              <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 animate-progress-fill ${allPlayersReady ? 'bg-accent-success' : 'bg-accent-primary'}`}
                  style={{ width: `${readyPercent}%` }}
                />
              </div>
            </div>
            {room.status !== 'DRAFT_COMPLETED' && (
              <button
                className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all duration-200 flex-shrink-0 ${
                  currentUserIsReady
                    ? 'bg-bg-tertiary text-text-secondary hover:bg-bg-elevated'
                    : 'bg-accent-primary hover:bg-accent-hover text-white'
                }`}
                onClick={() => setReady(!currentUserIsReady)}
              >
                {currentUserIsReady ? "준비 취소" : "준비하기"}
              </button>
            )}
            {room.status === 'DRAFT_COMPLETED' && (
              <Link href={`/tournaments/${room.id}/bracket`} className="px-4 py-1.5 text-sm font-bold rounded-lg bg-accent-success hover:bg-accent-success/90 text-white flex-shrink-0">
                대진표 보기
              </Link>
            )}
          </div>
        </div>

        {/* ═══ Main Content: Desktop 2-col / Mobile Tabs ═══ */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* Desktop layout (lg+) */}
          <div className="hidden lg:flex h-full container mx-auto px-6 py-4 gap-4">
            {/* Participants: 2/3 */}
            <section className="flex-[2] min-w-0 bg-bg-secondary border border-bg-tertiary rounded-xl flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b border-bg-tertiary flex items-center justify-between">
                <h2 className="font-bold text-text-primary flex items-center gap-2">
                  <Users className="h-5 w-5 text-text-secondary" />
                  참가자
                  <span className="text-sm font-normal text-text-tertiary">{totalParticipants}/{room.maxParticipants}</span>
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {participantsList}
              </div>
            </section>

            {/* Chat: 1/3 */}
            <section className="flex-[1] min-w-0 bg-bg-secondary border border-bg-tertiary rounded-xl flex flex-col overflow-hidden">
              <div className="px-5 py-3 border-b border-bg-tertiary">
                <h2 className="font-bold text-text-primary flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-text-secondary" />
                  채팅
                </h2>
              </div>
              <div className="flex-1 min-h-0">
                {chatPanel}
              </div>
            </section>
          </div>

          {/* Mobile layout (< lg) */}
          <div className="lg:hidden flex flex-col h-full">
            <Tabs defaultValue="participants" value={mobileTab} onValueChange={setMobileTab} className="flex flex-col h-full">
              <div className="px-4 pt-3 flex-shrink-0">
                <TabsList className="w-full">
                  <TabsTrigger value="participants" className="flex-1 justify-center">
                    <Users className="h-4 w-4 mr-1.5" />참가자 ({totalParticipants})
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="flex-1 justify-center relative">
                    <MessageSquare className="h-4 w-4 mr-1.5" />채팅
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="participants" className="flex-1 overflow-y-auto p-4">
                {participantsList}
              </TabsContent>
              <TabsContent value="chat" className="flex-1 min-h-0 p-4">
                {chatPanel}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ═══ Sticky Bottom Action Bar ═══ */}
        <footer className="bg-bg-secondary border-t border-bg-tertiary px-4 py-3 lg:px-6 flex-shrink-0">
          <div className="container mx-auto flex items-center justify-between gap-3">
            {/* Mobile: ready button */}
            <div className="lg:hidden">
              {room.status !== 'DRAFT_COMPLETED' && (
                <button
                  className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
                    currentUserIsReady
                      ? 'bg-bg-tertiary text-text-secondary hover:bg-bg-elevated'
                      : 'bg-accent-primary hover:bg-accent-hover text-white'
                  }`}
                  onClick={() => setReady(!currentUserIsReady)}
                >
                  {currentUserIsReady ? "준비 취소" : "준비하기"}
                </button>
              )}
            </div>

            <button
              className="px-5 py-2.5 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-medium rounded-lg transition-colors text-sm"
              onClick={() => { disconnect(); router.push('/tournaments'); }}
            >
              로비 나가기
            </button>

            <div className="flex items-center gap-3">
              {isCurrentUserHost && room.status === 'WAITING' && (
                <button
                  className={`px-6 py-2.5 font-bold rounded-lg transition-all text-sm text-white ${
                    allPlayersReady && totalParticipants >= 2
                      ? 'bg-accent-success hover:bg-accent-success/90 animate-glow-success'
                      : 'bg-accent-success/50 cursor-not-allowed opacity-60'
                  }`}
                  disabled={!allPlayersReady || totalParticipants < 2}
                  onClick={() => startGame()}
                >
                  내전 시작
                </button>
              )}
              {!isCurrentUserHost && room.status === 'WAITING' && (
                <p className="text-text-tertiary text-xs hidden sm:block">방장이 내전을 시작할 때까지 대기 중...</p>
              )}
            </div>
          </div>
        </footer>
      </div>

      {/* ═══ Modals ═══ */}
      {isCurrentUserHost && (
        <RoomSettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} room={room} />
      )}
      <ConfirmModal
        isOpen={!!kickTarget}
        onClose={() => setKickTarget(null)}
        onConfirm={async () => {
          if (kickTarget && room) {
            setIsKicking(true);
            try { await kickParticipant(room.id, kickTarget.id); }
            finally { setIsKicking(false); setKickTarget(null); }
          }
        }}
        title="참가자 강퇴"
        message={`${kickTarget?.username}님을 강퇴하시겠습니까?`}
        confirmText="강퇴"
        cancelText="취소"
        variant="danger"
        isLoading={isKicking}
      />
      <UserSettingsModal isOpen={isUserSettingsModalOpen} onClose={() => setIsUserSettingsModalOpen(false)} />
    </>
  );
}
