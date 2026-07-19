"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { useLobbyStore } from "@/stores/lobby-store";
import { useAuthStore } from "@/stores/auth-store";
import { useFriendStore } from "@/stores/friend-store";
import { ChatBox } from "@/components/domain/ChatBox";
import { RoomSettingsModal } from "@/components/domain/RoomSettingsModal";
import { UserSettingsModal } from "@/components/domain/UserSettingsModal";
import { ConfirmModal, Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useShallow } from "zustand/react/shallow";
import {
  Users, MessageSquare, Settings,
  UserCog,
  ArrowLeft, Shield, Swords, Share2, CheckCircle2, Clock3, Radio,
} from "lucide-react";
import Link from "next/link";
import { friendApi, adminApi, roomApi, ensureValidToken } from "@/lib/api-client";
import { PlayerHoverCard } from "@/components/domain/PlayerHoverCard";
import { PlayerProfileModal } from "@/components/domain/PlayerProfileModal";
import { LobbyParticipantsList } from "./_components/LobbyParticipantsList";
import { LobbyErrorState } from "./_components/LobbyErrorState";
import { BroadcastLinkModal } from "./_components/BroadcastLinkModal";

const STAGE_TRANSITION_MAX_ATTEMPTS = 12;
const STAGE_TRANSITION_RETRY_DELAY_MS = 750;
const STAGE_TRANSITION_MIN_TOKEN_TTL_MS = 2 * 60 * 1000;
const STAGE_HANDOFF_LOBBY_CLEANUP_DELAY_MS = 15 * 1000;

const getTeamModeStagePath = (room: {
  id: string;
  teamMode: "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
}) => {
  if (room.teamMode === "AUCTION") return `/auction/${room.id}`;
  if (room.teamMode === "SNAKE_DRAFT") return `/draft/${room.id}`;
  return `/role-selection/${room.id}`;
};

const getRoomStagePath = (room: {
  id: string;
  status?: string;
  teamMode: "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
}) => {
  if (room.status === "IN_PROGRESS") {
    return `/tournaments/${room.id}/bracket`;
  }

  if (room.status === "ROLE_SELECTION" || room.status === "DRAFT_COMPLETED") {
    return `/role-selection/${room.id}`;
  }

  if (room.status === "DRAFT" || room.status === "TEAM_SELECTION") {
    return getTeamModeStagePath(room);
  }

  if (!room.status) {
    return getTeamModeStagePath(room);
  }

  return null;
};

