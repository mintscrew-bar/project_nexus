-- 내전 칭찬 (별점 평가를 대신한다)
CREATE TABLE "user_commendations" (
    "id" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_commendations_pkey" PRIMARY KEY ("id")
);

-- 경기별 칭찬 창을 끝냈는지(남김·건너뜀) — 같은 경기를 두 번 묻지 않는다
CREATE TABLE "commendation_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commendation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_commendations_targetUserId_idx" ON "user_commendations"("targetUserId");
CREATE INDEX "user_commendations_matchId_idx" ON "user_commendations"("matchId");
CREATE UNIQUE INDEX "user_commendations_giverId_targetUserId_matchId_key" ON "user_commendations"("giverId", "targetUserId", "matchId");
CREATE UNIQUE INDEX "commendation_sessions_userId_matchId_key" ON "commendation_sessions"("userId", "matchId");

ALTER TABLE "user_commendations" ADD CONSTRAINT "user_commendations_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_commendations" ADD CONSTRAINT "user_commendations_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_commendations" ADD CONSTRAINT "user_commendations_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commendation_sessions" ADD CONSTRAINT "commendation_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commendation_sessions" ADD CONSTRAINT "commendation_sessions_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
