ALTER TABLE "rooms" ADD COLUMN "killMatchDurationMinutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "rooms" ADD COLUMN "battleRoyaleRounds" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "scrim_team_results" ADD COLUMN "damage" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "scrims" ADD COLUMN "startsAt" TIMESTAMP(3), ADD COLUMN "cutoffAt" TIMESTAMP(3), ADD COLUMN "collectorState" JSONB, ADD COLUMN "lastCollectedAt" TIMESTAMP(3), ADD COLUMN "collectionError" TEXT;
CREATE UNIQUE INDEX "scrim_rounds_scrimId_pubgMatchId_key" ON "scrim_rounds"("scrimId", "pubgMatchId");
