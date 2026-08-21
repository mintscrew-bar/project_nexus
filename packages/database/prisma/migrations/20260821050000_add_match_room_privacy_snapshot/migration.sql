-- 완료된 내전의 공개 여부를 방 삭제 이후에도 안전하게 판별하기 위한 스냅샷.
ALTER TABLE "matches" ADD COLUMN "roomIsPrivate" BOOLEAN;

-- 아직 방이 남아 있는 기존 경기는 현재 공개 여부를 보존한다.
-- 이미 방이 삭제된 기록은 NULL을 유지해 공개 API에서 제외한다.
UPDATE "matches" AS "match"
SET "roomIsPrivate" = "room"."isPrivate"
FROM "rooms" AS "room"
WHERE "match"."roomId" = "room"."id";

CREATE INDEX "matches_roomIsPrivate_status_completedAt_idx"
ON "matches"("roomIsPrivate", "status", "completedAt");
