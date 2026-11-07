-- 방송 휴식 화면 카운트다운 종료 시각 (방송인별)
ALTER TABLE "users" ADD COLUMN "broadcastBreakEndsAt" TIMESTAMP(3);
