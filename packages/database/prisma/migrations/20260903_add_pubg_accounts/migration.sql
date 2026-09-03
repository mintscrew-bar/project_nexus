CREATE TYPE "PubgPlatform" AS ENUM ('STEAM', 'KAKAO');

CREATE TABLE "pubg_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "PubgPlatform" NOT NULL,
  "playerName" TEXT NOT NULL,
  "playerId" TEXT,
  "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "pubgTier" TEXT,
  "nexusTier" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pubg_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pubg_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pubg_accounts_userId_platform_key" ON "pubg_accounts"("userId", "platform");
CREATE UNIQUE INDEX "pubg_accounts_platform_playerName_key" ON "pubg_accounts"("platform", "playerName");
CREATE INDEX "pubg_accounts_userId_idx" ON "pubg_accounts"("userId");
