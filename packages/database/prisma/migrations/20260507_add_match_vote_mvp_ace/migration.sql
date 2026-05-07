-- CreateEnum
CREATE TYPE "VoteType" AS ENUM ('MVP', 'ACE');

-- AlterTable: matches에 MVP/ACE 유저 필드 추가
ALTER TABLE "matches" ADD COLUMN "mvpUserId" TEXT;
ALTER TABLE "matches" ADD COLUMN "aceUserId" TEXT;

-- AddForeignKey: matches.mvpUserId → users.id
ALTER TABLE "matches" ADD CONSTRAINT "matches_mvpUserId_fkey" FOREIGN KEY ("mvpUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: matches.aceUserId → users.id
ALTER TABLE "matches" ADD CONSTRAINT "matches_aceUserId_fkey" FOREIGN KEY ("aceUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: match_votes
CREATE TABLE "match_votes" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "votedForId" TEXT NOT NULL,
    "voteType" "VoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_votes_matchId_idx" ON "match_votes"("matchId");

-- CreateUniqueIndex: 같은 매치에서 같은 투표 타입 중복 방지
CREATE UNIQUE INDEX "match_votes_matchId_voterId_voteType_key" ON "match_votes"("matchId", "voterId", "voteType");

-- AddForeignKey
ALTER TABLE "match_votes" ADD CONSTRAINT "match_votes_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "match_votes" ADD CONSTRAINT "match_votes_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "match_votes" ADD CONSTRAINT "match_votes_votedForId_fkey" FOREIGN KEY ("votedForId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
