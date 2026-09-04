-- 편성 등급 변경 이력.
-- 마지막 상태만 남기면 "왜 2티어가 됐는지"를 나중에 아무도 설명하지 못한다.
CREATE TABLE "pubg_tier_history" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "previousTier" TEXT,
  "newTier" TEXT,
  "previousScore" INTEGER,
  "newScore" INTEGER,
  "source" "PubgTierSource" NOT NULL,
  "note" TEXT,
  "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pubg_tier_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pubg_tier_history_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pubg_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "pubg_tier_history_accountId_createdAt_idx" ON "pubg_tier_history"("accountId", "createdAt");
