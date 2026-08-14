-- 수동 사설방(토너먼트 코드 없는 커스텀) 라이브 캡처
--
-- Riot match-v5는 토너먼트 코드로 생성된 커스텀만 제공한다. 운영 DB 실측 결과
-- gameType='CUSTOM_GAME' 132건이 전부 tournamentCode를 갖고 있었고, 코드 없는
-- 커스텀은 2년치 46,597건 중 0건이었다. 즉 수동 사설방은 종료 후 어떤 방법으로도
-- 조회할 수 없다.
--
-- 그래서 경기가 진행 중일 때 Spectator-V5로 픽/밴과 팀 구성을 스냅샷으로 남긴다.
-- 개인 스탯(KDA/골드/딜량)은 Spectator가 주지 않으므로 여전히 확보 불가다.

ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "spectatorGameId" TEXT,
  ADD COLUMN IF NOT EXISTS "draftCapturedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "draftBans" JSONB,
  ADD COLUMN IF NOT EXISTS "liveStartedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "match_draft_snapshots" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "puuid" TEXT NOT NULL,
  "userId" TEXT,
  "username" TEXT,
  "riotTeamId" INTEGER NOT NULL,
  "teamIdSnapshot" TEXT,
  "championId" INTEGER NOT NULL,
  "spell1Id" INTEGER NOT NULL,
  "spell2Id" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "match_draft_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "match_draft_snapshots_matchId_puuid_key"
  ON "match_draft_snapshots"("matchId", "puuid");
CREATE INDEX IF NOT EXISTS "match_draft_snapshots_matchId_idx"
  ON "match_draft_snapshots"("matchId");
CREATE INDEX IF NOT EXISTS "match_draft_snapshots_puuid_idx"
  ON "match_draft_snapshots"("puuid");

-- 방이 지워져도 전적은 남아야 하므로 매치 삭제 시에만 함께 지운다.
DO $$ BEGIN
  ALTER TABLE "match_draft_snapshots"
    ADD CONSTRAINT "match_draft_snapshots_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "match_draft_snapshots"
    ADD CONSTRAINT "match_draft_snapshots_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
