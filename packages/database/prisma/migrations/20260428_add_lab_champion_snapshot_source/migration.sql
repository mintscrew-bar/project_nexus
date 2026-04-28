-- Split Lab champion snapshots by data source.
-- Existing rows were mixed before the source split, so they are discarded and
-- rebuilt by the Lab snapshot recompute task after this migration.
TRUNCATE TABLE "lab_champion_snapshots";

ALTER TABLE "lab_champion_snapshots"
ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'custom';

-- PostgreSQL 식별자는 63자에서 잘리므로 초기 스키마와 Prisma가 기대하는 이름과 동일하게 맞춰 사용한다.
-- Initial schema에서 unique index는 `..._posit_key` 형태로 잘려 저장돼 있다.
DROP INDEX IF EXISTS "lab_champion_snapshots_period_patchVersion_championId_posit_key";
DROP INDEX IF EXISTS "lab_champion_snapshots_period_championId_idx";
DROP INDEX IF EXISTS "lab_champion_snapshots_period_position_wilsonLower_idx";

-- Prisma는 unique 인덱스 이름이 너무 길면 `_key` 접미사를 보존하면서 가운데를 잘라낸다.
CREATE UNIQUE INDEX "lab_champion_snapshots_source_period_patchVersion_championI_key"
ON "lab_champion_snapshots"("source", "period", "patchVersion", "championId", "position");

CREATE INDEX "lab_champion_snapshots_source_period_championId_idx"
ON "lab_champion_snapshots"("source", "period", "championId");

CREATE INDEX "lab_champion_snapshots_source_period_position_wilsonLower_idx"
ON "lab_champion_snapshots"("source", "period", "position", "wilsonLower");
