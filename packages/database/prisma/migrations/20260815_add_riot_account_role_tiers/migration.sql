-- 사용자가 직접 입력하는 라이엇 계정별 라인 티어
CREATE TABLE IF NOT EXISTS "riot_account_role_tiers" (
  "id" TEXT NOT NULL,
  "riotAccountId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "tier" TEXT NOT NULL,
  "rank" TEXT NOT NULL DEFAULT '',
  "lp" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "riot_account_role_tiers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "riot_account_role_tiers_riotAccountId_role_key"
  ON "riot_account_role_tiers"("riotAccountId", "role");
CREATE INDEX IF NOT EXISTS "riot_account_role_tiers_riotAccountId_idx"
  ON "riot_account_role_tiers"("riotAccountId");

DO $$ BEGIN
  ALTER TABLE "riot_account_role_tiers"
    ADD CONSTRAINT "riot_account_role_tiers_riotAccountId_fkey"
    FOREIGN KEY ("riotAccountId") REFERENCES "riot_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
