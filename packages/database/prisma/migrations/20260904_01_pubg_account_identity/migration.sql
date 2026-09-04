-- PUBG 계정을 "사용자가 고른 플랫폼"이 아니라 "PUBG 고유 계정 ID"로 식별한다.
--
-- Phase 0 Task 1 실측: 닉네임 조회는 샤드와 무관하고 steam·kakao 양쪽에서 같은
-- account.xxx 가 돌아온다. 갈리는 것은 매치 기록뿐이다. 그래서 사용자에게
-- 스팀/카카오를 묻지 않고, 매치가 나온 샤드를 기억해 이후 조회 예산을 아낀다.

ALTER TABLE "pubg_accounts"
  ADD COLUMN "lastMatchShard" "PubgPlatform",
  ADD COLUMN "lastMatchShardCheckedAt" TIMESTAMP(3),
  ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- 기존 행이 고른 platform 은 "이 플랫폼에서 한다"는 자기 신고였다.
-- 검증된 값은 아니지만 버리지 않고 샤드 힌트로 옮긴다.
UPDATE "pubg_accounts" SET "lastMatchShard" = "platform" WHERE "lastMatchShard" IS NULL;

-- 사용자당 첫 계정을 대표로 승격한다.
UPDATE "pubg_accounts" a SET "isPrimary" = true
WHERE a."id" = (
  SELECT b."id" FROM "pubg_accounts" b
  WHERE b."userId" = a."userId"
  ORDER BY b."createdAt" ASC
  LIMIT 1
);

-- playerId 는 이제 필수다. PUBG API 조회에 성공해야만 등록되므로 신규 행에는 항상 있다.
-- 조회 없이 손으로 넣던 기존 행은 식별자가 없어 어느 계정인지 확정할 수 없다.
-- 임시 값(local:<id>)을 넣어 유니크 제약을 통과시키고, 재등록 시 실제 ID 로 덮인다.
UPDATE "pubg_accounts" SET "playerId" = 'local:' || "id" WHERE "playerId" IS NULL;
ALTER TABLE "pubg_accounts" ALTER COLUMN "playerId" SET NOT NULL;

DROP INDEX IF EXISTS "pubg_accounts_userId_platform_key";
DROP INDEX IF EXISTS "pubg_accounts_platform_playerName_key";

ALTER TABLE "pubg_accounts" DROP COLUMN "platform";

CREATE UNIQUE INDEX "pubg_accounts_playerId_key" ON "pubg_accounts"("playerId");
CREATE UNIQUE INDEX "pubg_accounts_userId_playerName_key" ON "pubg_accounts"("userId", "playerName");
