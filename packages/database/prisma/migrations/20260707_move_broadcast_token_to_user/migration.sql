-- 방송 오버레이 토큰을 방(Room) → 유저(User)로 이동.
-- 스트리머당 단일 토큰을 OBS에 한 번 등록하면 오버레이가 활성 방을 자동 추종한다.
-- rooms.broadcastFocusMatchId(중계 경기 포커스)는 그대로 유지한다.

-- 1) users: 방송 토큰 + 수동 오버라이드(송출 중인 방) 컬럼 추가
ALTER TABLE "users"
  ADD COLUMN "broadcastTokenHash" TEXT,
  ADD COLUMN "broadcastTokenCreatedAt" TIMESTAMP(3),
  ADD COLUMN "broadcastLiveRoomId" TEXT;

CREATE UNIQUE INDEX "users_broadcastTokenHash_key" ON "users"("broadcastTokenHash");

-- 2) rooms: 더 이상 방별 토큰을 쓰지 않으므로 제거 (포커스 컬럼은 유지)
DROP INDEX IF EXISTS "rooms_broadcastTokenHash_idx";

ALTER TABLE "rooms"
  DROP COLUMN IF EXISTS "broadcastTokenHash",
  DROP COLUMN IF EXISTS "broadcastTokenCreatedAt";
