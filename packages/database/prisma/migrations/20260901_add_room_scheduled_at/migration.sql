-- 예고제(예약 개설): 예정 시각과 알림 발송 기록
ALTER TABLE "rooms" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "rooms" ADD COLUMN "scheduledRemind1hAt" TIMESTAMP(3);
ALTER TABLE "rooms" ADD COLUMN "scheduledRemind10mAt" TIMESTAMP(3);
ALTER TABLE "rooms" ADD COLUMN "scheduledStartNotifiedAt" TIMESTAMP(3);

-- 리마인드 크론이 매분 도는 조회: status + scheduledAt 범위
CREATE INDEX "rooms_status_scheduledAt_idx" ON "rooms"("status", "scheduledAt");
