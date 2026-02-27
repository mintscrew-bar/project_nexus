"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuction } from "@/hooks/useAuction";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { AuctionBoard } from "@/components/domain";
import { TierBadge } from "@/components/domain";
import { LoadingSpinner, Badge, Button, Card, CardContent } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { GameChatPanel } from "@/components/domain/GameChatPanel";
import { Users, Hand, Check, Coins, ScrollText } from "lucide-react";

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
          내전 종료
        </Button>
        <Badge variant={isConnected ? 'success' : 'danger'}>
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
          <h1 className="text-2xl font-bold text-text-primary">
            경매 진행 중
            <span className="text-base font-normal text-text-secondary ml-2">
              ({players.length}명 남음)
            </span>
          </h1>
        </div>

        {/* 3컬럼 레이아웃: 남은선수 | 경매메인 | 입찰로그 */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_280px] gap-4">
          {/* ── 좌측: 남은 선수 목록 ── */}
          <div className="order-3 lg:order-1">
            <Card>
              <CardContent className="p-3">
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
              </CardContent>
            </Card>
          </div>

          {/* ── 중앙: 경매 메인 (현재선수 + 입찰 + 팀) ── */}
          <div className="order-1 lg:order-2">
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

          {/* ── 우측: 입찰 로그 ── */}
          <div className="order-2 lg:order-3">
            <Card>
              <CardContent className="p-3">
                <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-1.5">
                  <ScrollText className="w-4 h-4" />
                  입찰 내역
                </h3>
                <div className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto">
                  {bidHistory.length === 0 ? (
                    <p className="text-xs text-text-tertiary text-center py-4">아직 입찰이 없습니다</p>
                  ) : (
                    bidHistory.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-1.5 text-xs"
                      >
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
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* 채팅 패널 (플로팅) */}
      <GameChatPanel roomId={auctionId} />
    </div>
  );
}
