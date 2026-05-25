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
import {
  Users, X, MessageSquare, Settings,
  UserCog,
  ArrowLeft, Shield, Swords, Volume2, VolumeX, Share2,
} from "lucide-react";
import Link from "next/link";
import { friendApi, adminApi, roomApi } from "@/lib/api-client";
import { PlayerHoverCard } from "./_components/PlayerHoverCard";
import { PlayerProfileModal } from "./_components/PlayerProfileModal";
import { LobbyParticipantsList } from "./_components/LobbyParticipantsList";
import { LobbyErrorState } from "./_components/LobbyErrorState";

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
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [addingFriend, setAddingFriend] = useState<string | null>(null);
  const [sentFriendIds, setSentFriendIds] = useState<Set<string>>(new Set());
  const [mobileTab, setMobileTab] = useState<string>("participants");
  const hasRedirected = useRef(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      addToast={addToast}
    />
  );

  /* ─── Chat Panel ─── */
  const chatPanel = (
    <ChatBox messages={messages} onSendMessage={sendMessage} currentUserId={currentUser?.id} className="h-full" />
  );

  return (
    <>
      {/* 참가자 호버 툴팁 — overflow-hidden 탈출을 위해 페이지 최상위에서 렌더링 */}
      {hoveredPlayer && (
        <PlayerHoverCard
          participant={hoveredPlayer.participant}
          anchorRect={hoveredPlayer.rect}
          onOpenProfile={(userId) => {
            setProfileUserId(userId);
            setHoveredPlayer(null);
          }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
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
      <PlayerProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </>
  );
}
