-- 교차 서버 모집 공지.
-- 서버 하나로는 5v5 정원 10명을 채우기 어렵다(실측: 방 4개 최대 참가 5명).
-- 호스트는 방 단위로, 서버 관리자는 서버 단위로 각각 끌 수 있다.
ALTER TABLE "rooms" ADD COLUMN "crossGuildAnnounce" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "discord_guild_links" ADD COLUMN "acceptsCrossGuildRooms" BOOLEAN NOT NULL DEFAULT true;
