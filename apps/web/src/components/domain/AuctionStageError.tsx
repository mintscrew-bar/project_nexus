"use client";

import { Button } from "@/components/ui";

/**
 * 경매 단계 오류 안내. 경매가 끝난 뒤 역할 선택이 열리지 않았을 때 호스트가
 * 직접 다시 시작할 수 있게 한다.
 *
 * 경매 화면은 완료되면 "경매 완료!" 요약 화면으로 바뀌므로 일반 레이아웃과
 * 요약 화면 양쪽에서 같은 안내를 쓴다(2026-10-02 소켓 점검 H1 후속).
 */
export function AuctionStageError({
  stageError,
  isHost,
  isRetrying,
  onRetry,
}: {
  stageError: { message: string; retryable: boolean };
  isHost: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const canRetry = isHost && stageError.retryable;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-danger/40 bg-accent-danger/10 px-4 py-3 text-left"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-accent-danger">
          다음 단계로 넘어가지 못했습니다
        </p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {canRetry
            ? "아래 버튼으로 역할 선택을 다시 시작할 수 있습니다."
            : stageError.retryable
              ? "방장이 역할 선택을 다시 시작할 때까지 기다려 주세요."
              : stageError.message}
        </p>
      </div>
      {canRetry && (
        <Button
          size="sm"
          variant="primary"
          isLoading={isRetrying}
          onClick={onRetry}
        >
          역할 선택 다시 시작
        </Button>
      )}
    </div>
  );
}
