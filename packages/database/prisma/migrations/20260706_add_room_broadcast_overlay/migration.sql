-- 방송 오버레이: 읽기전용 토큰(hash) + 호스트 중계 포커스 경기
ALTER TABLE "rooms"
  ADD COLUMN "broadcastTokenHash" TEXT,
  ADD COLUMN "broadcastTokenCreatedAt" TIMESTAMP(3),
  ADD COLUMN "broadcastFocusMatchId" TEXT;

CREATE INDEX "rooms_broadcastTokenHash_idx" ON "rooms"("broadcastTokenHash");
