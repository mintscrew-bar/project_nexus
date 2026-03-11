"use client";

import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { useAuction } from "@/hooks/useAuction";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { AuctionBoard } from "@/components/domain";
import { TierBadge } from "@/components/domain";
import { LoadingSpinner, Badge, Button, Card, CardContent } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { GameChatPanel } from "@/components/domain/GameChatPanel";
import { cn } from "@/lib/utils";
import { Users, Hand, Check, Coins, ScrollText, Gavel } from "lucide-react";

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
  // 모바일 탭: "auction" | "players" | "log"
  const [mobileTab, setMobileTab] = useState<"auction" | "players" | "log">("auction");

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

  useEffect(() => {
    if (hasRedirected.current) return;
    if (auctionState?.status === "COMPLETED") {
      hasRedirected.current = true;
      router.push(`/role-selection/${auctionId}`);
    }
  }, [auctionState?.status, auctionId, router]);

  useEffect(() => {
    if (!sessionAbortedAt) return;
    addToast(sessionAbortMessage ?? "내전이 종료되어 로비로 이동합니다.", "warning");
    clearSessionAbort();
    const timer = setTimeout(() => router.push(`/tournaments/${auctionId}/lobby`), 1500);
    return () => clearTimeout(timer);
  }, [sessionAbortedAt, sessionAbortMessage, clearSessionAbort, addToast, router, auctionId]);

  // 입찰 로그 자동 스크롤
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bidHistory.length]);

  const handleAbortToLobby = async () => {
    const confirmed = window.confirm(
      "현재 판을 종료하고 대기실로 돌아가시겠습니까? 이 판은 전적에 반영되지 않습니다.",
    );
    if (!confirmed) return;

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

  if (error) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <p className="text-accent-danger mb-4">오류: {error}</p>
          <p className="text-text-secondary">경매 방에 연결할 수 없습니다</p>
        </div>
      </div>
    );
  }

  // 팀장 선정 단계
  if (captainSelectionPhase) {
    const { mode, requiredCount, volunteers, participants } = captainSelectionPhase;
    const isVolunteer = volunteers.includes(user?.id ?? '');
    const tooManyVolunteers = volunteers.length > requiredCount;

    return (
      <div className="flex-grow p-4 md:p-8">
        <div className="container mx-auto max-w-2xl">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-text-primary mb-1">팀장 선정</h1>
            {mode === 'VOLUNTEER' && (
              <p className="text-text-secondary">
                필요 팀장: <span className="font-bold text-accent-primary">{requiredCount}명</span>
                {captainSelectionPhase.timerEnd && (
                  <span className="ml-3 text-accent-warning font-mono text-lg">{volunteerTimer}초</span>
                )}
              </p>
            )}
            {mode === 'MANUAL' && (
              <p className="text-text-secondary">
                방장이 <span className="font-bold text-accent-primary">{requiredCount}명</span>의 팀장을 선택합니다
              </p>
            )}
          </div>

          <div className="space-y-2 mb-6">
            {(participants ?? []).map((p: any) => {
              const isSelected = mode === 'MANUAL' ? selectedCaptains.includes(p.id) : volunteers.includes(p.id);
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    (mode === 'MANUAL' && isHost) || (mode === 'VOLUNTEER' && p.id === user?.id)
                      ? 'cursor-pointer'
                      : 'cursor-default'
                  } ${
                    isSelected ? 'border-accent-primary bg-accent-primary/10' : 'border-bg-tertiary bg-bg-secondary hover:border-bg-elevated'
                  }`}
                  onClick={() => {
                    if (mode === 'MANUAL' && isHost) {
                      setSelectedCaptains(prev =>
                        prev.includes(p.id)
                          ? prev.filter(id => id !== p.id)
                          : prev.length < requiredCount ? [...prev, p.id] : prev
                      );
                    } else if (mode === 'VOLUNTEER' && p.id === user?.id) {
                      volunteerAsCaptain(auctionId);
                    }
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
                  {mode === 'VOLUNTEER' && p.id === user?.id && !isSelected && (
                    <Hand className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {mode === 'VOLUNTEER' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary text-center">
                자원자: <span className={`font-bold ${tooManyVolunteers ? 'text-accent-warning' : 'text-accent-primary'}`}>{volunteers.length}</span>/{requiredCount}명
                {tooManyVolunteers && ' — 초과! 방장이 선택합니다'}
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => finalizeVolunteers(auctionId, tooManyVolunteers ? selectedCaptains : undefined)}
                  disabled={!isHost || (tooManyVolunteers && selectedCaptains.length !== requiredCount)}
                >
                  <Users className="w-4 h-4 mr-2" />
                  {tooManyVolunteers ? `${selectedCaptains.length}/${requiredCount}명 선택 후 확정` : '지금 마감'}
                </Button>
              </div>
            </div>
          )}

          {mode === 'MANUAL' && (
            <div className="flex justify-center">
              <Button
                onClick={() => selectManualCaptains(auctionId, selectedCaptains)}
                disabled={!isHost || selectedCaptains.length !== requiredCount}
              >
                <Check className="w-4 h-4 mr-2" />
                팀장 {selectedCaptains.length}/{requiredCount}명 확정
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!auctionState) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">경매 시작 대기 중...</p>
        </div>
      </div>
    );
  }

  // 대기 선수 목록 컴포넌트 (데스크톱 사이드바 & 모바일 탭에서 공유)
  const PlayersList = () => (
    <>
      <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-1.5">
        <Users className="w-4 h-4" />
        대기 선수 ({players.length})
      </h3>
      <div className="space-y-1.5 max-h-[calc(100vh-220px)] overflow-y-auto">
        {players.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-4">모든 선수가 배정되었습니다</p>
        ) : (
          players.map((player, idx) => {
            const isCurrentTarget = auctionState.currentPlayer?.id === player.id;
            return (
              <div
                key={player.id}
                className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                  isCurrentTarget
                    ? "bg-accent-primary/10 border border-accent-primary/30"
                    : "bg-bg-secondary hover:bg-bg-tertiary"
                }`}
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
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  // 입찰 로그 컴포넌트 (데스크톱 사이드바 & 모바일 탭에서 공유)
  const BidLog = () => (
    <>
      <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-1.5">
        <ScrollText className="w-4 h-4" />
        입찰 내역
      </h3>
      <div className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto">
        {bidHistory.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-4">아직 입찰이 없습니다</p>
        ) : (
          bidHistory.map((entry, idx) => (
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
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </>
  );

  // 현재 유저가 캡틴인지 (모바일 하단 입찰 패널 표시 여부 판단)
  const myTeam = teams.find((t) => t.captainId === user?.id);
  const isCaptainTurn = Boolean(myTeam) && auctionState.status === "IN_PROGRESS";
  const isAlreadyHighest = !!auctionState.currentHighestBidder && auctionState.currentHighestBidder === user?.id;

  return (
    <div className="flex-grow p-4 md:p-6 relative">
      {/* 상단 바 */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <Button
          variant="danger"
          size="sm"
          isLoading={isAborting}
          onClick={handleAbortToLobby}
        >
          <span className="hidden sm:inline">내전 종료</span>
          <span className="sm:hidden">종료</span>
        </Button>
        <Badge variant={isConnected ? 'success' : 'danger'} className="hidden sm:inline-flex">
          {isConnected ? '● 연결됨' : '● 연결 끊김'}
        </Badge>
      </div>

      <div className="container mx-auto">
        {/* 입찰 에러 */}
        {error && auctionState && (
          <div className="mb-3 p-2.5 bg-accent-danger/10 border border-accent-danger/30 rounded-lg text-sm text-accent-danger text-center animate-fade-in">
            {error}
          </div>
        )}
        {/* 헤더 */}
        <div className="mb-4 animate-fade-in">
          <h1 className="text-xl lg:text-2xl font-bold text-text-primary">
            경매 진행 중
            <span className="text-sm lg:text-base font-normal text-text-secondary ml-2">
              ({players.length}명 남음)
            </span>
          </h1>
        </div>

        {/* ── 모바일 탭 네비게이션 (lg 미만) ── */}
        <div className="lg:hidden flex rounded-lg bg-bg-secondary p-1 mb-4 gap-1">
          {([
            { key: "auction" as const, label: "경매", icon: Gavel },
            { key: "players" as const, label: "대기선수", icon: Users },
            { key: "log" as const, label: "입찰로그", icon: ScrollText },
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

        {/* ── 데스크톱: 3컬럼 레이아웃 (lg 이상) ── */}
        <div className="hidden lg:grid lg:grid-cols-[240px_1fr_280px] gap-4">
          {/* 좌측: 남은 선수 목록 */}
          <div>
            <Card>
              <CardContent className="p-3">
                <PlayersList />
              </CardContent>
            </Card>
          </div>

          {/* 중앙: 경매 메인 */}
          <div>
            <AuctionBoard
              auctionState={auctionState}
              teams={teams}
              players={players}
              currentUserId={user?.id}
              onPlaceBid={placeBid}
              disabled={!isConnected}
              bidHistory={bidHistory}
            />
          </div>

          {/* 우측: 입찰 로그 */}
          <div>
            <Card>
              <CardContent className="p-3">
                <BidLog />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── 모바일: 탭 컨텐츠 (lg 미만) ── */}
        <div className="lg:hidden">
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
                <PlayersList />
              </CardContent>
            </Card>
          )}
          {mobileTab === "log" && (
            <Card>
              <CardContent className="p-3">
                <BidLog />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── 모바일 하단 고정 입찰 패널 (lg 미만, 캡틴 차례일 때만) ── */}
      {isCaptainTurn && auctionState.currentPlayer && (
        <MobileBidPanel
          auctionState={auctionState}
          myTeam={myTeam!}
          currentUserId={user?.id}
          isAlreadyHighest={isAlreadyHighest}
          isConnected={isConnected}
          onPlaceBid={placeBid}
        />
      )}

      {/* 모바일에서 하단 입찰 패널이 있을 때 여백 확보 */}
      {isCaptainTurn && auctionState.currentPlayer && (
        <div className="lg:hidden h-36" />
      )}

      {/* 채팅 패널 (플로팅) */}
      <GameChatPanel roomId={auctionId} />
    </div>
  );
}

/** 모바일 하단 고정 입찰 패널 — lg 미만에서만 표시 */
function MobileBidPanel({
  auctionState,
  myTeam,
  currentUserId,
  isAlreadyHighest,
  isConnected,
  onPlaceBid,
}: {
  auctionState: any;
  myTeam: any;
  currentUserId?: string;
  isAlreadyHighest: boolean;
  isConnected: boolean;
  onPlaceBid: (amount: number) => void | Promise<void>;
}) {
  const [accBid, setAccBid] = useState(0);
  const [isBidding, setIsBidding] = useState(false);

  const memberCount = myTeam.members?.length ?? 0;
  const slotsNeeded = Math.max(0, 5 - memberCount);
  const reserveAmount = Math.max(0, (slotsNeeded - 1) * 100);
  const budget = (myTeam.remainingGold ?? myTeam.remainingBudget ?? 0);
  const availableBudget = Math.max(0, budget - reserveAmount);
  const totalBid = auctionState.currentHighestBid + accBid;
  const canBid = accBid > 0 && totalBid <= availableBudget && !isBidding;

  // 매물 전환 시 리셋
  React.useEffect(() => { setAccBid(0); }, [auctionState.currentPlayer?.id]);
  // 예산 초과 시 클램핑
  React.useEffect(() => {
    const max = Math.max(0, availableBudget - auctionState.currentHighestBid);
    setAccBid((prev) => Math.min(prev, max));
  }, [auctionState.currentHighestBid, availableBudget]);

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

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-bg-primary/95 backdrop-blur-sm border-t border-bg-tertiary px-4 py-3 safe-area-pb">
      {/* 1줄: 예산 + 입찰가 디스플레이 */}
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
          {/* 2줄: 증액 버튼 + 초기화 + 입찰 */}
          <div className="flex items-center gap-2">
            {[50, 100, 500].map((inc) => (
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
