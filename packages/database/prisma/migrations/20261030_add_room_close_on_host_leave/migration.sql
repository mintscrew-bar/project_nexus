-- 방장 퇴장 시 방 해산 옵션.
-- 기본은 꺼짐 — 기존 방은 지금처럼 다음 참가자에게 방장을 넘긴다.
ALTER TABLE "rooms" ADD COLUMN "closeOnHostLeave" BOOLEAN NOT NULL DEFAULT false;
