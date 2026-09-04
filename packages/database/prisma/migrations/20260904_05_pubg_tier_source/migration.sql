-- 편성 등급이 어디서 나왔는지를 구분한다.
-- "데이터 부족"과 "5티어(가장 낮음)"는 전혀 다른 상태인데 지금은 둘 다 빈 값으로 보인다.
CREATE TYPE "PubgTierSource" AS ENUM ('NONE', 'SELF', 'ADMIN', 'AUTO');

ALTER TABLE "pubg_accounts"
  ADD COLUMN "nexusTierSource" "PubgTierSource" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "nexusTierNote" TEXT;

-- 이미 점수가 들어간 행은 본인이 입력한 값이다(운영자 보정 경로가 없었다).
UPDATE "pubg_accounts" SET "nexusTierSource" = 'SELF' WHERE "nexusScore" IS NOT NULL;
