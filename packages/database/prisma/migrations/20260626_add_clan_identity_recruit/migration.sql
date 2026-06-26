-- 클랜 정체성·모집 강화: 배너/대표색/모집 포지션/활동성 컬럼 추가
ALTER TABLE "clans"
  ADD COLUMN "banner" TEXT,
  ADD COLUMN "accentColor" TEXT,
  ADD COLUMN "recruitRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "lastActiveAt" TIMESTAMP(3);

CREATE INDEX "clans_minTier_idx" ON "clans"("minTier");
CREATE INDEX "clans_lastActiveAt_idx" ON "clans"("lastActiveAt");
