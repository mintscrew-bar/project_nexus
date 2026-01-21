"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useSnakeDraftStore } from "@/stores/snake-draft-store";
import { useAuthStore } from "@/stores/auth-store";
import { DraftBoard } from "@/components/domain/DraftBoard";
import { LoadingSpinner, Badge } from "@/components/ui";

export default function SnakeDraftPage() {
  const params = useParams();
  const draftId = params.id as string;

  const { user } = useAuthStore();
  const {
    draftState,
    isConnected,
    isLoading,
    error,
    makePick,
    connectToDraft,
    disconnectFromDraft,
  } = useSnakeDraftStore();

  useEffect(() => {
    if (draftId) {
      connectToDraft(draftId);
    }

    return () => {
      disconnectFromDraft();
    };
  }, [draftId, connectToDraft, disconnectFromDraft]);

  const handleMakePick = async (playerId: string) => {
    try {
      await makePick(draftId, playerId);
    } catch (err) {
      console.error("Failed to make pick:", err);
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
      {/* Connection Status Badge */}
      <div className="absolute top-4 right-4 z-10">
        <Badge variant={isConnected ? 'success' : 'danger'}>
          {isConnected ? '● 연결됨' : '● 연결 끊김'}
        </Badge>
      </div>

      <div className="container mx-auto">
        {/* Page Header */}
        <div className="mb-6 animate-fade-in">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            스네이크 드래프트
          </h1>
          <p className="text-text-secondary">
            Room ID: <span className="text-accent-primary font-mono">{draftId}</span>
          </p>
        </div>

        {/* Draft Board */}
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
