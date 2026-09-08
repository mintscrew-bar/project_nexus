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

-- playerId 는 이제 필수다. PUBG API 조회에 성공해야만 등록되므로 신규 행에는 항상 있다.
-- 조회 없이 손으로 넣던 기존 행은 식별자가 없어 어느 계정인지 확정할 수 없다.
-- 임시 값(local:<id>)을 넣어 유니크 제약을 통과시키고, 재등록 시 실제 ID 로 덮인다.
UPDATE "pubg_accounts" SET "playerId" = 'local:' || "id" WHERE "playerId" IS NULL;
ALTER TABLE "pubg_accounts" ALTER COLUMN "playerId" SET NOT NULL;

-- 유니크를 걸기 전에 겹치는 행을 먼저 정리한다.
--
-- 옛 유니크는 (userId, platform) 과 (platform, playerName) 이었다. 플랫폼이
-- 달랐으면 같은 계정·같은 닉네임도 여러 행으로 남을 수 있었고, 그 행이 하나라도
-- 있으면 아래 CREATE UNIQUE INDEX 가 실패해 마이그레이션이 통째로 멈춘다
-- (운영에서는 `migrate deploy` 가 중간에 서고 배포가 조용히 멎는다).
--
-- 남기는 기준은 먼저 등록한 행이다 — 계정 등록은 원래 선착순이고,
-- 지워진 쪽은 다시 등록하면 "이미 등록된 계정" 안내를 받는다.

-- 1) 같은 PUBG 계정(playerId)을 여러 사람이 등록한 경우
DELETE FROM "pubg_accounts" a
USING "pubg_accounts" b
WHERE a."playerId" = b."playerId"
  AND (b."createdAt", b."id") < (a."createdAt", a."id");

-- 2) 한 사람이 같은 닉네임을 플랫폼만 바꿔 두 번 넣은 경우
DELETE FROM "pubg_accounts" a
USING "pubg_accounts" b
WHERE a."userId" = b."userId"
  AND a."playerName" = b."playerName"
  AND (b."createdAt", b."id") < (a."createdAt", a."id");

-- 사용자당 첫 계정을 대표로 승격한다.
-- 정리가 끝난 뒤에 돌려야 한다 — 먼저 돌리면 대표로 세운 행이 위에서 지워져
-- 대표 계정이 없는 사용자가 생긴다.
UPDATE "pubg_accounts" a SET "isPrimary" = true
WHERE a."id" = (
  SELECT b."id" FROM "pubg_accounts" b
  WHERE b."userId" = a."userId"
  ORDER BY b."createdAt" ASC
  LIMIT 1
);

DROP INDEX IF EXISTS "pubg_accounts_userId_platform_key";
DROP INDEX IF EXISTS "pubg_accounts_platform_playerName_key";

ALTER TABLE "pubg_accounts" DROP COLUMN "platform";

CREATE UNIQUE INDEX "pubg_accounts_playerId_key" ON "pubg_accounts"("playerId");
CREATE UNIQUE INDEX "pubg_accounts_userId_playerName_key" ON "pubg_accounts"("userId", "playerName");
