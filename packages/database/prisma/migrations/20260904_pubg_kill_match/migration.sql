-- 배그 킬내기 결과. 2팀 승패 흐름(Match)은 그대로 쓰고 킬 수만 따로 붙인다.
-- MatchTeamStats/MatchParticipant 는 타워·바론·챔피언·소환사주문이 필수라 재사용할 수 없다.

CREATE TABLE "pubg_match_team_kills" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "teamId" TEXT,
  "teamName" TEXT NOT NULL,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pubg_match_team_kills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pubg_match_team_kills_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pubg_match_team_kills_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pubg_match_team_kills_matchId_teamId_key" ON "pubg_match_team_kills"("matchId", "teamId");
CREATE INDEX "pubg_match_team_kills_matchId_idx" ON "pubg_match_team_kills"("matchId");

CREATE TABLE "pubg_match_player_kills" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "userId" TEXT,
  "username" TEXT NOT NULL,
  "teamId" TEXT,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pubg_match_player_kills_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pubg_match_player_kills_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pubg_match_player_kills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "pubg_match_player_kills_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pubg_match_player_kills_matchId_userId_key" ON "pubg_match_player_kills"("matchId", "userId");
CREATE INDEX "pubg_match_player_kills_matchId_idx" ON "pubg_match_player_kills"("matchId");
