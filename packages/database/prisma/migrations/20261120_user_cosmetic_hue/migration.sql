-- 닉네임 글꼴 색 고르기 — 산 사람이 고른 색상 회전(0~359도)·채도(%)·밝기(%)
ALTER TABLE "user_cosmetics" ADD COLUMN "hue" INTEGER;
ALTER TABLE "user_cosmetics" ADD COLUMN "saturation" INTEGER;
ALTER TABLE "user_cosmetics" ADD COLUMN "brightness" INTEGER;
