"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSnakeDraftStore } from "@/stores/snake-draft-store";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { DraftBoard } from "@/components/domain/DraftBoard";
import { LoadingSpinner, Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

export default function SnakeDraftPage() {
  const params = useParams();
  const router = useRouter();
  const draftId = params.id as string;
  const { addToast } = useToast();
  const hasRedirected = useRef(false);
  const [isAborting, setIsAborting] = useState(false);

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
      router.push(`/role-selection/${draftId}`);
    }
  }, [draftState?.status, draftId, router]);

  useEffect(() => {
    if (!sessionAbortedAt) return;
    addToast(sessionAbortMessage ?? "내전이 종료되어 로비로 이동합니다.", "warning");
    clearSessionAbort();
    const timer = setTimeout(() => router.push(`/tournaments/${draftId}/lobby`), 1500);
    return () => clearTimeout(timer);
  }, [sessionAbortedAt, sessionAbortMessage, clearSessionAbort, addToast, router, draftId]);

  const handleAbortToLobby = async () => {
    const confirmed = window.confirm(
      "현재 판을 종료하고 대기실로 돌아가시겠습니까? 이 판은 전적에 반영되지 않습니다.",
    );
    if (!confirmed) return;

    setIsAborting(true);
    try {
      await roomApi.abortToLobby(draftId);
      addToast("내전을 종료하고 대기실로 복귀합니다.", "success");
      router.push(`/tournaments/${draftId}/lobby`);
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
      addToast(err?.response?.data?.message || "픽 선택에 실패했습니다.", "error");
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
          <p className="text-text-secondary">드래프트에 연결할 수 없습니다</p>
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
    <div className="flex-grow p-4 md:p-8 relative">
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
        <div className="mb-6 animate-fade-in">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            스네이크 드래프트
          </h1>
          <p className="text-text-secondary">
            Room ID: <span className="text-accent-primary font-mono">{draftId}</span>
          </p>
        </div>

        <DraftBoard
          draftState={draftState}
          currentUserId={user?.id}
          onMakePick={handleMakePick}
          disabled={!isConnected}
        />
      </div>
    </div>
  );
}
