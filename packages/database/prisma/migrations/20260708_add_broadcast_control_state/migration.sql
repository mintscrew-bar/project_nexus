-- 방송 오버레이 조작 상태.
-- 출력 토큰(read-only)과 컨트롤 토큰(command)을 분리하고,
-- OBS 기본 링크가 서버의 현재 방송 씬을 따라갈 수 있게 한다.

ALTER TABLE "users"
  ADD COLUMN "broadcastControlTokenHash" TEXT,
  ADD COLUMN "broadcastControlTokenCreatedAt" TIMESTAMP(3),
  ADD COLUMN "broadcastScene" TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN "broadcastLowerThirdVisible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "broadcastAnnouncement" TEXT;

CREATE UNIQUE INDEX "users_broadcastControlTokenHash_key" ON "users"("broadcastControlTokenHash");
