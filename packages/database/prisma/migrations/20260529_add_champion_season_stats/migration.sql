-- 챔피언별 시즌 누적 통계
CREATE TABLE "champion_season_stats" (
  "id" TEXT NOT NULL,
  "puuid" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "queueGroup" TEXT NOT NULL,
  "championId" INTEGER NOT NULL,
  "championName" TEXT NOT NULL DEFAULT '',
  "games" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "deaths" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "champion_season_stats_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "champion_season_stats_puuid_season_queueGroup_championId_key" ON "champion_season_stats"("puuid", "season", "queueGroup", "championId");
CREATE INDEX "champion_season_stats_puuid_season_queueGroup_idx" ON "champion_season_stats"("puuid", "season", "queueGroup");

-- 챔피언 시즌 스캔 진행 상태
CREATE TABLE "champion_scan_states" (
  "id" TEXT NOT NULL,
  "puuid" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "queueGroup" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "lastScanAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "champion_scan_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "champion_scan_states_puuid_season_queueGroup_key" ON "champion_scan_states"("puuid", "season", "queueGroup");
CREATE INDEX "champion_scan_states_status_priority_requestedAt_idx" ON "champion_scan_states"("status", "priority", "requestedAt");
