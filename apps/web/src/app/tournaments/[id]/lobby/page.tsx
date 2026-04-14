"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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
  ArrowLeft, Shield, Swords, Volume2, VolumeX,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { friendApi, adminApi, roomApi } from "@/lib/api-client";
import { getChampionIcon, getChampionIconById } from "@/components/matches/match-utils";

function getChampionIconUrl(championId: string) {
  const raw = String(championId ?? "").trim();
  if (!raw) return "";

  // DB의 championPreference.championId가 숫자 문자열인 경우(예: "103")
  // 매치 유틸의 ID->key 매핑을 사용해 실제 아이콘 경로를 구한다.
  if (/^\d+$/.test(raw)) {
    return getChampionIconById(Number(raw));
  }

  // 문자열 키인 경우(예: "Ahri")는 그대로 챔피언 키 경로를 사용
  return getChampionIcon(raw);
}

const POSITION_ICON_URLS = {
  TOP: "/icons/positions/position-top.svg",
  JUNGLE: "/icons/positions/position-jungle.svg",
  MID: "/icons/positions/position-middle.svg",
  MIDDLE: "/icons/positions/position-middle.svg",
  ADC: "/icons/positions/position-bottom.svg",
  BOTTOM: "/icons/positions/position-bottom.svg",
  SUPPORT: "/icons/positions/position-utility.svg",
  UTILITY: "/icons/positions/position-utility.svg",
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
  const iconUrl = getChampionIconUrl(championId);
  return (
    <div className="rounded-full overflow-hidden bg-bg-tertiary flex-shrink-0 border border-bg-tertiary" style={{ width: size, height: size }}>
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={championId}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={(e) => {
            // 로드 실패 시 빈 원(skeleton처럼 보이는 상태) 대신 fallback 표시
            e.currentTarget.style.display = "none";
            const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (fallback) fallback.style.display = "flex";
          }}
        />
      ) : null}
      <div
        className="w-full h-full hidden items-center justify-center bg-bg-elevated text-[10px] font-bold text-text-muted"
        aria-label="champion-fallback"
      >
        ?
      </div>
    </div>
  );
}

