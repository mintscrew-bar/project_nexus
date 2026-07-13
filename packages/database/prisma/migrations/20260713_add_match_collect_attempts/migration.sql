-- 전적 수집 재시도 추적 필드
-- 계속 실패하는 매치가 복구 큐를 점유해 이전 미수집 경기가 처리되지 못하는 문제를 막는다.
ALTER TABLE "matches"
  ADD COLUMN "collectAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastCollectAttemptAt" TIMESTAMP(3);

-- 복구 큐 조회(dataCollected=false, roomId IS NOT NULL) 정렬/필터용
CREATE INDEX "matches_dataCollected_collectAttempts_idx"
  ON "matches" ("dataCollected", "collectAttempts");
