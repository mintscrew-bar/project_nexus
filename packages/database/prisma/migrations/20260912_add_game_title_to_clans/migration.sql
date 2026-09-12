-- Existing clans predate PUBG support, so they belong to League of Legends.
ALTER TABLE "clans"
ADD COLUMN "gameTitle" "GameTitle" NOT NULL DEFAULT 'LOL';

DROP INDEX IF EXISTS "clans_name_key";
DROP INDEX IF EXISTS "clans_tag_key";

CREATE INDEX "clans_gameTitle_idx" ON "clans"("gameTitle");
CREATE UNIQUE INDEX "clans_gameTitle_name_key" ON "clans"("gameTitle", "name");
CREATE UNIQUE INDEX "clans_gameTitle_tag_key" ON "clans"("gameTitle", "tag");
