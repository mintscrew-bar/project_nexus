-- 내전 모집 공지를 보낼 길드별 텍스트 채널.
-- 이전에는 홈 길드만 중앙 공지 채널(env)을 썼고 외부 길드는 방 대기실(음성) 채널로
-- 폴백해서, 연동된 커뮤니티가 내전 개설 사실을 볼 수 없었다.
ALTER TABLE "discord_guild_links" ADD COLUMN "announceChannelId" TEXT;
