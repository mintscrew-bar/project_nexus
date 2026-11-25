-- 방 최고 인원 — 한꺼번에 있었던 사람(봇 제외) 수의 최댓값
ALTER TABLE "rooms" ADD COLUMN "peakHumanCount" INTEGER NOT NULL DEFAULT 0;
-- 방 결과 기록에도 옮겨 담는다. 이 칸 전에 지워진 방은 null(몰랐던 값)
ALTER TABLE "room_outcomes" ADD COLUMN "peakHumanCount" INTEGER;
