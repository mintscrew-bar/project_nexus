-- 내전 라인별 전적
--
-- 역할 선택 단계에서 배정된 라인(TeamMember.assignedRole)은 방과 함께 삭제된다.
-- 라인별 승패를 남기려면 매치 스냅샷 시점에 함께 복사해 두어야 한다.
--
-- 승패는 방장이 버튼으로 확정하는 값이라 Riot 수집과 무관하게 항상 존재한다.
-- (개인 스탯은 2차 보강 영역)

ALTER TABLE "match_roster_snapshots"
  ADD COLUMN IF NOT EXISTS "assignedRole" "Role";

CREATE TABLE IF NOT EXISTS "nexus_role_records" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "totalGames" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- @updatedAt은 Prisma 클라이언트가 항상 채우므로 DB 기본값을 두지 않는다
  -- (기본값을 두면 스키마와 drift로 잡힌다).
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "nexus_role_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nexus_role_records_userId_role_key"
  ON "nexus_role_records"("userId", "role");
CREATE INDEX IF NOT EXISTS "nexus_role_records_userId_idx"
  ON "nexus_role_records"("userId");
CREATE INDEX IF NOT EXISTS "nexus_role_records_role_winRate_idx"
  ON "nexus_role_records"("role", "winRate");

DO $$ BEGIN
  ALTER TABLE "nexus_role_records"
    ADD CONSTRAINT "nexus_role_records_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
