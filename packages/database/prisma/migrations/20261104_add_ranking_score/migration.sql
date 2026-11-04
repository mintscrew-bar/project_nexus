-- 랭킹 정렬을 "판수 → 승률"에서 보정 승률 점수로 바꾼다.
-- 점수 = (승 + 2.5) / (판수 + 5) × 100 — 5판 분량의 50% 를 미리 깔아 둔 베이지안 승률.
-- 부팅 재계산이 다시 쓰지만, 그 전에도 순서가 맞도록 기존 행을 같은 식으로 채운다.
ALTER TABLE "nexus_rankings" ADD COLUMN "score" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "nexus_role_records" ADD COLUMN "score" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "nexus_rankings"
SET "score" = ROUND((("wins" + 2.5) / ("totalGames" + 5.0) * 100)::numeric, 1);
UPDATE "nexus_role_records"
SET "score" = ROUND((("wins" + 2.5) / ("totalGames" + 5.0) * 100)::numeric, 1);

CREATE INDEX "nexus_rankings_score_idx" ON "nexus_rankings"("score");
CREATE INDEX "nexus_role_records_role_score_idx" ON "nexus_role_records"("role", "score");
