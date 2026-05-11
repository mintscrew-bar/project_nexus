"use client";

import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";
import { useAuction } from "@/hooks/useAuction";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { AuctionBoard } from "@/components/domain";
import { TierBadge } from "@/components/domain";
import { LoadingSpinner, Badge, Button, Card, CardContent, ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { GameChatPanel } from "@/components/domain/GameChatPanel";
import { cn } from "@/lib/utils";
import { Users, Hand, Check, Coins, ScrollText, Gavel } from "lucide-react";

/** 대기 선수 목록 (데스크톱 사이드바 & 모바일 탭에서 공유) */
function PlayersList({ players, currentPlayerId }: { players: any[]; currentPlayerId?: string }) {
  return (
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
            const isCurrentTarget = currentPlayerId === player.id;
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
}

/** 입찰 로그 (데스크톱 사이드바 & 모바일 탭에서 공유) */
function BidLog({ bidHistory, logEndRef }: { bidHistory: any[]; logEndRef: React.RefObject<HTMLDivElement> }) {
  return (
    <>
      <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-1.5">
        <ScrollText className="w-4 h-4" />
        입찰 내역
      </h3>
      <div className="space-y-1 max-h-[calc(100vh-220px)] overflow-y-auto">
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
    </>
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
  // 모바일 탭: "auction" | "players" | "log"
  const [mobileTab, setMobileTab] = useState<"auction" | "players" | "log">("auction");
  // 경매 완료 결과 화면 카운트다운
  const [completeCountdown, setCompleteCountdown] = useState<number | null>(null);

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
    const progressPct = Math.min(100, (volunteers.length / requiredCount) * 100);
    // 자원자 부족 시 백엔드가 MMR로 자동 채움
    const willBeFilledByMmr = !tooManyVolunteers && volunteers.length < requiredCount;

    return (
      <div className="flex-grow p-4 md:p-8">
        <div className="container mx-auto max-w-2xl">
          {/* 헤더 */}
          <div className="mb-6 text-center">
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
                    <div className="space-y-1.5">
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
                    <div className="flex flex-wrap gap-1.5">
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
                <div className="space-y-2 mb-6">
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
                      <div className="space-y-1.5">
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

          {/* 방장 마감/확정 버튼 */}
          {mode === 'VOLUNTEER' && isHost && (
            <div className="flex justify-center">
              <Button
                onClick={() => finalizeVolunteers(auctionId, tooManyVolunteers ? selectedCaptains : undefined)}
                disabled={tooManyVolunteers && selectedCaptains.length !== requiredCount}
                size="lg"
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
          {mode === 'MANUAL' && isHost && (
            <div className="flex justify-center">
              <Button
                onClick={() => selectManualCaptains(auctionId, selectedCaptains)}
                disabled={selectedCaptains.length !== requiredCount}
                size="lg"
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
            {teams
              .slice()
              .sort((a, b) => {
                const oa = a.name.match(/\d+/) ? Number(a.name.match(/\d+/)![0]) : Infinity;
                const ob = b.name.match(/\d+/) ? Number(b.name.match(/\d+/)![0]) : Infinity;
                return oa - ob || a.name.localeCompare(b.name);
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
    <div className="flex-grow p-4 md:p-6 relative">
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
                <PlayersList players={players} currentPlayerId={auctionState.currentPlayer?.id} />
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
                <BidLog bidHistory={bidHistory} logEndRef={logEndRef} />
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
                <PlayersList players={players} currentPlayerId={auctionState.currentPlayer?.id} />
              </CardContent>
            </Card>
          )}
          {mobileTab === "log" && (
            <Card>
              <CardContent className="p-3">
                <BidLog bidHistory={bidHistory} logEndRef={logEndRef} />
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

  const bidIncrement = auctionState.bidIncrement ?? 50;
  const bidSteps = [bidIncrement, bidIncrement * 2, bidIncrement * 5];
  const memberCount = myTeam.members?.length ?? 0;
  const slotsNeeded = Math.max(0, 5 - memberCount);
  const reserveAmount = Math.max(0, (slotsNeeded - 1) * bidIncrement);
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
