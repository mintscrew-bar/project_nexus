-- 온보딩 안내 모달 확인 여부를 계정 기준으로 보관한다.
-- 기존에는 브라우저 localStorage에만 저장해, 기기·브라우저가 바뀌면 기존 가입자에게도 다시 노출됐다.
ALTER TABLE "user_settings" ADD COLUMN "onboardingSeenAt" TIMESTAMP(3);

-- 이미 Riot 계정과 주 라인을 등록한 기존 유저는 온보딩을 마친 것으로 간주해 백필한다.
-- (설정 행이 없는 유저는 /auth/me의 런타임 판정으로 동일하게 처리된다)
UPDATE "user_settings" us
SET "onboardingSeenAt" = NOW()
WHERE us."onboardingSeenAt" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "riot_accounts" ra
    WHERE ra."userId" = us."userId"
      AND ra."mainRole" IS NOT NULL
  );
