-- 챔피언 숙련도 테이블 (champion-mastery-v4)
CREATE TABLE "champion_masteries" (
  "id" TEXT NOT NULL,
  "riotAccountId" TEXT NOT NULL,
  "championId" INTEGER NOT NULL,
  "championPoints" INTEGER NOT NULL DEFAULT 0,
  "championLevel" INTEGER NOT NULL DEFAULT 0,
  "lastPlayTime" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "champion_masteries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "champion_masteries_riotAccountId_championId_key" ON "champion_masteries"("riotAccountId", "championId");
CREATE INDEX "champion_masteries_riotAccountId_idx" ON "champion_masteries"("riotAccountId");

ALTER TABLE "champion_masteries"
  ADD CONSTRAINT "champion_masteries_riotAccountId_fkey"
  FOREIGN KEY ("riotAccountId") REFERENCES "riot_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
