-- 자동 산정 점수의 근거를 함께 남긴다.
-- 산식이 바뀌면(version) 다시 계산해야 하고, 표본이 적으면(sampleSize)
-- 화면에서 "판수가 적어 흔들릴 수 있다"고 밝혀야 한다.
ALTER TABLE "pubg_accounts"
  ADD COLUMN "balanceVersion" INTEGER,
  ADD COLUMN "balanceSampleSize" INTEGER,
  ADD COLUMN "balanceComputedAt" TIMESTAMP(3);
