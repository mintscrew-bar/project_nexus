"use client";

import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAuction } from "@/hooks/useAuction";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { AuctionBoard, TierBadge, PlayerHoverCard, PlayerProfileModal } from "@/components/domain";
import { LoadingSpinner, Badge, Button, Card, CardContent, ConfirmModal, Avatar } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { GameChatPanel } from "@/components/domain/GameChatPanel";
import { cn } from "@/lib/utils";
import { Users, Hand, Check, Coins, ScrollText, Gavel, MessageSquare, Maximize2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

const ROLE_ICON: Record<string, string> = {
  TOP: '/icons/positions/position-top.svg',
  JUNGLE: '/icons/positions/position-jungle.svg',
  MID: '/icons/positions/position-middle.svg',
  MIDDLE: '/icons/positions/position-middle.svg',
  ADC: '/icons/positions/position-bottom.svg',
  BOTTOM: '/icons/positions/position-bottom.svg',
  SUPPORT: '/icons/positions/position-utility.svg',
  UTILITY: '/icons/positions/position-utility.svg',
};

function RoleIcon({ role, dim }: { role?: string; dim?: boolean }) {
  if (!role) return null;
  const url = ROLE_ICON[role.toUpperCase()];
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={role} className="h-3.5 w-3.5 shrink-0 brightness-0 invert" style={{ opacity: dim ? 0.35 : 0.8 }} />;
}

/** 대기 선수 목록 (데스크톱 사이드바 & 모바일 탭에서 공유) */
function PlayersList({
  players,
  currentPlayerId,
  onExpand,
  compact = false,
}: {
  players: any[];
  currentPlayerId?: string;
  onExpand?: () => void;
  compact?: boolean;
}) {
  const [hoveredPlayer, setHoveredPlayer] = useState<{ userId: string; rect: DOMRect } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);
  const scheduleHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);
  const handleHover = useCallback((userId: string, el: HTMLElement) => {
    cancelHoverClose();
    const rect = el.getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer({ userId, rect }), 300);
  }, [cancelHoverClose]);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* compact 모드에서는 카드 헤더가 대신하므로 내부 헤더 생략 */}
      {!compact && (
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            대기 선수 ({players.length})
          </h3>
          {onExpand && (
            <button
              onClick={onExpand}
              className="text-text-tertiary hover:text-text-primary p-1.5 rounded-md hover:bg-bg-tertiary transition-colors"
              title="전체 보기"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {compact ? (
        /* compact: 2열 그리드로 한눈에 보기 */
        <div className="flex-1 min-h-0 overflow-y-auto">
          {players.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">모든 선수가 배정되었습니다</p>
          ) : (
            <div className="grid grid-cols-2 gap-1 p-0.5">
              {players.map((player, idx) => {
                const isCurrentTarget = currentPlayerId === player.id;
                const tierIcon = player.tier ? `/icons/tiers/${player.tier.toLowerCase()}.png` : null;
                return (
                  <div
                    key={player.id}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors cursor-pointer",
                      isCurrentTarget
                        ? "bg-accent-primary/15 ring-1 ring-accent-primary/40"
                        : "bg-bg-secondary hover:bg-bg-tertiary",
                    )}
                    onMouseEnter={(e) => handleHover(player.id, e.currentTarget)}
                    onMouseLeave={scheduleHoverClose}
                    onClick={() => setProfileUserId(player.id)}
                  >
                    <span className="w-3.5 shrink-0 text-center text-[9px] text-text-muted">
                      {idx + 1}
                    </span>
                    {tierIcon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tierIcon} alt={player.tier} width={13} height={13} className="shrink-0 object-contain" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-text-primary">
                      {player.username}
                    </span>
                    {(player.mainRole || player.subRole) && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        {player.mainRole && <RoleIcon role={player.mainRole} />}
                        {player.subRole && <RoleIcon role={player.subRole} dim />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* 일반 모드: 1열 상세 목록 */
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
          {players.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">모든 선수가 배정되었습니다</p>
          ) : (
            players.map((player, idx) => {
              const isCurrentTarget = currentPlayerId === player.id;
              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${
                    isCurrentTarget
                      ? "bg-accent-primary/10 border border-accent-primary/30"
                      : "bg-bg-secondary hover:bg-bg-tertiary"
                  }`}
                  onMouseEnter={(e) => handleHover(player.id, e.currentTarget)}
                  onMouseLeave={scheduleHoverClose}
                  onClick={() => setProfileUserId(player.id)}
                >
                  <span className="text-[10px] text-text-tertiary w-4 text-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center text-xs font-bold text-text-primary flex-shrink-0">
                    {player.username[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {player.username}
                    </p>
                    <div className="flex items-center gap-1">
                      <TierBadge tier={player.tier} size="sm" showIcon={false} />
                      {player.mmr !== undefined && (
                        <span className="text-[10px] font-mono text-text-muted">{player.mmr}</span>
                      )}
                      {(player.mainRole || player.subRole) && (
                        <span className="flex items-center gap-0.5 ml-auto">
                          {player.mainRole && <RoleIcon role={player.mainRole} />}
                          {player.subRole && <RoleIcon role={player.subRole} dim />}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 호버 카드 */}
      {hoveredPlayer && (
        <PlayerHoverCard
          userId={hoveredPlayer.userId}
          anchorRect={hoveredPlayer.rect}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
          onOpenProfile={(uid) => { setProfileUserId(uid); setHoveredPlayer(null); }}
        />
      )}
      {profileUserId && (
        <PlayerProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </div>
  );
}

/** 입찰 로그 (데스크톱 사이드바 & 모바일 탭에서 공유) */
function BidLog({ bidHistory, logEndRef }: { bidHistory: any[]; logEndRef: React.RefObject<HTMLDivElement> }) {
  return (
    <div className="h-full flex flex-col min-h-0">
      <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-1.5 flex-shrink-0">
        <ScrollText className="w-4 h-4" />
        입찰 내역
      </h3>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
        {bidHistory.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-4">아직 입찰이 없습니다</p>
        ) : (
          bidHistory.map((entry, idx) =>
            entry.isSeparator ? (
              <div key={idx} className="flex items-center gap-2 py-1.5 my-1">
                <div className="flex-1 h-px bg-bg-tertiary" />
                <span className="text-[10px] font-medium text-accent-primary px-1.5">
                  {entry.playerLabel}
                </span>
                <div className="flex-1 h-px bg-bg-tertiary" />
              </div>
            ) : (
              <div key={idx} className="flex items-center gap-2 p-1.5 text-xs">
                <span className="text-text-tertiary font-mono text-[10px] flex-shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="text-text-primary font-medium truncate">
                  {entry.username}
                </span>
                <span className="text-text-tertiary">→</span>
                <span className="text-accent-gold font-bold flex items-center gap-0.5 flex-shrink-0">
                  <Coins className="w-3 h-3" />
                  {entry.amount.toLocaleString()}G
                </span>
              </div>
            )
          )
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

/** 방송/운영용 팀 요약 패널 — 팀장, 예산, 5인 슬롯을 압축 표시 */
function TeamSummaryPanel({
  teams,
  currentUserId,
  auctionState,
}: {
  teams: any[];
  currentUserId?: string;
  auctionState: any;
}) {
  const [hoveredPlayer, setHoveredPlayer] = useState<{ userId: string; rect: DOMRect } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const scheduleHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);

  const handleHover = useCallback((userId: string, el: HTMLElement) => {
    cancelHoverClose();
    const rect = el.getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer({ userId, rect }), 300);
  }, [cancelHoverClose]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-2 flex h-10 shrink-0 items-center justify-between rounded-lg border border-bg-tertiary bg-bg-secondary px-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-accent-primary" />
          <span className="text-sm font-semibold text-text-primary">팀 요약</span>
        </div>
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-tertiary">
          {teams.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {teams.map((team) => {
          const members = team.members ?? [];
          const budget = team.remainingGold ?? team.remainingBudget ?? 0;
          const captain = members.find((m: any) => m.id === team.captainId);
          const captainName = captain?.username ?? team.captainName ?? team.name;
          const isMine =
            team.captainId === currentUserId ||
            members.some((m: any) => m.id === currentUserId);
          const isCurrentBidder =
            auctionState?.currentHighestBidder === team.id ||
            auctionState?.currentHighestBidder === team.captainId;
          const isFull = members.length >= 5;

          return (
          <Card
            key={team.id}
            className={cn(
              "overflow-hidden p-0",
              isCurrentBidder && "border-accent-gold/50 shadow-sm shadow-accent-gold/10",
              isMine && !isCurrentBidder && "border-accent-primary/40",
              isFull && "opacity-80",
            )}
          >
            <div
              className={cn(
                "flex items-center gap-2 border-b border-bg-tertiary/70 px-3 py-2.5",
                isCurrentBidder ? "bg-accent-gold/10" : "bg-bg-tertiary/20",
              )}
            >
              <div
                className="relative shrink-0"
                onMouseEnter={(e) => captain && handleHover(captain.id, e.currentTarget)}
                onMouseLeave={scheduleHoverClose}
                onClick={() => captain && setProfileUserId(captain.id)}
              >
                <Avatar
                  src={captain?.avatar}
                  alt={captainName}
                  fallback={captainName?.[0] ?? "?"}
                  size="sm"
                  className={cn(
                    "cursor-pointer",
                    isCurrentBidder ? "ring-2 ring-accent-gold/60" : "ring-1 ring-bg-elevated",
                  )}
                />
                <span className="absolute -bottom-1 -right-1 rounded bg-accent-gold px-1 text-[9px] font-bold text-bg-primary">
                  C
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  {team.color && (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
                  )}
                  <span className={cn("truncate text-sm font-bold", isMine ? "text-accent-primary" : "text-text-primary")}>
                    {captainName}
                  </span>
                  {isCurrentBidder && (
                    <span className="shrink-0 rounded bg-accent-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-accent-gold">
                      최고
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-text-tertiary">
                  {team.name} · {members.length}/5
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className={cn("flex items-center justify-end gap-0.5 text-xs font-bold", budget === 0 ? "text-accent-danger" : "text-accent-gold")}>
                  <Coins className="h-3 w-3" />
                  {budget.toLocaleString()}
                </div>
                <p className="text-[10px] text-text-muted">{isFull ? "만석" : `${5 - members.length}자리`}</p>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1 p-2">
              {Array.from({ length: 5 }).map((_, idx) => {
                const member = members[idx];
                if (!member) {
                  return (
                    <div key={`empty-${idx}`} className="min-w-0 rounded-lg border border-dashed border-bg-tertiary/70 bg-bg-tertiary/20 px-1 py-1.5 text-center">
                      <div className="mx-auto h-8 w-8 rounded-full bg-bg-elevated/70" />
                      <p className="mt-1 truncate text-[10px] text-text-muted">빈 슬롯</p>
                    </div>
                  );
                }
                const isCaptain = member.id === team.captainId;
                const tier = String(member.tier ?? "").toUpperCase();
                const tierIcon = tier && tier !== "UNRANKED" ? `/icons/tiers/${tier.toLowerCase()}.png` : null;
                return (
                  <div
                    key={member.id}
                    className={cn(
                      "min-w-0 cursor-pointer rounded-lg border px-1 py-1.5 text-center transition-colors hover:bg-bg-elevated",
                      isCaptain ? "border-accent-gold/30 bg-accent-gold/10" : "border-transparent bg-bg-tertiary/50",
                    )}
                    onMouseEnter={(e) => handleHover(member.id, e.currentTarget)}
                    onMouseLeave={scheduleHoverClose}
                    onClick={() => setProfileUserId(member.id)}
                  >
                    <div className="relative mx-auto h-8 w-8">
                      <Avatar src={member.avatar} alt={member.username} fallback={member.username[0]} size="sm" />
                      {isCaptain && (
                        <span className="absolute -bottom-1 -right-1 rounded bg-accent-gold px-1 text-[9px] font-bold text-bg-primary">
                          C
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center justify-center gap-0.5">
                      {tierIcon ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={tierIcon} alt={tier} width={12} height={12} className="shrink-0 object-contain" />
                        </>
                      ) : (
                        <span className="h-3 w-3 shrink-0 rounded-full bg-bg-elevated" />
                      )}
                      <span className="min-w-0 truncate text-[10px] font-medium text-text-secondary">
                        {member.username}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          );
        })}
      </div>

      {hoveredPlayer && (
        <PlayerHoverCard
          userId={hoveredPlayer.userId}
          anchorRect={hoveredPlayer.rect}
          onOpenProfile={(uid) => { setProfileUserId(uid); setHoveredPlayer(null); }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
      <PlayerProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </div>
  );
}

/** 데스크톱 우측 남은 매물 패널 */
function RemainingPlayersPanel({
  players,
  currentPlayerId,
  onExpandPlayers,
}: {
  players: any[];
  currentPlayerId?: string;
  onExpandPlayers: () => void;
}) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden p-0">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-bg-tertiary/70 bg-bg-tertiary/20 px-3">
        <Users className="h-3.5 w-3.5 text-accent-primary" />
        <span className="flex-1 text-sm font-semibold text-text-primary">남은 매물</span>
        <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-tertiary">
          {players.length}
        </span>
        <button
          onClick={onExpandPlayers}
          className="ml-1 rounded p-1.5 text-text-tertiary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          title="전체 보기"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <PlayersList
          players={players}
          currentPlayerId={currentPlayerId}
        />
      </div>
    </Card>
  );
}

export default function AuctionRoomPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.id as string;
  const { user } = useAuthStore();
  const { addToast } = useToast();
  const hasRedirected = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [selectedCaptains, setSelectedCaptains] = useState<string[]>([]);
  const [volunteerTimer, setVolunteerTimer] = useState(0);
  const [isAborting, setIsAborting] = useState(false);
  const [isAbortConfirmOpen, setIsAbortConfirmOpen] = useState(false);
  // 모바일 탭: "auction" | "players" | "log" | "chat"
  const [mobileTab, setMobileTab] = useState<"auction" | "players" | "log" | "chat">("auction");
  // 경매 완료 결과 화면 카운트다운
  const [completeCountdown, setCompleteCountdown] = useState<number | null>(null);
  // 대기 선수 전체 보기 모달
  const [playersModalOpen, setPlayersModalOpen] = useState(false);

  const {
    auctionState,
    players,
    teams,
    bidHistory,
    isConnected,
    isLoading,
    error,
    placeBid,
    captainSelectionPhase,
    volunteerAsCaptain,
    finalizeVolunteers,
    selectManualCaptains,
    sessionAbortedAt,
    sessionAbortMessage,
    clearSessionAbort,
    lastSoldEvent,
  } = useAuction(auctionId);

  const isHost = user?.id === captainSelectionPhase?.hostId;

  // VOLUNTEER 타이머 카운트다운 (클라이언트 표시용)
  useEffect(() => {
    if (!captainSelectionPhase?.timerEnd) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((captainSelectionPhase.timerEnd! - Date.now()) / 1000));
      setVolunteerTimer(left);
    }, 200);
    return () => clearInterval(interval);
  }, [captainSelectionPhase?.timerEnd]);

  // 경매 완료 → 5초 카운트다운 후 역할 선택으로 이동
  useEffect(() => {
    if (hasRedirected.current) return;
    if (auctionState?.status !== "COMPLETED") return;

    setCompleteCountdown(5);
    const interval = setInterval(() => {
      setCompleteCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          if (!hasRedirected.current) {
            hasRedirected.current = true;
            router.push(`/role-selection/${auctionId}`);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [auctionState?.status, auctionId, router]);

  useEffect(() => {
    if (!sessionAbortedAt) return;
    addToast(sessionAbortMessage ?? "내전이 종료되어 로비로 이동합니다.", "warning");
    clearSessionAbort();
    const timer = setTimeout(() => router.push(`/tournaments/${auctionId}/lobby`), 1500);
    return () => clearTimeout(timer);
  }, [sessionAbortedAt, sessionAbortMessage, clearSessionAbort, addToast, router, auctionId]);

  // 낙찰 토스트 표시
  useEffect(() => {
    if (!lastSoldEvent) return;
    addToast(
      `${lastSoldEvent.teamName}이(가) ${lastSoldEvent.playerName}을(를) ${lastSoldEvent.price.toLocaleString()}G에 낙찰!`,
      "success",
    );
  }, [lastSoldEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // 입찰 로그 자동 스크롤
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bidHistory.length]);

  // ── LoL형 레이아웃: 팀 정렬 후 좌우 균등 분할 (훅 규칙: early return 이전에 선언) ──
  // 방어: teams/이름이 null·undefined여도 절대 throw하지 않게 (비정상 방 상태에서 페이지 전체 크래시 방지)
  const sortedTeamsForLayout = useMemo(
    () =>
      [...(teams ?? [])].sort((a: any, b: any) => {
        const na = String(a?.name ?? "");
        const nb = String(b?.name ?? "");
        const ma = na.match(/\d+/);
        const mb = nb.match(/\d+/);
        const oa = ma ? Number(ma[0]) : Infinity;
        const ob = mb ? Number(mb[0]) : Infinity;
        if (oa !== ob) return oa - ob;
        return na.localeCompare(nb);
      }),
    [teams],
  );

  const handleAbortToLobby = () => setIsAbortConfirmOpen(true);

  const handleAbortConfirm = async () => {
    setIsAbortConfirmOpen(false);
    setIsAborting(true);
    try {
      await roomApi.abortToLobby(auctionId);
      addToast("내전을 종료하고 대기실로 복귀합니다.", "success");
      router.push(`/tournaments/${auctionId}/lobby`);
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "내전 종료에 실패했습니다.",
        "error",
      );
    } finally {
      setIsAborting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">경매 방에 연결 중...</p>
        </div>
      </div>
    );
  }

  if (error && !auctionState) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <p className="text-accent-danger mb-4">오류: {error}</p>
          <p className="text-text-secondary mb-6">경매 방에 연결할 수 없습니다</p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
            >
              다시 시도
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push(`/tournaments/${auctionId}/lobby`)}
            >
              로비로 돌아가기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 팀장 선정 단계
  if (captainSelectionPhase) {
    const { mode, requiredCount, volunteers, participants } = captainSelectionPhase;
    const isVolunteer = volunteers.includes(user?.id ?? '');
    const tooManyVolunteers = volunteers.length > requiredCount;
    const meParticipant = (participants ?? []).find((p: any) => p.id === user?.id);
    const volunteerParticipants = (participants ?? []).filter((p: any) => volunteers.includes(p.id));
    const otherWaitingParticipants = (participants ?? []).filter(
      (p: any) => p.id !== user?.id && !volunteers.includes(p.id),
    );
    const selectedCaptainParticipants = (participants ?? []).filter((p: any) =>
      selectedCaptains.includes(p.id),
    );
    const selectedCaptainSummary = selectedCaptainParticipants
      .map((p: any) => p.username)
      .join(", ");
    const volunteerConfirmSummary = volunteerParticipants
      .slice(0, requiredCount)
      .map((p: any) => p.username)
      .join(", ");
    const captainFooterSummary =
      mode === "MANUAL" || tooManyVolunteers
        ? selectedCaptainSummary
          ? `확정 대상: ${selectedCaptainSummary}`
          : `${requiredCount}명을 선택해야 확정할 수 있습니다.`
        : volunteers.length === 0
          ? "지원자 없이 MMR 상위 참가자로 자동 선정합니다."
          : volunteers.length < requiredCount
            ? `현재 지원: ${volunteerConfirmSummary} · 부족분은 MMR로 자동 선정`
            : `확정 대상: ${volunteerConfirmSummary}`;
    const progressPct = Math.min(100, (volunteers.length / requiredCount) * 100);
    // 자원자 부족 시 백엔드가 MMR로 자동 채움
    const willBeFilledByMmr = !tooManyVolunteers && volunteers.length < requiredCount;

    return (
      <div className="flex-grow min-h-0 p-4 md:p-8">
        <div className="container mx-auto flex h-[calc(100vh-6rem)] max-w-4xl min-h-[520px] flex-col">
          {/* 헤더 */}
          <div className="mb-4 flex-shrink-0 text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-1">팀장 선정</h1>
            {mode === 'VOLUNTEER' && (
              <p className="text-text-secondary">
                필요 팀장 <span className="font-bold text-accent-primary">{requiredCount}명</span>
                {captainSelectionPhase.timerEnd && (
                  <span className="ml-3 text-accent-warning font-mono text-lg">{volunteerTimer}초</span>
                )}
              </p>
            )}
            {mode === 'MANUAL' && (
              <p className="text-text-secondary">
                {isHost
                  ? <>참가자 중 <span className="font-bold text-accent-primary">{requiredCount}명</span>의 팀장을 선택해주세요</>
                  : <>방장이 <span className="font-bold text-accent-primary">{requiredCount}명</span>의 팀장을 선택하고 있습니다</>}
              </p>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-4">
            {/* ─── VOLUNTEER 모드 ─── */}
            {mode === 'VOLUNTEER' && (
            <>
              {/* 1) 본인 액션 카드 — 가장 큰 시각 비중, 명시적 지원/취소 버튼 */}
              {meParticipant && (
                <Card className="mb-4">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 mb-4">
                      <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 transition-colors',
                        isVolunteer
                          ? 'bg-accent-primary text-white'
                          : 'bg-bg-elevated text-text-primary',
                      )}>
                        {meParticipant.username[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-text-primary truncate">{meParticipant.username}</div>
                        {meParticipant.tier && (
                          <div className="text-xs text-text-tertiary">
                            {meParticipant.tier} {meParticipant.rank} · MMR {meParticipant.mmr}
                          </div>
                        )}
                        <div className={cn(
                          'mt-1 text-xs font-medium',
                          isVolunteer ? 'text-accent-success' : 'text-text-tertiary',
                        )}>
                          {isVolunteer ? '✓ 팀장 지원 완료' : '아직 지원하지 않음'}
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => volunteerAsCaptain(auctionId)}
                      variant={isVolunteer ? 'secondary' : 'primary'}
                      className="w-full"
                      size="lg"
                    >
                      {isVolunteer ? '지원 취소' : (
                        <>
                          <Hand className="w-4 h-4 mr-2" />
                          팀장 지원하기
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* 2) 자원자 현황 — 진행 바 + 자원자 카드 (초과 시 방장 선택 영역) */}
              <Card className="mb-4">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-text-primary">자원자 현황</span>
                    <span className={cn(
                      'text-sm font-bold tabular-nums',
                      tooManyVolunteers ? 'text-accent-warning' : 'text-accent-primary',
                    )}>
                      {volunteers.length}/{requiredCount}명
                    </span>
                  </div>
                  <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mb-3">
                    <div
                      className={cn(
                        'h-full transition-all',
                        tooManyVolunteers ? 'bg-accent-warning' : 'bg-accent-primary',
                      )}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {volunteerParticipants.length === 0 ? (
                    <p className="text-xs text-text-tertiary text-center py-2">
                      아직 자원한 사람이 없습니다.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {volunteerParticipants.map((p: any) => {
                        const isSelected = tooManyVolunteers && selectedCaptains.includes(p.id);
                        const canHostSelect = tooManyVolunteers && isHost;
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              'flex items-center gap-2.5 p-2 rounded-lg border transition-all',
                              canHostSelect ? 'cursor-pointer hover:border-accent-primary/50' : 'cursor-default',
                              isSelected
                                ? 'border-accent-primary bg-accent-primary/10'
                                : 'border-bg-tertiary bg-bg-secondary',
                            )}
                            onClick={() => {
                              if (!canHostSelect) return;
                              setSelectedCaptains(prev =>
                                prev.includes(p.id)
                                  ? prev.filter(id => id !== p.id)
                                  : prev.length < requiredCount ? [...prev, p.id] : prev
                              );
                            }}
                          >
                            <div className="w-7 h-7 rounded-full bg-accent-primary/20 text-accent-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {p.username[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-text-primary truncate block">{p.username}</span>
                              {p.tier && <span className="text-[11px] text-text-tertiary">{p.tier} {p.rank}</span>}
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-accent-primary flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {tooManyVolunteers && (
                    <p className="text-xs text-accent-warning mt-3 text-center">
                      {isHost
                        ? `자원자가 초과되었습니다. ${requiredCount}명을 선택해 확정해주세요.`
                        : '자원자가 초과되어 방장이 선택합니다.'}
                    </p>
                  )}
                  {willBeFilledByMmr && volunteers.length > 0 && (
                    <p className="text-xs text-text-tertiary mt-3 text-center">
                      자원자가 부족하면 부족한 자리는 MMR 상위 참가자로 자동 채워집니다.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* 3) 아직 미지원 참가자 (작은 칩) */}
              {otherWaitingParticipants.length > 0 && (
                <Card className="mb-4">
                  <CardContent className="p-4">
                    <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                      대기 중 ({otherWaitingParticipants.length})
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {otherWaitingParticipants.map((p: any) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-secondary text-xs text-text-secondary"
                          title={p.tier ? `${p.username} · ${p.tier} ${p.rank}` : p.username}
                        >
                          <div className="w-4 h-4 rounded-full bg-bg-elevated flex items-center justify-center text-[9px] font-bold">
                            {p.username[0].toUpperCase()}
                          </div>
                          <span className="truncate max-w-[120px]">{p.username}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

            {/* ─── MANUAL 모드 ─── */}
            {mode === 'MANUAL' && (
            <>
              {isHost ? (
                <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(participants ?? []).map((p: any) => {
                    const isSelected = selectedCaptains.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                          isSelected
                            ? 'border-accent-primary bg-accent-primary/10'
                            : 'border-bg-tertiary bg-bg-secondary hover:border-accent-primary/50',
                        )}
                        onClick={() => {
                          setSelectedCaptains(prev =>
                            prev.includes(p.id)
                              ? prev.filter(id => id !== p.id)
                              : prev.length < requiredCount ? [...prev, p.id] : prev
                          );
                        }}
                      >
                        <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-sm font-bold text-text-primary flex-shrink-0">
                          {p.username[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-text-primary truncate block">{p.username}</span>
                          {p.tier && <span className="text-xs text-text-tertiary">{p.tier} {p.rank} · MMR {p.mmr}</span>}
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-accent-primary flex-shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 비방장: 참가자 목록 표시 (방장 선택 중 상태 안내) */
                <Card className="mb-6">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Users className="w-4 h-4 text-accent-primary animate-pulse" />
                      <p className="text-text-primary font-medium">방장이 팀장을 선택 중입니다</p>
                    </div>
                    {(participants ?? []).length > 0 ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {(participants ?? []).map((p: any) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2.5 p-2 rounded-lg bg-bg-secondary"
                          >
                            <div className="w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold text-text-primary flex-shrink-0">
                              {p.username[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-text-primary truncate block">{p.username}</span>
                              {p.tier && <span className="text-[11px] text-text-tertiary">{p.tier} {p.rank}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-text-tertiary text-center py-2">잠시만 기다려주세요...</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
            )}
          </div>

          {/* 방장 마감/확정 버튼 */}
          {(mode === 'VOLUNTEER' || mode === 'MANUAL') && isHost && (
            <div className="flex-shrink-0 border-t border-bg-tertiary bg-bg-primary/95 px-1 pt-4 backdrop-blur">
              <p className="mx-auto mb-3 max-w-xl truncate text-center text-xs font-medium text-text-secondary">
                {captainFooterSummary}
              </p>
              {mode === 'VOLUNTEER' && (
                <div className="flex justify-center">
                  <Button
                    onClick={() => finalizeVolunteers(auctionId, tooManyVolunteers ? selectedCaptains : undefined)}
                    disabled={tooManyVolunteers && selectedCaptains.length !== requiredCount}
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    {tooManyVolunteers
                      ? `${selectedCaptains.length}/${requiredCount}명 선택 후 확정`
                      : volunteers.length === requiredCount
                        ? '팀장 확정'
                        : volunteers.length === 0
                          ? 'MMR 자동 선정으로 시작'
                          : `지금 마감 (부족분 MMR 자동)`}
                  </Button>
                </div>
              )}
              {mode === 'MANUAL' && (
                <div className="flex justify-center">
                  <Button
                    onClick={() => selectManualCaptains(auctionId, selectedCaptains)}
                    disabled={selectedCaptains.length !== requiredCount}
                    size="lg"
                    className="w-full sm:w-auto"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    팀장 {selectedCaptains.length}/{requiredCount}명 확정
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 경매 완료 결과 요약 화면
  if (auctionState?.status === "COMPLETED" && completeCountdown !== null) {
    return (
      <div className="flex-grow p-4 md:p-8">
        <div className="container mx-auto max-w-3xl animate-fade-in">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-text-primary mb-2">경매 완료!</h1>
            <p className="text-text-secondary">
              {completeCountdown > 0
                ? `${completeCountdown}초 후 역할 선택으로 이동합니다...`
                : "이동 중..."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {(teams ?? [])
              .slice()
              .sort((a, b) => {
                const na = String(a?.name ?? "");
                const nb = String(b?.name ?? "");
                const oa = na.match(/\d+/) ? Number(na.match(/\d+/)![0]) : Infinity;
                const ob = nb.match(/\d+/) ? Number(nb.match(/\d+/)![0]) : Infinity;
                return oa - ob || na.localeCompare(nb);
              })
              .map((team) => {
                const members = (team as any).members ?? [];
                const budget = (team as any).remainingGold ?? (team as any).remainingBudget ?? 0;
                return (
                  <Card key={team.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {(team as any).color && (
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: (team as any).color }} />
                          )}
                          <h3 className="font-semibold text-text-primary">{team.name}</h3>
                        </div>
                        <div className="flex items-center gap-1 text-sm">
                          <Coins className="w-3.5 h-3.5 text-accent-gold" />
                          <span className="font-bold text-accent-gold">{budget.toLocaleString()}G</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {members.map((m: any) => (
                          <div key={m.id} className={cn(
                            "flex items-center gap-2 p-1.5 rounded text-sm",
                            m.id === team.captainId ? "bg-accent-gold/10" : "bg-bg-tertiary",
                          )}>
                            <span className="text-[10px] text-text-tertiary w-3 flex-shrink-0">
                              {m.id === team.captainId ? "C" : "·"}
                            </span>
                            <span className="font-medium text-text-primary truncate flex-1">{m.username}</span>
                            <TierBadge tier={m.tier} size="sm" showIcon={false} />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>

          <div className="text-center">
            <Button
              variant="primary"
              onClick={() => {
                hasRedirected.current = true;
                setCompleteCountdown(0);
                router.push(`/role-selection/${auctionId}`);
              }}
            >
              역할 선택으로 이동
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!auctionState) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <LoadingSpinner size="lg" />
          <p className="text-lg font-semibold text-text-primary mt-4">경매 준비 중</p>
          <p className="text-text-secondary mt-2">팀장이 확정되었습니다. 잠시 후 경매가 시작됩니다...</p>
          {!isConnected && (
            <div className="mt-6">
              <p className="text-accent-warning text-sm mb-3">연결이 끊어졌습니다</p>
              <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
                다시 연결
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 현재 유저가 캡틴인지 (모바일 하단 입찰 패널 표시 여부 판단)
  const myTeam = teams.find((t) => t.captainId === user?.id);
  const isCaptainTurn = Boolean(myTeam) && auctionState.status === "IN_PROGRESS";
  // currentHighestBidder는 teamId 또는 userId일 수 있음 — 둘 다 체크
  const isAlreadyHighest = !!auctionState.currentHighestBidder && (
    auctionState.currentHighestBidder === user?.id ||
    auctionState.currentHighestBidder === myTeam?.id
  );

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <ConfirmModal
        isOpen={isAbortConfirmOpen}
        onClose={() => setIsAbortConfirmOpen(false)}
        onConfirm={handleAbortConfirm}
        title="내전 종료"
        message="현재 판을 종료하고 대기실로 돌아가시겠습니까? 이 판은 전적에 반영되지 않습니다."
        confirmText="종료"
        cancelText="취소"
        variant="danger"
        isLoading={isAborting}
      />

      <div className="mx-auto flex w-full max-w-[1720px] flex-1 flex-col min-h-0">
        {/* 헤더 */}
        <div className="mb-3 flex h-12 shrink-0 items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">
              경매 진행 중
              <span className="text-sm font-normal text-text-secondary ml-2">
                ({players.length}명 남음)
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {error && auctionState && (
              <span className="hidden sm:inline text-xs text-accent-danger animate-fade-in">
                {error}
              </span>
            )}
            <Badge variant={isConnected ? 'success' : 'danger'} className="hidden sm:inline-flex">
              {isConnected ? '● 연결됨' : '● 연결 끊김'}
            </Badge>
            <Button
              variant="danger"
              size="sm"
              isLoading={isAborting}
              onClick={handleAbortToLobby}
            >
              <span className="hidden sm:inline">내전 종료</span>
              <span className="sm:hidden">종료</span>
            </Button>
          </div>
        </div>

        {/* 모바일 입찰 에러 */}
        {error && auctionState && (
          <div className="sm:hidden mb-3 p-2.5 bg-accent-danger/10 border border-accent-danger/30 rounded-lg text-sm text-accent-danger text-center animate-fade-in">
            {error}
          </div>
        )}

        {/* ── 모바일 탭 네비게이션 (lg 미만) ── */}
        <div className="lg:hidden flex shrink-0 rounded-lg bg-bg-secondary p-1 mb-3 gap-1">
          {([
            { key: "auction" as const, label: "경매", icon: Gavel },
            { key: "players" as const, label: "대기", icon: Users },
            { key: "log" as const, label: "로그", icon: ScrollText },
            { key: "chat" as const, label: "채팅", icon: MessageSquare },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-colors",
                mobileTab === key
                  ? "bg-bg-primary text-accent-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── 데스크톱: 팀 요약 | 경매 | 남은 매물 ── */}
        <div className="hidden min-h-0 flex-1 gap-3 lg:grid lg:grid-rows-1 lg:grid-cols-[300px_minmax(0,1fr)_280px] xl:grid-cols-[340px_minmax(0,1fr)_320px] 2xl:grid-cols-[380px_minmax(0,1fr)_360px]">
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_260px] gap-3 overflow-hidden">
            <TeamSummaryPanel
              teams={sortedTeamsForLayout}
              currentUserId={user?.id}
              auctionState={auctionState}
            />
            <GameChatPanel roomId={auctionId} variant="inline" className="min-h-0" />
          </div>

          <div className="min-h-0 overflow-y-auto pr-1">
            <AuctionBoard
              auctionState={auctionState}
              teams={teams}
              players={players}
              currentUserId={user?.id}
              onPlaceBid={placeBid}
              disabled={!isConnected}
              bidHistory={bidHistory}
              hideTeams
              className="min-h-full"
            />
          </div>

          <RemainingPlayersPanel
            players={players}
            currentPlayerId={auctionState.currentPlayer?.id}
            onExpandPlayers={() => setPlayersModalOpen(true)}
          />
        </div>

        {/* ── 모바일: 탭 컨텐츠 (lg 미만) ── */}
        <div className="flex-1 min-h-0 overflow-auto lg:hidden">
          {mobileTab === "auction" && (
            <AuctionBoard
              auctionState={auctionState}
              teams={teams}
              players={players}
              currentUserId={user?.id}
              onPlaceBid={placeBid}
              disabled={!isConnected}
              bidHistory={bidHistory}
              hideBidPanel
            />
          )}
          {mobileTab === "players" && (
            <Card>
              <CardContent className="p-3">
                <PlayersList players={players} currentPlayerId={auctionState.currentPlayer?.id} />
              </CardContent>
            </Card>
          )}
          {mobileTab === "log" && (
            <Card>
              <CardContent className="p-3 h-[60vh]">
                <BidLog bidHistory={bidHistory} logEndRef={logEndRef} />
              </CardContent>
            </Card>
          )}
          {mobileTab === "chat" && (
            <GameChatPanel
              roomId={auctionId}
              variant="inline"
              className="h-[60vh]"
            />
          )}
        </div>
      </div>

      {/* ── 모바일 하단 고정 입찰 패널 (lg 미만, 캡틴 차례일 때만) ── */}
      {isCaptainTurn && auctionState.currentPlayer && (
        <MobileBidPanel
          auctionState={auctionState}
          myTeam={myTeam!}
          isAlreadyHighest={isAlreadyHighest}
          isConnected={isConnected}
          onPlaceBid={placeBid}
          onFocusAuction={() => setMobileTab("auction")}
        />
      )}

      {/* 모바일에서 하단 입찰 패널이 있을 때 여백 확보 */}
      {isCaptainTurn && auctionState.currentPlayer && (
        <div className="lg:hidden h-48" />
      )}

      {/* 대기 선수 전체 보기 모달 */}
      <Modal
        isOpen={playersModalOpen}
        onClose={() => setPlayersModalOpen(false)}
        title={`대기 선수 (${players.length}명)`}
        size="lg"
      >
        <div className="h-[60vh]">
          <PlayersList
            players={players}
            currentPlayerId={auctionState.currentPlayer?.id}
          />
        </div>
      </Modal>
    </div>
  );
}

/** 모바일 하단 고정 입찰 패널 — lg 미만에서만 표시 */
function MobileBidPanel({
  auctionState,
  myTeam,
  isAlreadyHighest,
  isConnected,
  onPlaceBid,
  onFocusAuction,
}: {
  auctionState: any;
  myTeam: any;
  isAlreadyHighest: boolean;
  isConnected: boolean;
  onPlaceBid: (amount: number) => void | Promise<void>;
  onFocusAuction?: () => void;
}) {
  const [accBid, setAccBid] = useState(0);
  const [isBidding, setIsBidding] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const bidIncrement = auctionState.bidIncrement ?? 50;
  const bidSteps = [bidIncrement, bidIncrement * 2, bidIncrement * 5];
  const memberCount = myTeam.members?.length ?? 0;
  const slotsNeeded = Math.max(0, 5 - memberCount);
  const reserveAmount = Math.max(0, (slotsNeeded - 1) * bidIncrement);
  const budget = (myTeam.remainingGold ?? myTeam.remainingBudget ?? 0);
  const availableBudget = Math.max(0, budget - reserveAmount);
  const totalBid = auctionState.currentHighestBid + accBid;
  const canBid = accBid > 0 && totalBid <= availableBudget && !isBidding;
  const currentPlayer = auctionState.currentPlayer;

  // 매물 전환 시 리셋
  React.useEffect(() => { setAccBid(0); }, [auctionState.currentPlayer?.id]);
  // 예산 초과 시 클램핑
  React.useEffect(() => {
    const max = Math.max(0, availableBudget - auctionState.currentHighestBid);
    setAccBid((prev) => Math.min(prev, max));
  }, [auctionState.currentHighestBid, availableBudget]);
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((auctionState.timerEnd - Date.now()) / 1000)));
    }, 100);
    return () => clearInterval(interval);
  }, [auctionState.timerEnd]);

  const addToBid = (inc: number) => {
    setAccBid((prev) => {
      const next = prev + inc;
      return auctionState.currentHighestBid + next <= availableBudget ? next : prev;
    });
  };

  const handleBid = async () => {
    if (!canBid || isBidding) return;
    setIsBidding(true);
    try {
      await onPlaceBid(totalBid);
    } finally {
      setAccBid(0);
      setIsBidding(false);
    }
  };

  if (!currentPlayer) return null;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-bg-primary/95 backdrop-blur-sm border-t border-bg-tertiary px-4 py-3 safe-area-pb">
      {/* 1줄: 현재 매물 + 타이머 */}
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-bg-tertiary bg-bg-secondary px-2.5 py-2">
        <Avatar
          src={currentPlayer.avatar}
          alt={currentPlayer.username}
          fallback={currentPlayer.username?.[0] ?? "?"}
          size="sm"
          className="shrink-0 ring-1 ring-accent-primary/40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-bold text-text-primary">
              {currentPlayer.username}
            </span>
            {currentPlayer.tier && (
              <span className="shrink-0 text-[10px] font-semibold text-text-tertiary">
                {currentPlayer.tier}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-text-secondary">
            최고가 {auctionState.currentHighestBid.toLocaleString()}G
            {auctionState.currentHighestBidderName ? ` · ${auctionState.currentHighestBidderName}` : ""}
          </p>
        </div>
        {onFocusAuction && (
          <button
            type="button"
            onClick={onFocusAuction}
            className="shrink-0 rounded-md border border-bg-tertiary px-2 py-1 text-[11px] font-semibold text-text-secondary"
          >
            경매 보기
          </button>
        )}
        <div
          className={cn(
            "min-w-10 shrink-0 text-right text-lg font-bold tabular-nums",
            timeLeft <= 5 ? "text-accent-danger" : "text-text-primary",
          )}
        >
          {timeLeft}s
        </div>
      </div>

      {/* 2줄: 예산 + 입찰가 디스플레이 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-tertiary">
          예산 <span className="text-accent-gold font-bold">{availableBudget.toLocaleString()}G</span>
        </span>
        <div className="flex items-center gap-1">
          <Coins className="w-4 h-4 text-accent-gold" />
          <span className={cn("text-xl font-bold", accBid > 0 ? "text-accent-gold" : "text-text-tertiary")}>
            {totalBid.toLocaleString()}G
          </span>
        </div>
      </div>

      {isAlreadyHighest ? (
        <div className="py-2 rounded-lg bg-accent-primary/10 border border-accent-primary/30 text-sm text-accent-primary text-center font-medium">
          현재 최고 입찰자입니다
        </div>
      ) : (
        <>
          {/* 3줄: 증액 버튼 + 초기화 + 입찰 */}
          <div className="flex items-center gap-2">
            {bidSteps.map((inc) => (
              <Button
                key={inc}
                variant="secondary"
                size="sm"
                onClick={() => addToBid(inc)}
                disabled={!isConnected || isBidding || auctionState.currentHighestBid + accBid + inc > availableBudget}
                className="flex-1 text-xs px-1"
              >
                +{inc}G
              </Button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAccBid(0)}
              disabled={accBid === 0}
              className="px-2 text-xs"
            >
              초기화
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleBid}
              disabled={!isConnected || !canBid}
              isLoading={isBidding}
              className="flex-[2] text-xs"
            >
              {isBidding ? "입찰 중..." : canBid ? `${totalBid.toLocaleString()}G` : "금액 추가"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
