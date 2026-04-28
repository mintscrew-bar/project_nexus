-- Split Lab champion snapshots by data source.
-- Existing rows were mixed before the source split, so they are discarded and
-- rebuilt by the Lab snapshot recompute task after this migration.
TRUNCATE TABLE "lab_champion_snapshots";

ALTER TABLE "lab_champion_snapshots"
ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'custom';

DROP INDEX IF EXISTS "lab_champion_snapshots_period_patchVersion_championId_position_key";
DROP INDEX IF EXISTS "lab_champion_snapshots_period_championId_idx";
DROP INDEX IF EXISTS "lab_champion_snapshots_period_position_wilsonLower_idx";

CREATE UNIQUE INDEX "lab_champion_snapshots_source_period_patchVersion_championId_position_key"
ON "lab_champion_snapshots"("source", "period", "patchVersion", "championId", "position");

CREATE INDEX "lab_champion_snapshots_source_period_championId_idx"
ON "lab_champion_snapshots"("source", "period", "championId");

CREATE INDEX "lab_champion_snapshots_source_period_position_wilsonLower_idx"
ON "lab_champion_snapshots"("source", "period", "position", "wilsonLower");
