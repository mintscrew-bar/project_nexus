-- Match에 Riot 큐 식별자 추가 (외부 인제스트 매치용).
-- 내부 토너먼트 매치는 NULL을 유지한다 (roomId 기준 식별).
ALTER TABLE "matches" ADD COLUMN "queueId" INTEGER;

-- 통계 서비스가 (queueId, completedAt) 기반으로 사용자별 매치를 필터링하므로 인덱스 추가.
CREATE INDEX "matches_queueId_idx" ON "matches"("queueId");
CREATE INDEX "matches_completedAt_idx" ON "matches"("completedAt");

-- 기존 외부 인제스트 매치(riotMatchId가 있는 row)는 riot_match_cache로부터 백필.
UPDATE "matches" m
SET "queueId" = rmc."queueId"
FROM "riot_match_cache" rmc
WHERE m."riotMatchId" = rmc."matchId"
  AND m."queueId" IS NULL;
