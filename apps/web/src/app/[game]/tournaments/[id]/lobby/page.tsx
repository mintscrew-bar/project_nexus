"use client";

import { useParams, useRouter } from "next/navigation";
import { useGamePrefix } from "@/hooks/useCurrentGame";
import {
  DEFAULT_GAME,
  GAMES,
  getRoomStagePath,
  getTeamModeStagePath,
  minDraftParticipants,
  pubgRoomTitle,
  type GameTitle,
} from "@nexus/types";
import { useEffect, useRef, useState, useCallback } from "react";
import { useLobbyStore } from "@/stores/lobby-store";
import { useAuthStore } from "@/stores/auth-store";
import { useFriendStore } from "@/stores/friend-store";
import { ChatBox } from "@/components/domain/ChatBox";
import { RoomSettingsModal } from "@/components/domain/RoomSettingsModal";
import { UserSettingsModal } from "@/components/domain/UserSettingsModal";
import {
  ConfirmModal,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { roomSocketHelpers } from "@/lib/socket-client";
import { useShallow } from "zustand/react/shallow";
import {
  Users,
  MessageSquare,
  Settings,
  UserCog,
  ArrowLeft,
  LogOut,
  Shield,
  Swords,
  Share2,
  CheckCircle2,
  Clock3,
  Headphones,
  Radio,
  MoreHorizontal,
} from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import Link from "next/link";
import {
  friendApi,
  adminApi,
  roomApi,
  ensureValidToken,
} from "@/lib/api-client";
import { PlayerHoverCard } from "@/components/domain/PlayerHoverCard";
import { PlayerProfileModal } from "@/components/domain/PlayerProfileModal";
import { LobbyTour } from "@/components/onboarding/LobbyTour";
import {
  StartBlockedModal,
  type ServerStartBlock,
} from "./_components/StartBlockedModal";
import { LobbyParticipantsList } from "./_components/LobbyParticipantsList";
import { AutoBalanceReview } from "./_components/AutoBalanceReview";
import { LobbyErrorState } from "./_components/LobbyErrorState";
import { BroadcastLinkModal } from "./_components/BroadcastLinkModal";
import { TeamModeHelp, type TeamMode } from "@/components/rooms/TeamModeHelp";

const STAGE_TRANSITION_MAX_ATTEMPTS = 12;
const STAGE_TRANSITION_RETRY_DELAY_MS = 750;
const STAGE_TRANSITION_MIN_TOKEN_TTL_MS = 2 * 60 * 1000;
const STAGE_HANDOFF_LOBBY_CLEANUP_DELAY_MS = 15 * 1000;
// 소켓 연결이 이 시간 내에 성립하지 않으면 무한 스피너 대신 복구 화면으로 전환한다.
const LOBBY_CONNECT_TIMEOUT_MS = 10 * 1000;

/* ─── Main Page ─── */
export default function TournamentLobbyPage() {
  const params = useParams();
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const roomId = params.id as string;

  // Zustand Selector Optimization
  // 분산형 셀렉터를 사용하여 불필요한 리렌더링 방지
  const {
    connect,
    disconnect,
    room,
    isConnected,
    error,
    gameStarting,
    setReady,
    startGame,
    kickParticipant,
    toggleSpectator,
    selectTeam,
  } = useLobbyStore(
    useShallow((state) => ({
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
    })),
  );

  // 채팅 메시지와 발송 함수는 따로 분리 (채팅이 올라올 때 전체 로비 UI 리렌더링 방지)
  const messages = useLobbyStore((state) => state.messages);
  const sendMessage = useLobbyStore((state) => state.sendMessage);

  const currentUser = useAuthStore((state) => state.user);
  // 소켓은 JWT가 있을 때만 연결을 시도한다(socket-client의 auth 게이트).
  // 따라서 비로그인 상태에서는 connect/connect_error 어느 쪽도 발생하지 않아
  // 로그인 여부를 페이지에서 직접 확인해야 무한 스피너를 막을 수 있다.
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const { addToast } = useToast(); // useToast internally might already be optimized or use context
  const { friends, fetchFriends } = useFriendStore(
    useShallow((state) => ({
      friends: state.friends,
      fetchFriends: state.fetchFriends,
    })),
  );

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isUserSettingsModalOpen, setIsUserSettingsModalOpen] = useState(false);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [isKicking, setIsKicking] = useState(false);
  const [isAddingBot, setIsAddingBot] = useState(false);
  const [hoveredPlayer, setHoveredPlayer] = useState<{
    id: string;
    rect: DOMRect;
  } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState<string | null>(null);
  const [sentFriendIds, setSentFriendIds] = useState<Set<string>>(new Set());
  const [mobileTab, setMobileTab] = useState<string>("participants");
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const previousMessageCountRef = useRef(messages.length);
  const [connectTimedOut, setConnectTimedOut] = useState(false);
  // 시작 조건이 안 맞은 채로 "내전 시작"을 누르면 모달로 막힌 항목·사람·호출
  // 버튼을 보여준다(StartBlockedModal). 사라지는 토스트로는 무엇을 고쳐야
  // 하는지 인식하지 못했다(2026-09-22 운영자 제보).
  const [startBlockOpen, setStartBlockOpen] = useState(false);
  // 서버가 거절한 사유. 화면 판정만으로 연 모달이면 null 이다.
  const [serverStartBlock, setServerStartBlock] =
    useState<ServerStartBlock | null>(null);
  // "다시 시도"를 누를 때마다 증가시켜 connect 이펙트를 재실행한다.
  const [retryNonce, setRetryNonce] = useState(0);
  const hasRedirected = useRef(false);
  // 최초 입장 성공 여부 — 이후의 재연결 대기에는 타임아웃을 걸지 않는다.
  const hasJoinedOnce = useRef(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const transitionState = useRef({
    target: null as string | null,
    attempts: 0,
    inFlight: false,
    notified: false,
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const addedCount = Math.max(0, messages.length - previousCount);
    previousMessageCountRef.current = messages.length;

    if (!isMobileLayout || mobileTab === "chat") {
      setUnreadChatCount(0);
    } else if (addedCount > 0) {
      setUnreadChatCount((count) => Math.min(100, count + addedCount));
    }
  }, [messages.length, mobileTab, isMobileLayout]);

  useEffect(() => {
    previousMessageCountRef.current = 0;
    setUnreadChatCount(0);
  }, [roomId]); // 새 방에서는 이전 방의 읽지 않은 개수를 이어가지 않는다.

  useEffect(() => {
    // 참가·준비·음성 상태가 바뀌면 서버가 준 거절 사유는 더 이상 사실이 아닐
    // 수 있다. 모달은 체크리스트의 최신 계산으로 돌아간다.
    setServerStartBlock(null);
  }, [room?.participants, room?.status, room?.teamMode]);

  useEffect(() => {
    if (!error?.startsWith("ACTIVE_ROOM_EXISTS::")) return;
    const [, activeRoomId, message] = error.split("::");
    if (!activeRoomId || activeRoomId === roomId || hasRedirected.current)
      return;
    hasRedirected.current = true;
    addToast(message || "진행 중인 내전으로 돌아갑니다.", "warning");
    router.replace(`${gamePrefix}/tournaments/${activeRoomId}/lobby`);
  }, [error, roomId, router, addToast, gamePrefix]);

  // 내전 방 링크 공유 — 로비 URL을 클립보드에 복사 (붙여넣으면 OG 카드로 표시됨)
  const handleShare = useCallback(async () => {
    const shareUrl = `${window.location.origin}${gamePrefix}/tournaments/${roomId}/lobby`;
    try {
      // 모바일 등 네이티브 공유 시트 우선 사용, 미지원 시 클립보드 복사
      if (navigator.share) {
        await navigator.share({
          title: room?.name ?? "롤 내전 방",
          url: shareUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      addToast("내전 방 링크를 복사했습니다.", "success");
    } catch (e: any) {
      // 사용자가 공유 시트를 취소한 경우는 무시
      if (e?.name === "AbortError") return;
      addToast("링크 복사에 실패했습니다.", "error");
    }
  }, [roomId, room?.name, addToast, gamePrefix]);

  /**
   * 호버 프로필 열기를 살짝 미룬다.
   *
   * 배그 방은 참가자가 64명까지 간다. 마우스가 카드 위를 스쳐 지나갈 때마다
   * 프로필을 조회하면 한 번 훑는 것만으로 수십 건이 나간다.
   */
  const openHoverTimer = useRef<NodeJS.Timeout | null>(null);
  const scheduleHoverOpen = useCallback(
    (next: { id: string; rect: DOMRect; participant: any } | null) => {
      if (openHoverTimer.current) clearTimeout(openHoverTimer.current);
      if (!next) {
        setHoveredPlayer(null);
        return;
      }
      openHoverTimer.current = setTimeout(() => setHoveredPlayer(next), 180);
    },
    [],
  );

  const scheduleHoverClose = useCallback(() => {
    if (openHoverTimer.current) clearTimeout(openHoverTimer.current);
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

  const navigateToGameStage = useCallback(
    (target: string) => {
      if (hasRedirected.current) return;

      const current = transitionState.current;
      if (
        current.target === target &&
        (current.inFlight || current.attempts > 0)
      ) {
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
        if (
          hasRedirected.current ||
          state.target !== target ||
          state.inFlight
        ) {
          return;
        }

        state.inFlight = true;
        state.attempts += 1;

        const token = await ensureValidToken(
          STAGE_TRANSITION_MIN_TOKEN_TTL_MS,
        ).catch(() => null);
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
          addToast(
            "세션 확인 중입니다. 잠시 후 자동으로 이동합니다.",
            "warning",
          );
        }

        if (state.attempts >= STAGE_TRANSITION_MAX_ATTEMPTS) {
          transitionState.current = {
            target: null,
            attempts: 0,
            inFlight: false,
            notified: false,
          };
          addToast(
            "세션 확인이 지연되고 있습니다. 로비 연결은 유지됩니다.",
            "error",
          );
          return;
        }

        transitionRetryTimer.current = setTimeout(
          attemptTransition,
          STAGE_TRANSITION_RETRY_DELAY_MS,
        );
      };

      void attemptTransition();
    },
    [addToast, clearTransitionRetry, router],
  );

  useEffect(() => {
    if (currentUser?.id) fetchFriends();
  }, [currentUser?.id, fetchFriends]);

  const friendUserIds = new Set(
    friends.map((f) => (f.userId === currentUser?.id ? f.friendId : f.userId)),
  );

  const handleAddFriend = useCallback(
    async (userId: string) => {
      setAddingFriend(userId);
      try {
        await friendApi.sendRequest(userId);
        setSentFriendIds((prev) => new Set(prev).add(userId));
        addToast("친구 요청을 보냈습니다!", "success");
      } catch (e: any) {
        addToast(
          e?.response?.data?.message ?? "친구 요청에 실패했습니다.",
          "error",
        );
      } finally {
        setAddingFriend(null);
      }
    },
    [addToast],
  );

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
      addToast(
        e?.response?.data?.message ?? "봇 추가에 실패했습니다.",
        "error",
      );
    } finally {
      setIsAddingBot(false);
    }
  }, [room, addToast]);

  // connect/disconnect는 zustand 스토어 함수로 참조가 안정적이므로 dependency에서 제외
  useEffect(() => {
    // 인증 복원이 끝나고 로그인 상태일 때만 연결한다.
    // (비로그인 상태에서 connect를 불러도 소켓이 열리지 않아 스피너만 남는다)
    if (roomId && isAuthenticated) connect(roomId);
    return () => {
      clearTransitionRetry();
      if (hasRedirected.current) return;
      // 로비 연결은 전역 스토어가 소유한다. 사이트 내부 페이지 이동에서는
      // 연결을 유지해 게임 시작·강퇴 알림을 놓치지 않도록 한다.
    };
  }, [roomId, isAuthenticated, retryNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // 연결이 성립하지도, 에러가 나지도 않는 상태(방화벽/네트워크 지연 등)를 타임아웃으로 끊는다.
  // 단, 한 번 입장에 성공한 뒤의 일시적 끊김은 소켓 자동 재연결에 맡기고 타임아웃하지 않는다.
  useEffect(() => {
    if (!isAuthenticated || hasJoinedOnce.current) return;
    // 연결 + 방 데이터까지 도착해야 정상 상태다. join-room 응답이 오지 않는 경우도 함께 끊는다.
    if (isConnected && room) {
      hasJoinedOnce.current = true;
      setConnectTimedOut(false);
      return;
    }
    if (error) {
      setConnectTimedOut(false);
      return;
    }
    const timer = setTimeout(
      () => setConnectTimedOut(true),
      LOBBY_CONNECT_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [isAuthenticated, isConnected, !!room, error, roomId, retryNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetryConnect = useCallback(() => {
    setConnectTimedOut(false);
    // 아직 방에 입장한 적이 없으므로 leave 없이 소켓만 정리하고 재연결한다.
    disconnect({ skipLeave: true });
    setRetryNonce((prev) => prev + 1);
  }, [disconnect]);

  useEffect(() => {
    if (hasRedirected.current || !room) return;
    if (gameStarting) {
      // 자동 밸런스의 game-starting 은 확정 → 역할 자동 배정 → 대진표 생성이
      // 전부 끝난 뒤에만 온다. 그런데 getTeamModeStagePath 는 편성 직후 기준이라
      // 롤 방을 역할 선택 화면으로 보낸다. 이미 끝난 역할 선택 화면에 들어가면
      // 역할 선택 소켓 연결·입장을 한 번 더 거치고, 폴링으로 대진표를 찾을
      // 때까지 머문다. 게다가 방장은 확정 응답으로 대진표 이동을 시작하는데,
      // 목적지가 다르면 navigateToGameStage 가 먼저 시작된 이동을 취소해서
      // 결국 역할 선택 화면이 이긴다. 진행 중 경로로 바로 보내 목적지를 하나로 맞춘다.
      const target =
        room.teamMode === "AUTO_BALANCE"
          ? getRoomStagePath({ ...room, status: "IN_PROGRESS" }, gamePrefix)
          : getTeamModeStagePath(room, gamePrefix);
      if (target) navigateToGameStage(target);
      return;
    }
    // IN_PROGRESS인 경우에만 bracket으로 리다이렉트.
    // COMPLETED는 returnToLobby API 호출 후 WAITING으로 리셋되어 오기 때문에
    // 여기서 리다이렉트하면 무한 루프가 발생한다.
    if (room.status === "COMPLETED" || room.status === "WAITING") return;
    const target = getRoomStagePath(room, gamePrefix);
    if (target) navigateToGameStage(target);
  }, [gameStarting, room, navigateToGameStage, gamePrefix]);

  /* ─── Loading / Error States ─── */
  const connectingSpinner = (
    <div className="flex-grow flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-text-secondary text-sm">로비에 연결하는 중...</p>
      </div>
    </div>
  );

  // 인증 복원 중에는 아직 로그인 여부를 알 수 없으므로 스피너를 유지한다.
  if (isAuthLoading) return connectingSpinner;

  // 공유받은 방 링크를 비로그인 상태로 열었을 때 — 로그인 후 이 로비로 복귀시킨다.
  if (!isAuthenticated) {
    return (
      <LobbyErrorState
        error="NOT_AUTHENTICATED::내전 방에 입장하려면 로그인이 필요합니다. 로그인하면 이 방으로 다시 돌아옵니다."
        onGoSettings={() => router.push("/settings")}
        onGoProfile={() => router.push(`${gamePrefix}/profile`)}
        loginHref={`/auth/login?redirect=${encodeURIComponent(`${gamePrefix}/tournaments/${roomId}/lobby`)}`}
      />
    );
  }

  if (error) {
    return (
      <LobbyErrorState
        error={error}
        onGoSettings={() => router.push("/settings")}
        onGoProfile={() => router.push(`${gamePrefix}/profile`)}
      />
    );
  }

  if (connectTimedOut) {
    return (
      <LobbyErrorState
        error="CONNECT_TIMEOUT::방이 삭제되었거나 네트워크 연결이 불안정할 수 있습니다. 다시 시도하거나 내전 목록에서 방을 확인해 주세요."
        onGoSettings={() => router.push("/settings")}
        onGoProfile={() => router.push(`${gamePrefix}/profile`)}
        onRetry={handleRetryConnect}
      />
    );
  }

  if (!isConnected) return connectingSpinner;

  if (!room) {
    return (
      <div className="flex-grow flex items-center justify-center p-8">
        <p className="text-text-secondary animate-fade-in">
          방 정보를 기다리는 중...
        </p>
      </div>
    );
  }

  const isCurrentUserHost = room.hostId === currentUser?.id;
  const currentUserParticipant = room.participants.find(
    (p: any) => p.userId === currentUser?.id,
  );
  const currentUserIsReady = currentUserParticipant?.isReady || false;
  const currentUserIsSpectator = currentUserParticipant?.role === "SPECTATOR";

  // 플레이어와 관전자 분리
  const players = room.participants.filter((p: any) => p.role !== "SPECTATOR");
  const spectators = room.participants.filter(
    (p: any) => p.role === "SPECTATOR",
  );

  const readyCount = players.filter((p: any) => p.isReady).length;
  const totalPlayers = players.length;
  const allPlayersReady = totalPlayers > 0 && readyCount === totalPlayers;
  const pendingReadyPlayers = players.filter((p: any) => !p.isReady);
  const pendingReadyCount = pendingReadyPlayers.length;
  const emptySlots = Math.max(0, room.maxParticipants - totalPlayers);
  const participantName = (participant: any) =>
    participant.riotAccount?.gameName ?? participant.username;
  const summarizeParticipants = (participants: any[]) => {
    const preview = participants.slice(0, 3).map(participantName).join(", ");
    return participants.length > 3
      ? `${preview} 외 ${participants.length - 3}명`
      : preview;
  };

  const teamModeLabel =
    room.teamMode === "AUCTION"
      ? "경매"
      : room.teamMode === "SNAKE_DRAFT"
        ? "스네이크"
        : room.teamMode === "AUTO_BALANCE"
          ? "자동 밸런스"
          : "자유 팀 선택";
  const bracketLabel =
    room.bracketFormat === "SINGLE_ELIMINATION"
      ? "싱글 엘리미네이션"
      : room.bracketFormat === "DOUBLE_ELIMINATION"
        ? "더블 엘리미네이션"
        : room.bracketFormat === "ROUND_ROBIN"
          ? "라운드 로빈"
          : room.bracketFormat || "미정";

  // Discord 음성채널 연동 여부: 참가자 중 inVoice가 정의된 유저가 있으면 이 방은 Discord 채널이 있는 것
  const hasDiscordVoice = room.participants.some(
    (p: any) => p.inVoice !== undefined,
  );
  const voiceTrackedPlayers = players.filter(
    (p: any) => p.inVoice !== undefined && !/^testbot_\d+$/.test(p.username),
  );
  const playersOutsideVoice = voiceTrackedPlayers.filter(
    (p: any) => p.inVoice !== true,
  );
  const playersInVoiceCount =
    voiceTrackedPlayers.length - playersOutsideVoice.length;
  // 음성 상태를 아직 모르는 참가자. 막 들어와 봇이 확인하기 전이거나 조회가
  // 실패한 경우다. 화면은 이들을 막지 않지만 서버는 실제로 확인한다 — 시작이
  // 거절되면 모달이 서버 판정을 보여준다. 체크리스트에는 "확인 중"으로 남긴다.
  const playersVoiceUnknown = hasDiscordVoice
    ? players.filter(
        (p: any) =>
          p.inVoice === undefined && !/^testbot_\d+$/.test(p.username),
      )
    : [];
  // Discord 채널이 있는 경우, 준비된 참가자 중 botbot이 아닌 유저가 모두 음성채널에 있어야 시작 가능
  const allInVoice =
    !hasDiscordVoice ||
    room.participants
      .filter((p: any) => p.isReady && !/^testbot_\d+$/.test(p.username))
      .every((p: any) => p.inVoice !== false);
  const allPlayersAssigned =
    room.teamMode !== "MANUAL_TEAM" ||
    players.every((p: any) => Boolean(p.teamId));
  // 팀 정원·정원 충족 규칙은 게임을 따라간다. 5로 박아 두면 배그 4인 스쿼드는
  // 조건이 성립할 수 없어 시작 버튼이 영영 안 켜진다.
  const roomGame = GAMES[(room.gameTitle as GameTitle) ?? DEFAULT_GAME];
  const requiresFullTeams =
    room.teamMode === "AUTO_BALANCE" ||
    room.teamMode === "MANUAL_TEAM" ||
    // 배그는 경매·스네이크도 정원이 차야 시작한다 — 덜 찬 채로 편성하면
    // 스크림이 안 열려 방이 막다른 길에 들어간다(서버도 같은 기준으로 막는다).
    roomGame.requiresFullRoomForTeams;
  const hasFullRoster =
    !requiresFullTeams || totalPlayers === room.maxParticipants;
  const manualTeamsFilled =
    room.teamMode !== "MANUAL_TEAM" ||
    ((room.teams?.length ?? 0) > 0 &&
      room.teams!.every(
        (team: any) =>
          players.filter((player: any) => player.teamId === team.id).length ===
          roomGame.teamSize,
      ));
  const minStartPlayers =
    room.teamMode === "AUCTION"
      ? 4
      : room.teamMode === "SNAKE_DRAFT"
        ? minDraftParticipants(roomGame.title)
        : 2;
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
  const startBlockedMessage = !hasFullRoster
    ? "설정한 정원이 모두 참가해야 시작할 수 있습니다."
    : !hasMinimumPlayers
      ? `${teamModeLabel} 모드는 최소 ${minStartPlayers}명이 필요합니다.`
      : !allPlayersAssigned
        ? "모든 플레이어가 팀을 선택해야 합니다."
        : !manualTeamsFilled
          ? `각 팀에 ${roomGame.teamSize}명씩 배정해야 합니다.`
          : !allPlayersReady
            ? "모든 플레이어가 준비해야 합니다."
            : hasDiscordVoice && !allInVoice
              ? "음성채널에 참가하지 않은 유저가 있습니다."
              : undefined;
  const startRequirements = [
    {
      id: "roster",
      label: requiresFullTeams ? "참가 인원" : "최소 인원",
      value: requiresFullTeams
        ? `${totalPlayers}/${room.maxParticipants}명`
        : `${totalPlayers}명 · 최소 ${minStartPlayers}명`,
      complete: hasFullRoster && hasMinimumPlayers,
      detail: !hasFullRoster
        ? `${emptySlots}명이 더 참가해야 합니다.`
        : !hasMinimumPlayers
          ? `${minStartPlayers - totalPlayers}명이 더 필요합니다.`
          : "시작할 인원이 모였습니다.",
    },
    ...(room.teamMode === "MANUAL_TEAM"
      ? [
          {
            id: "teams",
            label: "팀 선택",
            value: allPlayersAssigned
              ? `팀당 ${roomGame.teamSize}명 확인`
              : "미선택 참가자 있음",
            complete: allPlayersAssigned && manualTeamsFilled,
            detail: !allPlayersAssigned
              ? "모든 참가자가 원하는 팀을 먼저 선택해야 합니다."
              : !manualTeamsFilled
                ? `각 팀을 ${roomGame.teamSize}명씩 채워주세요.`
                : "모든 팀의 인원이 맞습니다.",
          },
        ]
      : []),
    ...(hasDiscordVoice
      ? [
          {
            id: "voice",
            label: "Discord 대기실",
            value: `${playersInVoiceCount}/${voiceTrackedPlayers.length}명`,
            complete: playersOutsideVoice.length === 0,
            detail:
              playersOutsideVoice.length > 0
                ? `미입장: ${summarizeParticipants(playersOutsideVoice)}`
                : playersVoiceUnknown.length > 0
                  ? `확인 중: ${summarizeParticipants(playersVoiceUnknown)}`
                  : "전원이 『방 제목』 카테고리의 대기실에 들어왔습니다.",
          },
        ]
      : []),
    {
      id: "ready",
      label: "준비 완료",
      value: `${readyCount}/${totalPlayers}명`,
      complete: allPlayersReady,
      detail:
        pendingReadyPlayers.length > 0
          ? `대기: ${summarizeParticipants(pendingReadyPlayers)}`
          : "모든 참가자가 준비를 완료했습니다.",
    },
  ];
  // 스트립 오른쪽에 막힌 이유 한 줄로 보여줄 조건 — 대기자 이름 등
  const firstBlockingRequirement = startRequirements.find(
    (requirement) => !requirement.complete,
  );
  const readyBarStatus = canStart
    ? "시작 가능"
    : !hasFullRoster
      ? "정원 대기"
      : !allPlayersAssigned || !manualTeamsFilled
        ? "팀 편성 필요"
        : allPlayersReady
          ? "시작 조건 확인"
          : `${pendingReadyCount}명 대기`;

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
      router.push(`${gamePrefix}/tournaments`);
      return;
    }

    try {
      await roomApi.leaveRoom(room.id);
      disconnect({ skipLeave: true });
    } catch {
      disconnect();
    }
    router.push(`${gamePrefix}/tournaments`);
  };

  const requestLeaveLobby = () => {
    setIsLeaveConfirmOpen(true);
  };

  // 자동 밸런스 편성 확인 단계 — 이 동안 로비는 전용 화면으로 통째로 전환된다.
  // 준비바·참가자 목록·하단 액션바는 이 단계에서 정보 가치가 없는데 공간만
  // 차지해서 (준비는 이미 끝났고, 팀 배치가 곧 참가자 목록이다) 모두 숨긴다.
  const isAutoBalanceReviewStage =
    room.teamMode === "AUTO_BALANCE" && room.status === "DRAFT_COMPLETED";

  const autoBalanceReview = isAutoBalanceReviewStage ? (
    <AutoBalanceReview
      // 배그에는 라인이 없다. 빈 라인 칸과 "선호 라인 충족"을 띄우지 않는다.
      showRoles={roomGame.hasPositions}
      isHost={isCurrentUserHost}
      teams={(room.teams ?? []).map((team: any) => ({
        id: team.id,
        name: team.name,
        color: team.color,
        balanceTotal: team.balanceTotal ?? null,
        members: (team.members ?? []).map((member: any) => {
          const participant = players.find(
            (player: any) => player.userId === member.userId,
          );
          const role = member.assignedRole ?? null;
          return {
            userId: member.userId,
            username:
              member.user?.username ?? participant?.username ?? "알 수 없음",
            assignedRole: role,
            // 배정된 라인 기준 점수 (참가자 페이로드의 라인별 점수에서 꺼낸다)
            score:
              role && participant?.balanceScores
                ? (participant.balanceScores[role] ?? null)
                : null,
            scoresByRole: participant?.balanceScores ?? null,
            // 선호 라인 충족 계산용 — 편성에 쓰인 것과 같은 대표 계정 값
            mainRole:
              member.user?.riotAccounts?.[0]?.mainRole ??
              participant?.riotAccount?.mainRole ??
              null,
            subRole:
              member.user?.riotAccounts?.[0]?.subRole ??
              participant?.riotAccount?.subRole ??
              null,
            // 라인별 티어를 등록한 라인 — 주·부라인 다음가는 약한 선호로 본다
            registeredRoles: (
              member.user?.riotAccounts?.[0]?.roleTiers ??
              (participant?.riotAccount as any)?.roleTiers ??
              []
            ).map((entry: any) => entry.role),
          };
        }),
      }))}
      onReroll={async (pinnedUserIds) => {
        const result = await roomSocketHelpers.rerollAutoBalance(
          room.id,
          pinnedUserIds,
        );
        if (!result.success) {
          addToast(result.error ?? "재편성에 실패했습니다.", "error");
        }
      }}
      onConfirm={async () => {
        const result = await roomSocketHelpers.confirmAutoBalance(room.id);
        if (!result.success) {
          addToast(result.error ?? "확정에 실패했습니다.", "error");
          return;
        }

        // 서버는 자동 편성 확정과 동시에 대진표를 생성한다.
        // game-starting 소켓 이벤트만 기다리면 이벤트가 유실될 때 로비에
        // 그대로 남을 수 있으므로, 성공 응답을 받은 즉시 대진표로 넘긴다.
        const bracketPath = getRoomStagePath(
          { ...room, status: "IN_PROGRESS" },
          gamePrefix,
        );
        if (bracketPath) navigateToGameStage(bracketPath);
      }}
      rerollCount={room.autoBalanceRerollCount ?? 0}
      undoDepth={room.undoDepth ?? 0}
      onUndo={async () => {
        const result = await roomSocketHelpers.undoAutoBalance(room.id);
        if (!result.success) {
          addToast(result.error ?? "편성 되감기에 실패했습니다.", "error");
        }
      }}
      onSwap={async (userIdA, userIdB) => {
        const result = await roomSocketHelpers.swapAutoBalance(
          room.id,
          userIdA,
          userIdB,
        );
        if (!result.success) {
          addToast(result.error ?? "자리 교체에 실패했습니다.", "error");
        }
      }}
      onMemberHover={(userId, anchorRect) => {
        cancelHoverClose();
        scheduleHoverOpen({
          id: userId,
          rect: anchorRect,
          participant: players.find((player: any) => player.userId === userId),
        });
      }}
      onMemberHoverLeave={scheduleHoverClose}
    />
  ) : null;

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
      setHoveredPlayer={scheduleHoverOpen}
      scheduleHoverClose={scheduleHoverClose}
      cancelHoverClose={cancelHoverClose}
      handleAddFriend={handleAddFriend}
      setKickTarget={setKickTarget}
      toggleSpectator={toggleSpectator}
      selectTeam={selectTeam}
      addToast={addToast}
    />
  );

  /*
   * ─── 준비·시작 버튼 묶음 ───
   * 예전엔 화면 폭 하단 바의 양 끝(준비는 왼쪽 아래, 시작은 오른쪽 아래)에 떨어져 있어
   * "안 보인다"는 말을 많이 들었다. 이제 데스크톱은 준비 현황 줄 오른쪽 끝에 붙여
   * 남은 조건과 버튼이 한눈에 들어오게 하고, 모바일만 하단 고정 바에 같은 묶음을 쓴다.
   * 조건 안내 문구는 준비 현황 줄의 칩·한 줄 설명이 대신하므로 여기엔 두지 않는다.
   */
  const lobbyActions = (
    <>
      {room.status !== "DRAFT_COMPLETED" && !currentUserIsSpectator && (
        <button
          className={`inline-flex min-h-11 items-center justify-center rounded-lg px-5 py-2.5 text-sm font-bold transition-all ${
            currentUserIsReady
              ? "border border-bg-elevated bg-bg-tertiary text-text-primary hover:bg-bg-elevated"
              : "bg-accent-primary hover:bg-accent-hover text-accent-on"
          } disabled:cursor-not-allowed disabled:opacity-50`}
          disabled={needsManualTeamSelection}
          title={
            needsManualTeamSelection ? "먼저 팀을 선택해주세요." : undefined
          }
          onClick={handleReadyToggle}
        >
          {needsManualTeamSelection
            ? "팀 선택 필요"
            : currentUserIsReady
              ? "준비 취소"
              : "준비 완료하기"}
        </button>
      )}
      {room.status !== "DRAFT_COMPLETED" && currentUserIsSpectator && (
        <span className="inline-flex min-h-11 items-center justify-center rounded-lg bg-bg-tertiary px-5 py-2.5 text-sm font-medium text-text-muted">
          관전 중
        </span>
      )}
      {/*
        자동 밸런스는 방장이 확정해야 대진표가 만들어진다. 확정 전에는
        링크를 눌러도 없는 대진표를 요청하게 되므로 감춘다.
      */}
      {room.status === "DRAFT_COMPLETED" &&
        room.teamMode !== "AUTO_BALANCE" && (
          <Link
            href={`${gamePrefix}/tournaments/${room.id}/bracket`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-success px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-success/90"
          >
            대진표 보기
          </Link>
        )}
      {/* 어드민 전용: 봇 추가 버튼 */}
      {currentUser?.role === "ADMIN" &&
        room.status === "WAITING" &&
        totalPlayers < room.maxParticipants && (
          <button
            onClick={handleAddBot}
            disabled={isAddingBot}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-bg-tertiary px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50"
            title="남은 자리를 봇으로 모두 채움 (어드민 전용)"
          >
            {isAddingBot
              ? "추가 중..."
              : `봇 채우기 (${room.maxParticipants - totalPlayers})`}
          </button>
        )}
      {isCurrentUserHost && room.status === "WAITING" && (
        <button
          className={`inline-flex min-h-11 items-center justify-center rounded-lg px-6 py-2.5 text-sm font-bold transition-all ${
            canStart
              ? "bg-accent-success text-white hover:bg-accent-success/90 animate-glow-success"
              : "border border-accent-success/60 bg-accent-success/15 text-accent-success hover:bg-accent-success/25"
          }`}
          // 비활성으로 두지 않는다. 비활성 버튼은 눌러도 반응이 없어
          // 방장이 "왜 안 되지"를 알 방법이 없다. 조건이 안 맞으면
          // 누른 순간 모달로 남은 항목과 호출 버튼을 보여준다.
          aria-disabled={!canStart}
          onClick={() => {
            if (!canStart) {
              setServerStartBlock(null);
              setStartBlockOpen(true);
              return;
            }
            startGame((err) => {
              // 서버가 사유 코드를 주면 로비에서 풀어야 하는 조건이다
              // (화면은 통과로 봤지만 서버가 실제로 확인해 막은 경우).
              // 코드가 없으면 진짜 오류라 토스트로 알린다.
              if (err.reason) {
                setServerStartBlock({
                  reason: err.reason,
                  message: err.message,
                  missingUsers: err.missingUsers ?? err.missingVoiceUsers ?? [],
                });
                setStartBlockOpen(true);
              } else {
                addToast(err.message, "error", 8000, {
                  actionable: true,
                });
              }
            });
          }}
          title={startBlockedMessage}
        >
          내전 시작
        </button>
      )}
    </>
  );

  /* ─── Chat Panel ─── */
  const chatPanel = (
    <ChatBox
      messages={messages}
      onSendMessage={sendMessage}
      currentUserId={currentUser?.id}
      // 부모가 가로 flex 라 폭을 안 주면 내용물 폭으로 줄어든다 — 입력창이 끝까지 안 닿는 원인
      className="h-full min-h-0 w-full min-w-0 overflow-hidden"
    />
  );

  return (
    <>
      <LobbyTour gameTitle={room.gameTitle as GameTitle} />
      {isCurrentUserHost && (
        <StartBlockedModal
          isOpen={startBlockOpen}
          onClose={() => setStartBlockOpen(false)}
          roomId={room.id}
          requirements={startRequirements}
          serverBlock={serverStartBlock}
          lobbyVoiceUrl={room.discordLobbyUrl ?? null}
        />
      )}
      {/* 참가자 호버 툴팁 — overflow-hidden 탈출을 위해 페이지 최상위에서 렌더링 */}
      {hoveredPlayer && (
        <PlayerHoverCard
          userId={hoveredPlayer.id}
          anchorRect={hoveredPlayer.rect}
          onOpenProfile={(uid) => {
            setProfileUserId(uid);
            setHoveredPlayer(null);
          }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
      {/*
        `h-full` 과 `flex-1` 을 **둘 다** 둔다. 하나만으로는 안 된다.

        AppShell 은 경로(`isDashboardRoute`, 정규식)에 따라 구조가 다른 부모를
        준다 — 대시보드 경로는 flex column, 그 밖은 grid item 이다.
        `flex-1` 은 부모가 flex 일 때만 먹고, `h-full` 은 부모 높이만
        확정돼 있으면 먹는다. 둘 다 있어야 어느 쪽이든 성립한다.

        아래가 전부 `flex-1 basis-0 min-h-0` 사슬이라 여기서 높이가 안 잡히면
        참가자·채팅 패널이 0 으로 접힌다. DOM 에는 있는데 화면에서 사라진다.
        같은 증상으로 이미 두 번 고쳤다(28f2bbe9, af4e4468) — 그때 지운 게
        `h-full` 이었다. 지우지 말 것.
      */}
      <div className="flex h-full min-h-0 w-full flex-1 flex-col">
        {/* ═══ Room Header ═══ */}
        <header className="bg-bg-secondary border-b border-bg-tertiary px-4 py-3 lg:px-6">
          <div className="container mx-auto flex items-center justify-between gap-4">
            {/* Left: back + room info */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={requestLeaveLobby}
                className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
                title="방 나가기"
                aria-label="방 나가기"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">방 나가기</span>
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-text-primary truncate">
                    {room.name}
                  </h1>
                  <span className="text-accent-primary text-sm font-mono">
                    #{room.id.slice(0, 4)}
                  </span>
                  {room.isPrivate && (
                    <span className="px-1.5 py-0.5 bg-bg-tertiary rounded text-[10px] font-semibold text-text-secondary flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      비공개
                    </span>
                  )}
                </div>
                {/* Badges row - visible on md+ */}
                <div className="hidden md:flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-bg-tertiary py-0.5 pl-2 pr-0.5 text-xs text-text-secondary">
                    <Swords className="h-3 w-3" />
                    {teamModeLabel}
                    <TeamModeHelp mode={room.teamMode as TeamMode} compact />
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary rounded-full text-xs text-text-secondary">
                    <Users className="h-3 w-3" />
                    {totalPlayers}/{room.maxParticipants}
                    {spectators.length > 0 && ` (+${spectators.length} 관전)`}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-bg-tertiary rounded-full text-xs text-text-secondary">
                    {bracketLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: setting buttons */}
            <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
              <button
                onClick={handleShare}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                title="내전 방 링크 공유"
                aria-label="내전 방 링크 공유"
              >
                <Share2 className="h-5 w-5" />
              </button>
              <button
                onClick={() => setIsUserSettingsModalOpen(true)}
                className="hidden min-h-11 min-w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary sm:inline-flex"
                title="내 설정"
                aria-label="내 설정"
              >
                <UserCog className="h-5 w-5" />
              </button>
              {isCurrentUserHost && (
                <button
                  onClick={() => setIsBroadcastModalOpen(true)}
                  className="hidden min-h-11 min-w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary sm:inline-flex"
                  title="방송용 오버레이 링크"
                  aria-label="방송용 오버레이 링크"
                >
                  <Radio className="h-5 w-5" />
                </button>
              )}
              {isCurrentUserHost && (
                <button
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="hidden min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary sm:inline-flex md:px-3"
                  title="방 설정"
                  aria-label="방 설정"
                >
                  <Settings className="h-5 w-5" />
                  <span className="hidden md:inline">방 설정</span>
                </button>
              )}
              <Dropdown
                align="right"
                className="sm:hidden"
                trigger={
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                    aria-label="로비 메뉴"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                }
                items={[
                  {
                    key: "user-settings",
                    label: "내 설정",
                    icon: <UserCog className="h-4 w-4" />,
                    onClick: () => setIsUserSettingsModalOpen(true),
                  },
                  ...(isCurrentUserHost
                    ? [
                        {
                          key: "broadcast",
                          label: "방송 링크",
                          icon: <Radio className="h-4 w-4" />,
                          onClick: () => setIsBroadcastModalOpen(true),
                        },
                        {
                          key: "room-settings",
                          label: "방 설정",
                          icon: <Settings className="h-4 w-4" />,
                          onClick: () => setIsSettingsModalOpen(true),
                        },
                        {
                          key: "leave-room",
                          label: "방 나가기",
                          danger: true,
                          icon: <ArrowLeft className="h-4 w-4" />,
                          onClick: requestLeaveLobby,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>
        </header>

        {/*
          ═══ 준비 현황 스트립 — 편성 확인 단계에선 이미 전원 준비 완료라 숨긴다 ═══
          예전엔 상태 배지·전체/준비/대기 숫자·조건 카드·칸 바·모드별 "진행 조건"
          배너가 같은 정보(인원·준비)를 대여섯 번 반복했다. 조건 칩 한 줄로 합친다.
          - 모드 설명은 헤더의 모드 배지 (?) 가 이미 한다 → 여기선 안 한다
          - 누가 준비했는지는 참가자 카드가 보여준다 → 칸 바는 없앤다
          - 막힌 이유(대기자 이름 등)는 첫 미완료 조건의 detail 한 줄로만 보인다
        */}
        {!isAutoBalanceReviewStage && (
          <div
            data-tour="lobby-ready-status"
            className={`border-b px-4 py-2 lg:px-6 ${
              canStart
                ? "border-accent-success/30 bg-accent-success/10"
                : "border-bg-tertiary bg-bg-secondary/90"
            }`}
          >
            <div className="container mx-auto flex flex-col gap-2">
              <div
                aria-label="내전 시작 조건"
                aria-live="polite"
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5"
              >
                {/* 전체 상태 — 시작 가능/정원 대기/N명 대기 */}
                <span
                  className={`inline-flex flex-none items-center gap-1.5 text-sm font-bold ${
                    canStart ? "text-accent-success" : "text-text-primary"
                  }`}
                >
                  {canStart ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Clock3 className="h-4 w-4 text-accent-primary" />
                  )}
                  {readyBarStatus}
                </span>
                {/* 조건 칩 — 상세(대기자 이름 등)는 호버 툴팁으로 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {startRequirements.map((requirement) => (
                    <span
                      key={requirement.id}
                      title={requirement.detail}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        requirement.complete
                          ? "border-accent-success/30 bg-accent-success/10 text-accent-success"
                          : "border-accent-warning/30 bg-accent-warning/10 text-accent-warning"
                      }`}
                    >
                      {requirement.complete ? (
                        <CheckCircle2 className="h-3 w-3 flex-none" />
                      ) : (
                        <Clock3 className="h-3 w-3 flex-none" />
                      )}
                      {requirement.label}
                      <span className="font-bold">{requirement.value}</span>
                    </span>
                  ))}
                </div>
                {/* 막힌 이유 한 줄 — 첫 미완료 조건 기준. 좁으면 말줄임. 비어도 자리를 차지해 버튼을 오른쪽 끝으로 민다 */}
                <span
                  className="min-w-0 flex-1 truncate text-xs text-text-secondary"
                  title={firstBlockingRequirement?.detail}
                >
                  {firstBlockingRequirement?.detail}
                </span>
                {/* 준비·시작 버튼 — 데스크톱 전용(모바일은 하단 고정 바) */}
                <div
                  data-tour="lobby-ready-action"
                  className="hidden flex-none items-center gap-2 lg:flex"
                >
                  {lobbyActions}
                </div>
              </div>
              {hasDiscordVoice &&
                !currentUserIsSpectator &&
                currentUserParticipant?.inVoice === false && (
                  <div className="flex items-start gap-3 rounded-xl border border-accent-warning/30 bg-accent-warning/10 px-4 py-3">
                    <Headphones className="mt-0.5 h-5 w-5 flex-none text-accent-warning" />
                    <div>
                      <p className="text-sm font-bold text-text-primary">
                        Discord 음성 대기실에 먼저 들어가세요
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-text-secondary">
                        방 생성 때 선택한 Discord 서버에서 「『
                        {pubgRoomTitle(
                          room.name,
                          room.gameTitle === "PUBG" ? room.pubgPlatform : null,
                        )}
                        』 → ── 대기실 ──」로 입장하세요. 전원이 준비하고
                        대기실에 있어야 시작되며, 팀 확정 후 봇이 팀 채널로 자동
                        이동시킵니다.
                      </p>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* ═══ Main Content: Desktop 2-col / Mobile Tabs ═══ */}
        <div className="flex min-h-0 w-full flex-1 basis-0 overflow-hidden">
          {isAutoBalanceReviewStage ? (
            /* ═══ 편성 확인 전용 데스크톱 레이아웃 ═══
               팀 배치가 곧 참가자 목록이므로 중복 패널은 없애고 화면 폭을 전부 쓴다. */
            <div className="hidden h-full min-h-0 w-full gap-4 px-4 py-4 lg:flex xl:px-6">
              <section
                data-tour="lobby-participants"
                className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
              >
                {autoBalanceReview}
              </section>
              <aside
                data-tour="lobby-chat"
                className="flex min-h-0 w-80 flex-shrink-0 flex-col overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary 2xl:w-96"
              >
                <div className="border-b border-bg-tertiary px-4 py-2.5">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
                    <MessageSquare className="h-4 w-4 text-text-secondary" />
                    채팅
                  </h2>
                </div>
                <div className="flex min-h-0 flex-1 basis-0 overflow-hidden">
                  {chatPanel}
                </div>
              </aside>
            </div>
          ) : (
            /* Desktop layout (lg+) */
            <div className="container mx-auto hidden min-h-0 min-w-0 flex-1 gap-4 overflow-hidden px-6 py-4 lg:flex">
              {/* Participants: 2/3 */}
              <section
                data-tour="lobby-participants"
                className="flex min-h-0 min-w-0 flex-[2] flex-col overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary"
              >
                <div className="px-5 py-3 border-b border-bg-tertiary flex items-center justify-between">
                  <h2 className="font-bold text-text-primary flex items-center gap-2">
                    <Users className="h-5 w-5 text-text-secondary" />
                    {room.teamMode === "MANUAL_TEAM" ? "팀 편성" : "참가자"}
                    <span className="text-sm font-normal text-text-tertiary">
                      {totalPlayers}/{room.maxParticipants}
                    </span>
                  </h2>
                </div>
                <div className="min-h-0 flex-1 basis-0 space-y-4 overflow-y-auto p-4">
                  {participantsList}
                </div>
              </section>

              {/* Chat: 1/3 */}
              <section
                data-tour="lobby-chat"
                className="flex min-h-0 min-w-0 flex-[1] flex-col overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary"
              >
                <div className="px-5 py-3 border-b border-bg-tertiary">
                  <h2 className="font-bold text-text-primary flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-text-secondary" />
                    채팅
                  </h2>
                </div>
                <div className="flex min-h-0 flex-1 basis-0 overflow-hidden">
                  {chatPanel}
                </div>
              </section>
            </div>
          )}

          {/* Mobile layout (< lg) */}
          <div className="flex h-full min-h-0 w-full flex-1 basis-0 flex-col lg:hidden">
            <Tabs
              defaultValue="participants"
              value={mobileTab}
              onValueChange={setMobileTab}
              className="flex h-full min-h-0 flex-col overflow-hidden"
            >
              <div className="px-4 pt-3 flex-shrink-0">
                <TabsList className="w-full">
                  <TabsTrigger
                    data-tour="lobby-participants"
                    value="participants"
                    className="flex-1 justify-center"
                  >
                    <Users className="h-4 w-4 mr-1.5" />
                    {isAutoBalanceReviewStage
                      ? "편성 확인"
                      : room.teamMode === "MANUAL_TEAM"
                        ? "팀 편성"
                        : "참가자"}{" "}
                    ({totalPlayers})
                  </TabsTrigger>
                  <TabsTrigger
                    data-tour="lobby-chat"
                    value="chat"
                    className="flex-1 justify-center relative"
                  >
                    <MessageSquare className="h-4 w-4 mr-1.5" />
                    채팅
                    {unreadChatCount > 0 && (
                      <span
                        className="ml-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-accent-danger px-1.5 text-[11px] font-bold leading-none text-white"
                        aria-label={
                          unreadChatCount >= 100
                            ? "읽지 않은 채팅 100개 이상"
                            : `읽지 않은 채팅 ${unreadChatCount}개`
                        }
                      >
                        {unreadChatCount >= 100 ? "99+" : unreadChatCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="participants"
                className="min-h-0 flex-1 basis-0 space-y-4 overflow-y-auto overscroll-contain p-4"
              >
                {autoBalanceReview}
                {/* 편성 확인 중엔 팀 배치가 곧 참가자 목록이라 숨긴다 */}
                {!isAutoBalanceReviewStage && participantsList}
              </TabsContent>
              <TabsContent
                value="chat"
                className="flex min-h-0 flex-1 basis-0 overflow-hidden p-4"
              >
                {chatPanel}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* ═══ 모바일 하단 고정 액션 바 — 데스크톱은 준비 현황 줄 오른쪽에 있다 ═══ */}
        {!isAutoBalanceReviewStage && (
          <footer
            data-tour="lobby-ready-action"
            className="sticky bottom-0 z-20 flex-shrink-0 border-t border-bg-tertiary bg-bg-secondary px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_20px_rgb(0_0_0/0.12)] lg:hidden"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
              {lobbyActions}
            </div>
          </footer>
        )}
      </div>

      {/* ═══ Modals ═══ */}
      {isCurrentUserHost && (
        <RoomSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          room={room}
        />
      )}
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
      <ConfirmModal
        isOpen={isLeaveConfirmOpen}
        onClose={() => setIsLeaveConfirmOpen(false)}
        onConfirm={async () => {
          setIsLeaveConfirmOpen(false);
          await handleLeaveLobby();
        }}
        title="방을 나가시겠습니까?"
        message={
          room.status === "WAITING"
            ? "준비 상태와 참가 슬롯이 해제됩니다."
            : "진행 중인 내전의 실시간 연결을 종료합니다."
        }
        confirmText="방 나가기"
        cancelText="계속 있기"
        variant="danger"
      />
      <UserSettingsModal
        isOpen={isUserSettingsModalOpen}
        onClose={() => setIsUserSettingsModalOpen(false)}
      />

      {isCurrentUserHost && (
        <BroadcastLinkModal
          isOpen={isBroadcastModalOpen}
          onClose={() => setIsBroadcastModalOpen(false)}
          roomId={room.id}
        />
      )}
      <PlayerProfileModal
        userId={profileUserId}
        onClose={() => setProfileUserId(null)}
      />
    </>
  );
}