/* ─── Main Page ─── */
export default function TournamentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  // Zustand Selector Optimization
  // 분산형 셀렉터를 사용하여 불필요한 리렌더링 방지
  const {
    connect, disconnect, room, isConnected, error, gameStarting,
    setReady, startGame, kickParticipant, toggleSpectator, selectTeam
  } = useLobbyStore(useShallow(state => ({
    connect: state.connect,
    disconnect: state.disconnect,
    room: state.room,
    isConnected: state.isConnected,
    error: state.error,
    gameStarting: state.gameStarting,
    setReady: state.setReady,
    startGame: state.startGame,
    kickParticipant: state.kickParticipant,
    toggleSpectator: state.toggleSpectator,
    selectTeam: state.selectTeam,
  })));

  // 채팅 메시지와 발송 함수는 따로 분리 (채팅이 올라올 때 전체 로비 UI 리렌더링 방지)
  const messages = useLobbyStore(state => state.messages);
  const sendMessage = useLobbyStore(state => state.sendMessage);

  const currentUser = useAuthStore(state => state.user);
  const { addToast } = useToast(); // useToast internally might already be optimized or use context
  const { friends, fetchFriends } = useFriendStore(useShallow(state => ({
    friends: state.friends,
    fetchFriends: state.fetchFriends,
  })));

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isUserSettingsModalOpen, setIsUserSettingsModalOpen] = useState(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: string; username: string } | null>(null);
  const [isKicking, setIsKicking] = useState(false);
  const [isAddingBot, setIsAddingBot] = useState(false);
  const [hoveredPlayer, setHoveredPlayer] = useState<{ id: string; rect: DOMRect } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState<string | null>(null);
  const [sentFriendIds, setSentFriendIds] = useState<Set<string>>(new Set());
  const [mobileTab, setMobileTab] = useState<string>("participants");
  const hasRedirected = useRef(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionState = useRef({
    target: null as string | null,
    attempts: 0,
    inFlight: false,
    notified: false,
  });

  // 내전 방 링크 공유 — 로비 URL을 클립보드에 복사 (붙여넣으면 OG 카드로 표시됨)
  const handleShare = useCallback(async () => {
    const shareUrl = `${window.location.origin}/tournaments/${roomId}/lobby`;
    try {
      // 모바일 등 네이티브 공유 시트 우선 사용, 미지원 시 클립보드 복사
      if (navigator.share) {
        await navigator.share({ title: room?.name ?? "롤 내전 방", url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      addToast("내전 방 링크를 복사했습니다.", "success");
    } catch (e: any) {
      // 사용자가 공유 시트를 취소한 경우는 무시
      if (e?.name === "AbortError") return;
      addToast("링크 복사에 실패했습니다.", "error");
    }
  }, [roomId, room?.name, addToast]);

  const scheduleHoverClose = useCallback(() => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);

  const cancelHoverClose = useCallback(() => {
    if (!hoverCloseTimer.current) return;
    clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  }, []);

  const clearTransitionRetry = useCallback(() => {
    if (!transitionRetryTimer.current) return;
    clearTimeout(transitionRetryTimer.current);
    transitionRetryTimer.current = null;
  }, []);

  const navigateToGameStage = useCallback((target: string) => {
    if (hasRedirected.current) return;

    const current = transitionState.current;
    if (current.target === target && (current.inFlight || current.attempts > 0)) {
      return;
    }

    clearTransitionRetry();
    transitionState.current = {
      target,
      attempts: 0,
      inFlight: false,
      notified: false,
    };

    const attemptTransition = async () => {
      const state = transitionState.current;
      if (hasRedirected.current || state.target !== target || state.inFlight) {
        return;
      }

      state.inFlight = true;
      state.attempts += 1;

      const token = await ensureValidToken(STAGE_TRANSITION_MIN_TOKEN_TTL_MS).catch(() => null);
      if (token) {
        hasRedirected.current = true;
        clearTransitionRetry();
        router.push(target);
        setTimeout(() => {
          useLobbyStore.getState().disconnect({ skipLeave: true });
        }, STAGE_HANDOFF_LOBBY_CLEANUP_DELAY_MS);
        return;
      }

      state.inFlight = false;

      if (!state.notified && state.attempts >= 3) {
        state.notified = true;
        addToast("세션 확인 중입니다. 잠시 후 자동으로 이동합니다.", "warning");
      }

      if (state.attempts >= STAGE_TRANSITION_MAX_ATTEMPTS) {
        transitionState.current = {
          target: null,
          attempts: 0,
          inFlight: false,
          notified: false,
        };
        addToast("세션 확인이 지연되고 있습니다. 로비 연결은 유지됩니다.", "error");
        return;
      }

      transitionRetryTimer.current = setTimeout(
        attemptTransition,
        STAGE_TRANSITION_RETRY_DELAY_MS,
      );
    };

    void attemptTransition();
  }, [addToast, clearTransitionRetry, router]);

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
      // 남은 자리를 한 번에 채운다 (15인 이상 내전 테스트 시 클릭 반복 방지)
      // players 선언보다 이 콜백이 위에 있어 room.participants 로 직접 계산한다.
      const playerCount = room.participants.filter(
        (p: any) => p.role !== "SPECTATOR",
      ).length;
      const remaining = Math.max(1, room.maxParticipants - playerCount);
      const { addedCount } = await adminApi.addBotToRoom(room.id, remaining);
      // 방 데이터 재조회 후 로비 store에 직접 반영
      const updated = await roomApi.getRoom(room.id);
      useLobbyStore.setState({ room: updated });
      addToast(`봇 ${addedCount}명을 추가했습니다.`, "success");
    } catch (e: any) {
      addToast(e?.response?.data?.message ?? "봇 추가에 실패했습니다.", "error");
    } finally {
      setIsAddingBot(false);
    }
  }, [room, addToast]);

  // connect/disconnect는 zustand 스토어 함수로 참조가 안정적이므로 dependency에서 제외
  useEffect(() => {
    if (roomId) connect(roomId);
    return () => {
      clearTransitionRetry();
      if (hasRedirected.current) return;
      disconnect();
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasRedirected.current || !room) return;
    if (gameStarting) {
      navigateToGameStage(getTeamModeStagePath(room));
      return;
    }
    // IN_PROGRESS인 경우에만 bracket으로 리다이렉트.
    // COMPLETED는 returnToLobby API 호출 후 WAITING으로 리셋되어 오기 때문에
    // 여기서 리다이렉트하면 무한 루프가 발생한다.
    if (room.status === "COMPLETED" || room.status === "WAITING") return;
    const target = getRoomStagePath(room);
    if (target) navigateToGameStage(target);
  }, [gameStarting, room, navigateToGameStage]);

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
      <LobbyErrorState
        error={error}
        onGoSettings={() => router.push("/settings")}
        onGoProfile={() => router.push("/profile")}
      />
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
  const pendingReadyPlayers = players.filter((p: any) => !p.isReady);
  const pendingReadyCount = pendingReadyPlayers.length;
  const pendingReadyPreview = pendingReadyPlayers
    .slice(0, 3)
    .map((p: any) => p.riotAccount?.gameName ?? p.username)
    .join(", ");
  const pendingReadyExtra =
    pendingReadyPlayers.length > 3
      ? ` 외 ${pendingReadyPlayers.length - 3}명`
      : "";
  const emptySlots = Math.max(0, room.maxParticipants - totalPlayers);

  const teamModeLabel = room.teamMode === "AUCTION"
    ? "경매"
    : room.teamMode === "SNAKE_DRAFT"
      ? "스네이크"
      : room.teamMode === "AUTO_BALANCE"
        ? "자동 밸런스"
        : "자유 팀 선택";
  const bracketLabel = room.bracketFormat === "SINGLE_ELIMINATION" ? "싱글 엘리미네이션"
    : room.bracketFormat === "DOUBLE_ELIMINATION" ? "더블 엘리미네이션"
    : room.bracketFormat === "ROUND_ROBIN" ? "라운드 로빈" : room.bracketFormat || "미정";

  // Discord 음성채널 연동 여부: 참가자 중 inVoice가 정의된 유저가 있으면 이 방은 Discord 채널이 있는 것
  const hasDiscordVoice = room.participants.some((p: any) => p.inVoice !== undefined);
  // Discord 채널이 있는 경우, 준비된 참가자 중 botbot이 아닌 유저가 모두 음성채널에 있어야 시작 가능
  const allInVoice = !hasDiscordVoice || room.participants
    .filter((p: any) => p.isReady && !/^testbot_\d+$/.test(p.username))
    .every((p: any) => p.inVoice !== false);
  const allPlayersAssigned =
    room.teamMode !== "MANUAL_TEAM" ||
    players.every((p: any) => Boolean(p.teamId));
  const requiresFullTeams =
    room.teamMode === "AUTO_BALANCE" || room.teamMode === "MANUAL_TEAM";
  const hasFullRoster =
    !requiresFullTeams || totalPlayers === room.maxParticipants;
  const manualTeamsFilled =
    room.teamMode !== "MANUAL_TEAM" ||
    ((room.teams?.length ?? 0) > 0 &&
      room.teams!.every(
        (team: any) =>
          players.filter((player: any) => player.teamId === team.id).length ===
          5,
      ));
  const minStartPlayers = room.teamMode === "AUCTION" ? 4 : 2;
  const hasMinimumPlayers = totalPlayers >= minStartPlayers;
  const canStart =
    allPlayersReady &&
    allPlayersAssigned &&
    hasFullRoster &&
    manualTeamsFilled &&
    hasMinimumPlayers &&
    allInVoice;
  const needsManualTeamSelection =
    room.teamMode === "MANUAL_TEAM" &&
    !currentUserIsSpectator &&
    !currentUserParticipant?.teamId &&
    !currentUserIsReady;
  const directModeRequirements = [
    {
      label: `정원 ${totalPlayers}/${room.maxParticipants}`,
      complete: hasFullRoster,
    },
    ...(room.teamMode === "MANUAL_TEAM"
      ? [
          { label: "전원 팀 선택", complete: allPlayersAssigned },
          { label: "팀당 5명", complete: manualTeamsFilled },
        ]
      : []),
    {
      label: `준비 ${readyCount}/${totalPlayers}`,
      complete: allPlayersReady,
    },
  ];
  const startBlockedMessage = !hasFullRoster
    ? "설정한 정원이 모두 참가해야 시작할 수 있습니다."
    : !hasMinimumPlayers
      ? `${teamModeLabel} 모드는 최소 ${minStartPlayers}명이 필요합니다.`
    : !allPlayersAssigned
      ? "모든 플레이어가 팀을 선택해야 합니다."
      : !manualTeamsFilled
        ? "각 팀에 5명씩 배정해야 합니다."
        : !allPlayersReady
          ? "모든 플레이어가 준비해야 합니다."
          : hasDiscordVoice && !allInVoice
            ? "음성채널에 참가하지 않은 유저가 있습니다."
            : undefined;
  const readyBarStatus = canStart
    ? "시작 가능"
    : !hasFullRoster
      ? "정원 대기"
      : !allPlayersAssigned || !manualTeamsFilled
        ? "팀 편성 필요"
        : allPlayersReady
          ? "시작 조건 확인"
          : `${pendingReadyCount}명 대기`;
  const readyBarHint = canStart
    ? "준비와 음성채널 확인이 완료되었습니다."
    : pendingReadyPlayers.length > 0
      ? `대기: ${pendingReadyPreview}${pendingReadyExtra}`
      : startBlockedMessage ?? "플레이어 입장을 기다리는 중입니다.";

  const handleReadyToggle = () => {
    if (needsManualTeamSelection) {
      addToast("먼저 들어갈 팀을 선택해주세요.", "warning");
      return;
    }
    setReady(!currentUserIsReady, (message) => addToast(message, "error"));
  };

  const handleLeaveLobby = async () => {
    if (!room?.id) {
      disconnect();
      router.push('/tournaments');
      return;
    }

    try {
      await roomApi.leaveRoom(room.id);
      disconnect({ skipLeave: true });
    } catch {
      disconnect();
    }
    router.push('/tournaments');
  };

  const participantsList = (
    <LobbyParticipantsList
      room={room}
      currentUser={currentUser}
      currentUserParticipant={currentUserParticipant}
      currentUserIsSpectator={currentUserIsSpectator}
      players={players}
      spectators={spectators}
      emptySlots={emptySlots}
      isCurrentUserHost={isCurrentUserHost}
      friendUserIds={friendUserIds}
      sentFriendIds={sentFriendIds}
      addingFriend={addingFriend}
      setHoveredPlayer={setHoveredPlayer}
      scheduleHoverClose={scheduleHoverClose}
      cancelHoverClose={cancelHoverClose}
      handleAddFriend={handleAddFriend}
      setKickTarget={setKickTarget}
      toggleSpectator={toggleSpectator}
      selectTeam={selectTeam}
      addToast={addToast}
    />
  );

  /* ─── Chat Panel ─── */
  const chatPanel = (
    <ChatBox
      messages={messages}
      onSendMessage={sendMessage}
      currentUserId={currentUser?.id}
      className="h-full min-h-0 overflow-hidden"
    />
  );

  return (
    <>
      {/* 참가자 호버 툴팁 — overflow-hidden 탈출을 위해 페이지 최상위에서 렌더링 */}
      {hoveredPlayer && (
        <PlayerHoverCard
          userId={hoveredPlayer.id}
          anchorRect={hoveredPlayer.rect}
          onOpenProfile={(uid) => { setProfileUserId(uid); setHoveredPlayer(null); }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
      <div className="flex flex-col h-full min-h-0">
        {/* ═══ Room Header ═══ */}
        <header className="bg-bg-secondary border-b border-bg-tertiary px-4 py-3 lg:px-6">
          <div className="container mx-auto flex items-center justify-between gap-4">
            {/* Left: back + room info */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleLeaveLobby}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300 flex-shrink-0"
                title="방 나가기"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">방 나가기</span>
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
                onClick={handleShare}
                className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
                title="내전 방 링크 공유"
              >
                <Share2 className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsUserSettingsModalOpen(true)}
                className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
                title="내 설정"
              >
                <UserCog className="h-5 w-5" />
              </button>
              {isCurrentUserHost && (
                <button
                  onClick={() => setIsBroadcastModalOpen(true)}
                  className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
                  title="방송용 오버레이 링크"
                >
                  <Radio className="h-5 w-5" />
                </button>
              )}
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
        <div className={`border-b px-4 py-3 lg:px-6 ${
          canStart
            ? "border-accent-success/30 bg-accent-success/10"
            : "border-bg-tertiary bg-bg-secondary/90"
        }`}>
          <div className="container mx-auto flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                  canStart
                    ? "bg-accent-success text-white"
                    : "bg-bg-tertiary text-accent-primary"
                }`}>
                  {canStart ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-bold text-text-primary">준비 현황</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      canStart
                        ? "bg-accent-success text-white"
                        : "bg-bg-tertiary text-text-secondary"
                    }`}>
                      {readyBarStatus}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">{readyBarHint}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-shrink-0">
                <span className="rounded-lg bg-bg-tertiary px-3 py-1.5 text-center text-xs font-semibold text-text-secondary">
                  전체 {totalPlayers}
                </span>
                <span className="rounded-lg bg-accent-success/10 px-3 py-1.5 text-center text-xs font-semibold text-accent-success">
                  준비 {readyCount}
                </span>
                <span className="rounded-lg bg-bg-tertiary px-3 py-1.5 text-center text-xs font-semibold text-text-secondary">
                  대기 {pendingReadyCount}
                </span>
              </div>
            </div>
            <div
              className="grid h-4 gap-1"
              style={{
                gridTemplateColumns: `repeat(${Math.max(totalPlayers, 1)}, minmax(0, 1fr))`,
              }}
              aria-label={`준비 ${readyCount}명, 대기 ${pendingReadyCount}명`}
            >
              {totalPlayers > 0 ? (
                players.map((player: any) => {
                  const playerName = player.riotAccount?.gameName ?? player.username;
                  return (
                    <div
                      key={player.id}
                      title={`${playerName}: ${player.isReady ? "준비 완료" : "대기 중"}`}
                      className={`rounded-sm transition-colors ${
                        player.isReady
                          ? canStart
                            ? "bg-accent-success"
                            : "bg-accent-primary"
                          : "bg-bg-elevated ring-1 ring-inset ring-bg-tertiary"
                      }`}
                    />
                  );
                })
              ) : (
                <div className="rounded-sm bg-bg-elevated ring-1 ring-inset ring-bg-tertiary" />
              )}
            </div>
          </div>
        </div>

        {requiresFullTeams && room.status === "WAITING" && (
          <div className="bg-bg-secondary border-b border-bg-tertiary px-4 py-3 lg:px-6">
            <div className="container mx-auto rounded-xl border border-accent-primary/20 bg-accent-primary/5 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {room.teamMode === "AUTO_BALANCE"
                      ? "자동 밸런스 진행 조건"
                      : "자유 팀 선택 진행 조건"}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {room.teamMode === "AUTO_BALANCE"
                      ? "정원과 준비가 완료되면 티어·LP 및 선호 포지션 기준으로 팀을 편성하고 역할 선택으로 이동합니다."
                      : "팀 카드를 선택해 이동하세요. 팀을 바꾸면 준비 상태가 해제되며, 모든 팀을 5명씩 채운 뒤 시작합니다."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {directModeRequirements.map((requirement) => (
                    <span
                      key={requirement.label}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        requirement.complete
                          ? "border-accent-success/30 bg-accent-success/10 text-accent-success"
                          : "border-bg-elevated bg-bg-tertiary text-text-secondary"
                      }`}
                    >
                      {requirement.complete ? "완료" : "대기"} {requirement.label}
                    </span>
                  ))}
                </div>
              </div>
              {needsManualTeamSelection && (
                <p className="mt-2 text-xs font-medium text-accent-warning">
                  준비하려면 먼저 원하는 팀을 선택하세요.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══ Main Content: Desktop 2-col / Mobile Tabs ═══ */}
        <div className="min-h-0 flex-1 basis-0 overflow-hidden">
          {/* Desktop layout (lg+) */}
          <div className="container mx-auto hidden h-full min-h-0 gap-4 px-6 py-4 lg:flex">
            {/* Participants: 2/3 */}
            <section className="flex min-h-0 min-w-0 flex-[2] flex-col overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary">
              <div className="px-5 py-3 border-b border-bg-tertiary flex items-center justify-between">
                <h2 className="font-bold text-text-primary flex items-center gap-2">
                  <Users className="h-5 w-5 text-text-secondary" />
                  {room.teamMode === "MANUAL_TEAM" ? "팀 편성" : "참가자"}
                  <span className="text-sm font-normal text-text-tertiary">{totalPlayers}/{room.maxParticipants}</span>
                </h2>
              </div>
              <div className="min-h-0 flex-1 basis-0 overflow-y-auto p-4">
                {participantsList}
              </div>
            </section>

            {/* Chat: 1/3 */}
            <section className="flex min-h-0 min-w-0 flex-[1] flex-col overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary">
              <div className="px-5 py-3 border-b border-bg-tertiary">
                <h2 className="font-bold text-text-primary flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-text-secondary" />
                  채팅
                </h2>
              </div>
              <div className="min-h-0 flex-1 basis-0 overflow-hidden">
                {chatPanel}
              </div>
            </section>
          </div>

          {/* Mobile layout (< lg) */}
          <div className="flex h-full min-h-0 flex-col lg:hidden">
            <Tabs defaultValue="participants" value={mobileTab} onValueChange={setMobileTab} className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="px-4 pt-3 flex-shrink-0">
                <TabsList className="w-full">
                  <TabsTrigger value="participants" className="flex-1 justify-center">
                    <Users className="h-4 w-4 mr-1.5" />
                    {room.teamMode === "MANUAL_TEAM" ? "팀 편성" : "참가자"} ({totalPlayers})
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="flex-1 justify-center relative">
                    <MessageSquare className="h-4 w-4 mr-1.5" />채팅
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="participants" className="min-h-0 flex-1 basis-0 overflow-y-auto overscroll-contain p-4">
                {participantsList}
              </TabsContent>
              <TabsContent value="chat" className="flex min-h-0 flex-1 basis-0 overflow-hidden p-4">
                {chatPanel}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ═══ Sticky Bottom Action Bar ═══ */}
        <footer className="bg-bg-secondary border-t border-bg-tertiary px-4 py-3 lg:px-6 flex-shrink-0">
          <div className="container mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {room.status !== 'DRAFT_COMPLETED' && !currentUserIsSpectator && (
                <button
                  className={`inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-bold transition-all ${
                    currentUserIsReady
                      ? 'border border-bg-elevated bg-bg-tertiary text-text-primary hover:bg-bg-elevated'
                      : 'bg-accent-primary hover:bg-accent-hover text-white'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  disabled={needsManualTeamSelection}
                  title={needsManualTeamSelection ? "먼저 팀을 선택해주세요." : undefined}
                  onClick={handleReadyToggle}
                >
                  {needsManualTeamSelection
                    ? "팀 선택 필요"
                    : currentUserIsReady
                      ? "준비 취소"
                      : "준비하기"}
                </button>
              )}
              {room.status !== 'DRAFT_COMPLETED' && currentUserIsSpectator && (
                <span className="inline-flex min-h-11 items-center justify-center rounded-lg bg-bg-tertiary px-5 py-2.5 text-sm font-medium text-text-muted">
                  관전 중
                </span>
              )}
              {room.status === 'DRAFT_COMPLETED' && (
                <Link href={`/tournaments/${room.id}/bracket`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-success px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-success/90">
                  대진표 보기
                </Link>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {/* 어드민 전용: 봇 추가 버튼 */}
              {currentUser?.role === 'ADMIN' && room.status === 'WAITING' && totalPlayers < room.maxParticipants && (
                <button
                  onClick={handleAddBot}
                  disabled={isAddingBot}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-bg-tertiary px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50"
                  title="남은 자리를 봇으로 모두 채움 (어드민 전용)"
                >
                  {isAddingBot ? "추가 중..." : `봇 채우기 (${room.maxParticipants - totalPlayers}자리 남음)`}
                </button>
              )}
              {isCurrentUserHost && room.status === 'WAITING' && (
                <div className="flex flex-col gap-1.5 sm:items-end">
                  {!canStart && startBlockedMessage && (
                    <p className="max-w-[280px] text-xs font-medium text-accent-warning sm:text-right">
                      {startBlockedMessage}
                    </p>
                  )}
                  <button
                    className={`inline-flex min-h-11 items-center justify-center rounded-lg px-6 py-2.5 text-sm font-bold text-white transition-all ${
                      canStart
                        ? 'bg-accent-success hover:bg-accent-success/90 animate-glow-success'
                        : 'bg-accent-success/50 cursor-not-allowed opacity-60'
                    }`}
                    disabled={!canStart}
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
                    title={startBlockedMessage}
                  >
                    내전 시작
                  </button>
                </div>
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

      {isCurrentUserHost && (
        <BroadcastLinkModal
          isOpen={isBroadcastModalOpen}
          onClose={() => setIsBroadcastModalOpen(false)}
          roomId={room.id}
        />
      )}
      <PlayerProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </>
  );
}
