-- 정원 미달로 식은 방의 모집 공지를 닫은 시각 (방 자체는 남긴다)
ALTER TABLE "rooms" ADD COLUMN "recruitClosedAt" TIMESTAMP(3);
