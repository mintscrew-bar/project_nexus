-- A Riot custom game must contribute to at most one Nexus internal match.
-- External imported matches use separate rows and are intentionally excluded.
CREATE UNIQUE INDEX "matches_internal_riotMatchId_key"
ON "matches"("riotMatchId")
WHERE "isInternal" = true AND "riotMatchId" IS NOT NULL;
