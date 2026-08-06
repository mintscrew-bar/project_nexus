-- 내전 다전제(3판 2선 / 5판 3선)
--
-- 대진 슬롯을 match_series로 올리고 matches는 그 안의 세트(게임)가 된다.
-- 기존 매치는 seriesId가 NULL이라 예전처럼 "1승 = 진출"로 동작한다.

CREATE TABLE IF NOT EXISTS "match_series" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "matchNumber" INTEGER NOT NULL,
  "bracketRound" TEXT,
  "bracketType" "BracketType",
  "teamAId" TEXT,
  "teamBId" TEXT,
  "bestOf" INTEGER NOT NULL DEFAULT 1,
  "winnerId" TEXT,
  "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- @updatedAt은 Prisma 클라이언트가 항상 채우므로 DB 기본값을 두지 않는다
  -- (기본값을 두면 스키마와 drift로 잡힌다).
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "match_series_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "match_series_roomId_round_matchNumber_key"
  ON "match_series"("roomId", "round", "matchNumber");
CREATE INDEX IF NOT EXISTS "match_series_roomId_idx" ON "match_series"("roomId");
CREATE INDEX IF NOT EXISTS "match_series_roomId_bracketRound_idx"
  ON "match_series"("roomId", "bracketRound");

-- 외래키는 재실행 시 중복 추가되지 않도록 존재 여부를 확인하고 붙인다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_series_roomId_fkey'
  ) THEN
    ALTER TABLE "match_series" ADD CONSTRAINT "match_series_roomId_fkey"
      FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_series_teamAId_fkey'
  ) THEN
    ALTER TABLE "match_series" ADD CONSTRAINT "match_series_teamAId_fkey"
      FOREIGN KEY ("teamAId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_series_teamBId_fkey'
  ) THEN
    ALTER TABLE "match_series" ADD CONSTRAINT "match_series_teamBId_fkey"
      FOREIGN KEY ("teamBId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_series_winnerId_fkey'
  ) THEN
    ALTER TABLE "match_series" ADD CONSTRAINT "match_series_winnerId_fkey"
      FOREIGN KEY ("winnerId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 세트 정보. gameNumber는 기존 매치를 1세트로 본다.
ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "seriesId" TEXT,
  ADD COLUMN IF NOT EXISTS "gameNumber" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS "matches_seriesId_idx" ON "matches"("seriesId");

-- 시리즈는 대진 진행용 스캐폴딩이라 방과 함께 지워지지만, 매치(전적)는 남아야 한다.
-- CASCADE로 두면 방 삭제 시 시리즈를 타고 완료된 경기까지 지워진다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'matches_seriesId_fkey'
  ) THEN
    ALTER TABLE "matches" ADD CONSTRAINT "matches_seriesId_fkey"
      FOREIGN KEY ("seriesId") REFERENCES "match_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 방의 다전제 프리셋. NULL이면 전 경기 단판.
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "seriesPreset" TEXT;
