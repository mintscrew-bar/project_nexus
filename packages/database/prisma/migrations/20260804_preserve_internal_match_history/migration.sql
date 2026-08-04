ALTER TABLE "matches"
  ADD COLUMN "isInternal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "roomIdSnapshot" TEXT,
  ADD COLUMN "roomName" TEXT,
  ADD COLUMN "roomTeamMode" "TeamMode",
  ADD COLUMN "roomHostId" TEXT,
  ADD COLUMN "roomHostName" TEXT,
  ADD COLUMN "teamAIdSnapshot" TEXT,
  ADD COLUMN "teamAName" TEXT,
  ADD COLUMN "teamBIdSnapshot" TEXT,
  ADD COLUMN "teamBName" TEXT,
  ADD COLUMN "winnerIdSnapshot" TEXT,
  ADD COLUMN "winnerName" TEXT;

UPDATE "matches" AS match
SET "isInternal" = true,
    "roomIdSnapshot" = match."roomId",
    "roomName" = room."name",
    "roomTeamMode" = room."teamMode",
    "roomHostId" = room."hostId",
    "roomHostName" = host."username"
FROM "rooms" AS room
JOIN "users" AS host ON host."id" = room."hostId"
WHERE match."roomId" = room."id";

UPDATE "matches" AS match
SET "teamAIdSnapshot" = match."teamAId",
    "teamAName" = team."name"
FROM "teams" AS team
WHERE match."teamAId" = team."id";

UPDATE "matches" AS match
SET "teamBIdSnapshot" = match."teamBId",
    "teamBName" = team."name"
FROM "teams" AS team
WHERE match."teamBId" = team."id";

UPDATE "matches" AS match
SET "winnerIdSnapshot" = match."winnerId",
    "winnerName" = team."name"
FROM "teams" AS team
WHERE match."winnerId" = team."id";

ALTER TABLE "match_participants"
  ADD COLUMN "teamIdSnapshot" TEXT,
  ADD COLUMN "teamName" TEXT;

ALTER TABLE "match_team_stats"
  ADD COLUMN "teamIdSnapshot" TEXT,
  ADD COLUMN "teamName" TEXT,
  ALTER COLUMN "teamId" DROP NOT NULL;

CREATE TABLE "match_roster_snapshots" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT,
  "username" TEXT NOT NULL,
  "puuid" TEXT,
  "teamSlot" TEXT NOT NULL,
  "teamIdSnapshot" TEXT,
  "teamName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_roster_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "match_roster_snapshots_matchId_userId_key"
  ON "match_roster_snapshots"("matchId", "userId");
CREATE INDEX "match_roster_snapshots_matchId_idx" ON "match_roster_snapshots"("matchId");
CREATE INDEX "match_roster_snapshots_userId_idx" ON "match_roster_snapshots"("userId");
CREATE INDEX "match_roster_snapshots_puuid_idx" ON "match_roster_snapshots"("puuid");
CREATE INDEX "matches_isInternal_completedAt_idx" ON "matches"("isInternal", "completedAt");

ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_roomId_fkey";
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_teamAId_fkey";
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_teamBId_fkey";
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_winnerId_fkey";
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_mvpUserId_fkey";
ALTER TABLE "matches" DROP CONSTRAINT IF EXISTS "matches_aceUserId_fkey";
ALTER TABLE "match_participants" DROP CONSTRAINT IF EXISTS "match_participants_teamId_fkey";
ALTER TABLE "match_participants" DROP CONSTRAINT IF EXISTS "match_participants_userId_fkey";
ALTER TABLE "match_team_stats" DROP CONSTRAINT IF EXISTS "match_team_stats_teamId_fkey";

ALTER TABLE "matches" ADD CONSTRAINT "matches_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamAId_fkey"
  FOREIGN KEY ("teamAId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamBId_fkey"
  FOREIGN KEY ("teamBId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_winnerId_fkey"
  FOREIGN KEY ("winnerId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_mvpUserId_fkey"
  FOREIGN KEY ("mvpUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "matches" ADD CONSTRAINT "matches_aceUserId_fkey"
  FOREIGN KEY ("aceUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "match_team_stats" ADD CONSTRAINT "match_team_stats_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "match_roster_snapshots" ADD CONSTRAINT "match_roster_snapshots_matchId_fkey"
  FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_roster_snapshots" ADD CONSTRAINT "match_roster_snapshots_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
