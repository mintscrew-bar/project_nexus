-- 배틀로얄 스크림. Match/MatchSeries 는 teamAId/teamBId 2팀 고정이라 다팀 경기를
-- 표현할 수 없어 따로 판다. 킬내기(2팀)는 기존 Match 흐름을 그대로 쓴다.

CREATE TYPE "ScrimStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ScrimRoundStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "scrims" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "totalRounds" INTEGER NOT NULL DEFAULT 3,
  "pointRule" JSONB NOT NULL,
  "status" "ScrimStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scrims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scrims_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "scrims_roomId_key" ON "scrims"("roomId");
CREATE INDEX "scrims_status_idx" ON "scrims"("status");

CREATE TABLE "scrim_rounds" (
  "id" TEXT NOT NULL,
  "scrimId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "pubgMatchId" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "status" "ScrimRoundStatus" NOT NULL DEFAULT 'PENDING',
  "resultSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scrim_rounds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scrim_rounds_scrimId_fkey" FOREIGN KEY ("scrimId") REFERENCES "scrims"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "scrim_rounds_scrimId_roundNumber_key" ON "scrim_rounds"("scrimId", "roundNumber");

-- 팀이 지워져도 기록은 남긴다(SetNull + 이름 스냅샷). 다른 히스토리 테이블과 같은 규칙.
CREATE TABLE "scrim_team_results" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "teamId" TEXT,
  "teamName" TEXT NOT NULL,
  "placement" INTEGER NOT NULL,
  "kills" INTEGER NOT NULL DEFAULT 0,
  "points" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scrim_team_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scrim_team_results_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "scrim_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "scrim_team_results_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "scrim_team_results_roundId_teamId_key" ON "scrim_team_results"("roundId", "teamId");
CREATE INDEX "scrim_team_results_roundId_idx" ON "scrim_team_results"("roundId");
