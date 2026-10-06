-- 방이 지워질 때 남기는 결과 기록 (깔때기·정원 충족률 분석용)
CREATE TABLE "room_outcomes" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "gameTitle" "GameTitle" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalStatus" "RoomStatus" NOT NULL,
    "maxParticipants" INTEGER NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "humanCount" INTEGER NOT NULL,
    "hostIsBot" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "scheduled" BOOLEAN NOT NULL DEFAULT false,
    "hadResult" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "room_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_outcomes_roomId_key" ON "room_outcomes"("roomId");
CREATE INDEX "room_outcomes_gameTitle_endedAt_idx" ON "room_outcomes"("gameTitle", "endedAt");
CREATE INDEX "room_outcomes_endedAt_idx" ON "room_outcomes"("endedAt");
