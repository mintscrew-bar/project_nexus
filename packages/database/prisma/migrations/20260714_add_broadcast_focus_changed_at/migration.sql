-- 중계 경기 선택 직후, 자동 송출이 대진표 프리뷰를 보여 줄 수 있도록 선택 시각을 보관한다.
ALTER TABLE "rooms" ADD COLUMN "broadcastFocusChangedAt" TIMESTAMP(3);
