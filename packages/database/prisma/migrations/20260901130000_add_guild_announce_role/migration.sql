-- 내전 모집 공지에 멘션할 역할.
-- 공지 채널을 지정해도 채널에 상주하지 않는 멤버는 모집을 놓치므로,
-- 알림을 원하는 사람만 역할을 받아 가는 경로를 만든다.
ALTER TABLE "discord_guild_links" ADD COLUMN "announceRoleId" TEXT;