function PlayerHoverTooltip({ participant, anchorRect }: { participant: any; anchorRect: DOMRect }) {
  const riot = participant.riotAccount;
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const champions = [...(riot?.championPreferences || [])].sort((a: any, b: any) => a.order - b.order);

  const champsByRole: Record<string, string[]> = {};
  for (const cp of champions) {
    if (!champsByRole[cp.role]) champsByRole[cp.role] = [];
    champsByRole[cp.role].push(cp.championId);
  }

  // mainRole, subRole 우선 + 챔피언이 등록된 나머지 역할도 포함
  const rolesToShow: string[] = [];
  if (mainRole) rolesToShow.push(mainRole);
  if (subRole && subRole !== mainRole) rolesToShow.push(subRole);
  for (const role of Object.keys(champsByRole)) {
    if (!rolesToShow.includes(role)) rolesToShow.push(role);
  }

  const hasRoles = mainRole || subRole;
  const hasChampions = champions.length > 0;

  // fixed 포지셔닝: overflow-hidden 컨테이너 밖으로 탈출
  const TOOLTIP_W = 256;
  const TOOLTIP_OFFSET = 8;
  const spaceOnRight = window.innerWidth - anchorRect.right;
  const left = spaceOnRight >= TOOLTIP_W + TOOLTIP_OFFSET
    ? anchorRect.right + TOOLTIP_OFFSET
    : anchorRect.left - TOOLTIP_W - TOOLTIP_OFFSET;
  const top = Math.min(anchorRect.top, window.innerHeight - 320);

  return createPortal(
    <div
      className="fixed w-64 bg-bg-elevated border border-bg-tertiary rounded-xl shadow-2xl p-4 z-[9999] animate-fade-in pointer-events-none"
      style={{ left, top }}
    >
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
      {hasRoles && (
        <div className={`${hasChampions ? 'mb-3 pb-3 border-b border-bg-tertiary' : ''}`}>
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
      {rolesToShow.length > 0 && hasChampions && (
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
          </div>
        </div>
      )}
      {riot && !hasRoles && !hasChampions && (
        <p className="text-xs text-text-tertiary italic">등록된 포지션/선호 챔피언이 없습니다</p>
      )}
      {!riot && <p className="text-xs text-text-tertiary italic">등록된 라이엇 계정이 없습니다</p>}
    </div>,
    document.body
  );
}

/* ─── Participant Card ─── */
function ParticipantCard({
  p, isCurrentUserHost, isSelf, isFriend, isSent, addingFriend,
  hoveredPlayer, setHoveredPlayer, handleAddFriend, setKickTarget, currentUserId,
}: any) {
  const riot = p.riotAccount;
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const mainRoleChamps = (riot?.championPreferences || [])
    .filter((cp: any) => cp.role === mainRole)
    .sort((a: any, b: any) => a.order - b.order)
    .slice(0, 3);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (cardRef.current) {
      setHoveredPlayer({ id: p.id, rect: cardRef.current.getBoundingClientRect(), participant: p });
    }
  };

  return (
    <div
      ref={cardRef}
      className="relative flex items-center justify-between bg-bg-tertiary p-3 rounded-lg hover:bg-bg-elevated transition-colors group animate-slide-in-right"
      onMouseEnter={handleMouseEnter}
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
            {/^testbot_\d+$/.test(p.username) && (
              <span className="text-[9px] font-bold bg-bg-secondary text-text-muted px-1 py-0.5 rounded border border-bg-elevated flex-shrink-0">BOT</span>
            )}
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
        {/* Discord 음성채널 참가 상태 뱃지 (inVoice가 정의된 경우만 표시) */}
        {p.inVoice !== undefined && (
          p.inVoice ? (
            <span title="음성채널 참가 중" className="flex items-center text-green-400">
              <Volume2 className="h-4 w-4" />
            </span>
          ) : (
            <span title="음성채널 미참가" className="flex items-center text-text-tertiary/50">
              <VolumeX className="h-4 w-4" />
            </span>
          )
        )}
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


/* ─── Compact Participant Card (for large rooms) ─── */
function CompactParticipantCard({
  p, isCurrentUserHost, isSelf, isFriend, isSent, addingFriend,
  setHoveredPlayer, handleAddFriend, setKickTarget, cardRef: _,
}: any) {
  const riot = p.riotAccount;
  const mainRole = riot?.mainRole || null;
  const compactRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (compactRef.current) {
      setHoveredPlayer({ id: p.id, rect: compactRef.current.getBoundingClientRect(), participant: p });
    }
  };

  return (
    <div
      ref={compactRef}
      className="relative flex items-center gap-2 bg-bg-tertiary px-2.5 py-2 rounded-lg hover:bg-bg-elevated transition-colors group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHoveredPlayer(null)}
    >
      {/* Avatar */}
      <div className="relative w-7 h-7 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
        {p.avatar ? (
          <Image src={p.avatar} alt={p.username} fill className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Users className="h-3 w-3 text-text-tertiary" /></div>
        )}
      </div>

      {/* Name + tier + position */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {p.isHost && <Crown className="h-3 w-3 text-accent-gold flex-shrink-0" />}
          <span className="font-medium text-xs text-text-primary truncate">
            {riot ? riot.gameName : p.username}
          </span>
          {riot?.tier && <TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon={false} className="flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-1">
          {mainRole && <PositionIcon position={mainRole} className="!w-3 !h-3" />}
          {riot && <span className="text-[10px] text-text-tertiary truncate">{p.username}</span>}
        </div>
      </div>

      {/* Ready status + actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {!isSelf && !isFriend && !isSent && (
          <button onClick={(e) => { e.stopPropagation(); handleAddFriend(p.userId); }} disabled={addingFriend === p.userId} className="opacity-0 group-hover:opacity-100 p-1 text-accent-primary hover:text-accent-hover rounded transition-all disabled:opacity-50" title="친구 추가">
            <UserPlus className="h-3 w-3" />
          </button>
        )}
        {/* Discord 음성채널 참가 상태 뱃지 (inVoice가 정의된 경우만 표시) */}
        {p.inVoice !== undefined && (
          p.inVoice ? (
            <span title="음성채널 참가 중" className="flex items-center">
              <Volume2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
            </span>
          ) : (
            <span title="음성채널 미참가" className="flex items-center">
              <VolumeX className="h-3.5 w-3.5 text-text-tertiary/50 flex-shrink-0" />
            </span>
          )
        )}
        {p.isReady ? (
          <Check className="h-3.5 w-3.5 text-accent-success flex-shrink-0" />
        ) : (
          <X className="h-3.5 w-3.5 text-text-tertiary/50 flex-shrink-0" />
        )}
        {isCurrentUserHost && !isSelf && (
          <button onClick={() => setKickTarget({ id: p.id, username: p.username })} className="opacity-0 group-hover:opacity-100 p-0.5 text-accent-danger hover:text-accent-danger/80 transition-opacity" title="강퇴">
            <UserMinus className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function TournamentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const { connect, disconnect, room, isConnected, error, gameStarting, messages, setReady, startGame, sendMessage, kickParticipant, toggleSpectator } = useLobbyStore();
  const { user: currentUser } = useAuthStore();
  const { addToast } = useToast();
  const { friends, fetchFriends } = useFriendStore();

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isUserSettingsModalOpen, setIsUserSettingsModalOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; username: string } | null>(null);
  const [isKicking, setIsKicking] = useState(false);
  const [isAddingBot, setIsAddingBot] = useState(false);
  const [hoveredPlayer, setHoveredPlayer] = useState<{ id: string; rect: DOMRect; participant: any } | null>(null);
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

  const handleAddBot = useCallback(async () => {
    if (!room) return;
    setIsAddingBot(true);
    try {
      await adminApi.addBotToRoom(room.id, 1);
      // 방 데이터 재조회 후 로비 store에 직접 반영
      const updated = await roomApi.getRoom(room.id);
      useLobbyStore.setState({ room: updated });
      addToast("봇을 추가했습니다.", "success");
    } catch (e: any) {
      addToast(e?.response?.data?.message ?? "봇 추가에 실패했습니다.", "error");
    } finally {
      setIsAddingBot(false);
    }
  }, [room, addToast]);

  // connect/disconnect는 zustand 스토어 함수로 참조가 안정적이므로 dependency에서 제외
  useEffect(() => {
    if (roomId) connect(roomId);
    return () => { disconnect(); };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasRedirected.current || !room) return;
    if (gameStarting) {
      hasRedirected.current = true;
      disconnect({ skipLeave: true });
      router.push(room.teamMode === "AUCTION" ? `/auction/${room.id}` : `/draft/${room.id}`);
      return;
    }
    if (room.status === 'DRAFT' || room.status === 'TEAM_SELECTION') {
      hasRedirected.current = true;
      disconnect({ skipLeave: true });
      router.push(room.teamMode === "AUCTION" ? `/auction/${room.id}` : `/draft/${room.id}`);
      return;
    }
    if (room.status === 'ROLE_SELECTION') {
      hasRedirected.current = true;
      disconnect({ skipLeave: true });
      router.push(`/role-selection/${room.id}`);
      return;
    }
    // IN_PROGRESS인 경우에만 bracket으로 리다이렉트.
    // COMPLETED는 returnToLobby API 호출 후 WAITING으로 리셋되어 오기 때문에
    // 여기서 리다이렉트하면 무한 루프가 발생한다.
    if (room.status === 'IN_PROGRESS') {
      hasRedirected.current = true;
      disconnect({ skipLeave: true });
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
    // Parse error type and message
    const [errorType, errorMessage] = error.includes("::") ? error.split("::") : ["UNKNOWN", error];
    const isDiscordError = errorType === "DISCORD_NOT_LINKED";
    const isRiotError = errorType === "RIOT_NOT_LINKED";

    return (
      <div className="flex-grow flex items-center justify-center p-8">
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-8 max-w-md">
          <div className="text-center mb-6">
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
              isDiscordError || isRiotError ? "bg-accent-warning/10" : "bg-accent-danger/10"
            }`}>
              <Shield className={`h-8 w-8 ${
                isDiscordError || isRiotError ? "text-accent-warning" : "text-accent-danger"
              }`} />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-2">
              {isDiscordError && "Discord 계정 연동 필요"}
              {isRiotError && "Riot 계정 연동 필요"}
              {!isDiscordError && !isRiotError && "로비 입장 실패"}
            </h2>
            <p className="text-text-secondary">{errorMessage}</p>
          </div>

          <div className="flex flex-col gap-2">
            {isDiscordError && (
              <button
                onClick={() => router.push("/settings")}
                className="w-full px-4 py-3 bg-accent-primary text-white rounded-lg font-medium hover:bg-accent-primary/90 transition-colors"
              >
                설정에서 Discord 연동하기
              </button>
            )}
            {isRiotError && (
              <button
                onClick={() => router.push("/profile")}
                className="w-full px-4 py-3 bg-accent-primary text-white rounded-lg font-medium hover:bg-accent-primary/90 transition-colors"
              >
                프로필에서 Riot 계정 연동하기
              </button>
            )}
            <Link
              href="/tournaments"
              className="w-full px-4 py-3 bg-bg-tertiary text-text-primary text-center rounded-lg font-medium hover:bg-bg-elevated transition-colors"
            >
              로비 목록으로 돌아가기
            </Link>
          </div>
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
  const currentUserIsSpectator = currentUserParticipant?.role === "SPECTATOR";

  // 플레이어와 관전자 분리
  const players = room.participants.filter((p: any) => p.role !== "SPECTATOR");
  const spectators = room.participants.filter((p: any) => p.role === "SPECTATOR");

  const readyCount = players.filter((p: any) => p.isReady).length;
  const totalPlayers = players.length;
  const allPlayersReady = totalPlayers > 0 && readyCount === totalPlayers;
  const emptySlots = Math.max(0, room.maxParticipants - totalPlayers);
  const readyPercent = totalPlayers > 0 ? (readyCount / totalPlayers) * 100 : 0;

  const teamModeLabel = room.teamMode === "AUCTION" ? "경매" : "스네이크";
  const bracketLabel = room.bracketFormat === "SINGLE_ELIMINATION" ? "싱글 엘리미네이션"
    : room.bracketFormat === "DOUBLE_ELIMINATION" ? "더블 엘리미네이션"
    : room.bracketFormat === "ROUND_ROBIN" ? "라운드 로빈" : room.bracketFormat || "미정";

  // Discord 음성채널 연동 여부: 참가자 중 inVoice가 정의된 유저가 있으면 이 방은 Discord 채널이 있는 것
  const hasDiscordVoice = room.participants.some((p: any) => p.inVoice !== undefined);
  // Discord 채널이 있는 경우, 준비된 참가자 중 botbot이 아닌 유저가 모두 음성채널에 있어야 시작 가능
  const allInVoice = !hasDiscordVoice || room.participants
    .filter((p: any) => p.isReady && !/^testbot_\d+$/.test(p.username))
    .every((p: any) => p.inVoice !== false);

    /* ─── Participants List ─── */
  const participantsList = (
    <div>
      {/* 관전자 전환 버튼 */}
      {room.allowSpectators && room.status === "WAITING" && currentUserParticipant && (
        <button
          onClick={() => toggleSpectator((err) => addToast(err, "error"))}
          className={`w-full mb-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
            currentUserIsSpectator
              ? "border-accent-primary/30 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20"
              : "border-bg-tertiary bg-bg-tertiary/50 text-text-secondary hover:bg-bg-tertiary"
          }`}
        >
          {currentUserIsSpectator ? "플레이어로 전환" : "관전자로 전환"}
        </button>
      )}

      {/* 플레이어 목록 */}
      <div className="grid grid-cols-2 gap-1.5">
        {players.map((p: any) => {
          const isSelf = p.userId === currentUser?.id;
          return (
            <CompactParticipantCard
              key={p.id} p={p}
              isCurrentUserHost={isCurrentUserHost} isSelf={isSelf}
              isFriend={friendUserIds.has(p.userId)} isSent={sentFriendIds.has(p.userId)}
              addingFriend={addingFriend}
              setHoveredPlayer={setHoveredPlayer}
              handleAddFriend={handleAddFriend}
              setKickTarget={setKickTarget}
              cardRef={null}
            />
          );
        })}
      </div>
      {emptySlots > 0 && (
        <div className="mt-2 text-center py-2 rounded-lg border border-dashed border-bg-elevated/60 text-sm text-text-muted">
          <Users className="h-4 w-4 inline mr-1.5 opacity-50" />
          {emptySlots}자리 남음
        </div>
      )}

      {/* 관전자 섹션 */}
      {spectators.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">관전자</span>
            <span className="text-xs text-text-muted">{spectators.length}명</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {spectators.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-bg-tertiary/50 rounded-lg text-sm text-text-secondary"
              >
                {p.avatar ? (
                  <Image src={p.avatar} alt="" width={20} height={20} className="rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] font-bold text-text-muted">
                    {p.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <span className="truncate max-w-[80px]">{p.username}</span>
                {p.userId === currentUser?.id && (
                  <span className="text-[10px] text-accent-primary font-semibold">(나)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ─── Chat Panel ─── */
  const chatPanel = (
    <ChatBox messages={messages} onSendMessage={sendMessage} currentUserId={currentUser?.id} className="h-full" />
  );

  return (
    <>
      {/* 참가자 호버 툴팁 — overflow-hidden 탈출을 위해 페이지 최상위에서 렌더링 */}
      {hoveredPlayer && (
        <PlayerHoverTooltip participant={hoveredPlayer.participant} anchorRect={hoveredPlayer.rect} />
      )}
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
                    <Users className="h-3 w-3" />{totalPlayers}/{room.maxParticipants}{spectators.length > 0 && ` (+${spectators.length} 관전)`}
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
                  {readyCount}/{totalPlayers}
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
            {room.status !== 'DRAFT_COMPLETED' && !currentUserIsSpectator && (
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
            {room.status !== 'DRAFT_COMPLETED' && currentUserIsSpectator && (
              <span className="px-4 py-1.5 text-sm font-medium rounded-lg bg-bg-tertiary text-text-muted flex-shrink-0">
                관전 중
              </span>
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
                  <span className="text-sm font-normal text-text-tertiary">{totalPlayers}/{room.maxParticipants}</span>
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
                    <Users className="h-4 w-4 mr-1.5" />참가자 ({totalPlayers})
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
              {room.status !== 'DRAFT_COMPLETED' && !currentUserIsSpectator && (
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
              {room.status !== 'DRAFT_COMPLETED' && currentUserIsSpectator && (
                <span className="px-4 py-2 text-sm font-medium rounded-lg bg-bg-tertiary text-text-muted">
                  관전 중
                </span>
              )}
            </div>

            <button
              className="px-5 py-2.5 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-medium rounded-lg transition-colors text-sm"
              onClick={() => { disconnect(); router.push('/tournaments'); }}
            >
              로비 나가기
            </button>

            <div className="flex items-center gap-3">
              {/* 어드민 전용: 봇 추가 버튼 */}
              {currentUser?.role === 'ADMIN' && room.status === 'WAITING' && totalPlayers < room.maxParticipants && (
                <button
                  onClick={handleAddBot}
                  disabled={isAddingBot}
                  className="px-4 py-2.5 text-sm font-medium rounded-lg border border-bg-tertiary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors disabled:opacity-50"
                  title="봇 1명 추가 (어드민 전용)"
                >
                  {isAddingBot ? "추가 중..." : `봇 추가 (${room.maxParticipants - totalPlayers}자리 남음)`}
                </button>
              )}
              {isCurrentUserHost && room.status === 'WAITING' && (
                <button
                  className={`px-6 py-2.5 font-bold rounded-lg transition-all text-sm text-white ${
                    allPlayersReady && totalPlayers >= (room.teamMode === 'AUCTION' ? 4 : 2) && allInVoice
                      ? 'bg-accent-success hover:bg-accent-success/90 animate-glow-success'
                      : 'bg-accent-success/50 cursor-not-allowed opacity-60'
                  }`}
                  disabled={!allPlayersReady || totalPlayers < (room.teamMode === 'AUCTION' ? 4 : 2) || !allInVoice}
                  onClick={() => startGame((err) => {
                    // 음성채널 미참가 유저가 있는 경우 구체적인 메시지 표시
                    if (err.missingVoiceUsers && err.missingVoiceUsers.length > 0) {
                      addToast(
                        `음성채널 미참가: ${err.missingVoiceUsers.join(', ')}`,
                        'error'
                      );
                    } else {
                      addToast(err.message, 'error');
                    }
                  })}
                  title={
                    room.teamMode === 'AUCTION' && totalPlayers < 4
                      ? '경매 모드는 최소 4명이 필요합니다'
                      : hasDiscordVoice && !allInVoice
                      ? '음성채널에 참가하지 않은 유저가 있습니다'
                      : undefined
                  }
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
