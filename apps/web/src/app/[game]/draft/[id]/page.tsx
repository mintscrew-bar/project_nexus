"use client";

import { useParams, useRouter } from "next/navigation";
import { useGamePrefix } from "@/hooks/useCurrentGame";
import { useEffect, useRef, useState } from "react";
import { useSnakeDraftStore } from "@/stores/snake-draft-store";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { DraftBoard } from "@/components/domain/DraftBoard";
import { LadderDrawBoard } from "@/components/domain/LadderDrawBoard";
import { GameChatPanel } from "@/components/domain/GameChatPanel";
import { LoadingSpinner, Badge, Button, ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { TeamModeHelp } from "@/components/rooms/TeamModeHelp";

export default function SnakeDraftPage() {
  const params = useParams();
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const draftId = params.id as string;
  const { addToast } = useToast();
  const hasRedirected = useRef(false);
  const [isAborting, setIsAborting] = useState(false);
  // 추첨 연출은 시작 직후 한 번만 띄운다. 새로고침해도 다시 뜨지 않게
  // 화면 상태로만 들고 있는다.
  const [showLadder, setShowLadder] = useState(true);
  const ladderDoneRef = useRef(false);
  const [isAbortConfirmOpen, setIsAbortConfirmOpen] = useState(false);

  const { user } = useAuthStore();
  const {
    draftState,
    isConnected,
    isLoading,
    error,
    makePick,
    connectToDraft,
    disconnectFromDraft,
    sessionAbortedAt,
    sessionAbortMessage,
    clearSessionAbort,
  } = useSnakeDraftStore();

  // connectToDraft/disconnectFromDraft는 zustand 스토어 함수로 참조가 안정적이므로 dependency에서 제외
  useEffect(() => {
    if (draftId) {
      connectToDraft(draftId);
    }
    return () => {
      disconnectFromDraft();
    };
  }, [draftId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasRedirected.current) return;
    if (draftState?.status === "COMPLETED") {
      hasRedirected.current = true;
      router.push(`${gamePrefix}/role-selection/${draftId}`);
    }
  }, [draftState?.status, draftId, router, gamePrefix]);

  useEffect(() => {
    if (!sessionAbortedAt) return;
    addToast(
      sessionAbortMessage ?? "내전이 종료되어 로비로 이동합니다.",
      "warning",
    );
    clearSessionAbort();
    const timer = setTimeout(
      () => router.push(`${gamePrefix}/tournaments/${draftId}/lobby`),
      1500,
    );
    return () => clearTimeout(timer);
  }, [
    sessionAbortedAt,
    sessionAbortMessage,
    clearSessionAbort,
    addToast,
    router,
    draftId,
    gamePrefix,
  ]);

  const handleAbortToLobby = () => setIsAbortConfirmOpen(true);

  const handleAbortConfirm = async () => {
    setIsAbortConfirmOpen(false);
    setIsAborting(true);
    try {
      await roomApi.abortToLobby(draftId);
      addToast("내전을 종료하고 대기실로 복귀합니다.", "success");
      router.push(`${gamePrefix}/tournaments/${draftId}/lobby`);
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "내전 종료에 실패했습니다.",
        "error",
      );
    } finally {
      setIsAborting(false);
    }
  };

  const handleMakePick = async (playerId: string) => {
    try {
      await makePick(draftId, playerId);
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "픽 선택에 실패했습니다.",
        "error",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">드래프트 연결 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <p className="text-accent-danger mb-4">오류: {error}</p>
          <p className="text-text-secondary mb-6">
            드래프트에 연결할 수 없습니다
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="primary" onClick={() => window.location.reload()}>
              다시 시도
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push(`${gamePrefix}/tournaments/${draftId}/lobby`)}
            >
              로비로 돌아가기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!draftState) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">드래프트 시작 대기 중...</p>
        </div>
      </div>
    );
  }

  return (
    // 역할 선택과 같은 이유로 자체 스크롤이 필요하다.
    // AppShell이 대시보드 라우트를 overflow-hidden으로 가둔다.
    <div className="h-full overflow-y-auto p-4 md:p-6">
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
      <div className="container mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-4 animate-fade-in sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-text-primary md:text-3xl">
              스네이크 드래프트
              <TeamModeHelp mode="SNAKE_DRAFT" />
            </h1>
            <p className="text-sm text-text-secondary">
              차례가 되면 영입할 플레이어를 선택하세요.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "success" : "danger"}>
              {isConnected ? "● 연결됨" : "● 연결 끊김"}
            </Badge>
            <Button
              variant="danger"
              size="sm"
              isLoading={isAborting}
              onClick={handleAbortToLobby}
            >
              내전 종료
            </Button>
          </div>
        </div>

        {/*
          픽 순서 추첨 사다리.

          드래프트가 시작되면 한 번 보여주고 넘어간다. 순서는 서버가 이미
          정했고 이건 그 결과를 보여주는 연출이라, 건너뛰어도 진행에 지장이 없다.
        */}
        {draftState.ladder && showLadder && (
          <div className="mb-5 rounded-2xl border border-bg-tertiary bg-bg-secondary p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-text-primary">
                  픽 순서 추첨
                </h2>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  주장 선발과 따로 뽑습니다. 사다리를 타고 내려간 자리가 그
                  팀의 픽 순서입니다.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLadder(false)}
              >
                건너뛰기
              </Button>
            </div>
            <LadderDrawBoard
              draw={draftState.ladder}
              teams={draftState.teams}
              // 다 보여준 뒤 잠깐 두었다가 접는다 — 결과를 읽을 시간은 준다.
              onFinished={() => {
                if (ladderDoneRef.current) return;
                ladderDoneRef.current = true;
                setTimeout(() => setShowLadder(false), 2500);
              }}
            />
          </div>
        )}

        <DraftBoard
          draftState={draftState}
          currentUserId={user?.id}
          onMakePick={handleMakePick}
          disabled={!isConnected}
        />
      </div>

      {/* 채팅 패널 (플로팅) */}
      <GameChatPanel roomId={draftId} />
    </div>
  );
}
