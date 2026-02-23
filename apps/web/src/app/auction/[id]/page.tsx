"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuction } from "@/hooks/useAuction";
import { useAuthStore } from "@/stores/auth-store";
import { AuctionBoard } from "@/components/domain";
import { LoadingSpinner, Badge, Button } from "@/components/ui";
import { Users, Hand, Check } from "lucide-react";

export default function AuctionRoomPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.id as string;
  const { user } = useAuthStore();
  const hasRedirected = useRef(false);
  const [selectedCaptains, setSelectedCaptains] = useState<string[]>([]);
  const [volunteerTimer, setVolunteerTimer] = useState(0);

  const {
    auctionState,
    players,
    teams,
    isConnected,
    isLoading,
    error,
    placeBid,
    captainSelectionPhase,
    volunteerAsCaptain,
    finalizeVolunteers,
    selectManualCaptains,
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
              {/* 방장 전용: 조기 마감 또는 초과 시 선택 확정 */}
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
    <div className="flex-grow p-4 md:p-8 relative">
      <div className="absolute top-4 right-4 z-10">
        <Badge variant={isConnected ? 'success' : 'danger'}>
          {isConnected ? '● 연결됨' : '● 연결 끊김'}
        </Badge>
      </div>

      <div className="container mx-auto">
        <div className="mb-6 animate-fade-in">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            경매 진행 중
          </h1>
          <p className="text-text-secondary">
            Room ID: <span className="text-accent-primary font-mono">{auctionId}</span>
          </p>
        </div>

        <AuctionBoard
          auctionState={auctionState}
          teams={teams}
          currentUserId={user?.id}
          onPlaceBid={placeBid}
          disabled={!isConnected}
        />
      </div>
    </div>
  );
}
