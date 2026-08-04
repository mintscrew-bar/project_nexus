ALTER TABLE "streamer_profiles"
  ADD COLUMN IF NOT EXISTS "channelId" TEXT,
  ADD COLUMN IF NOT EXISTS "channelImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "followerCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "verificationCode" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLiveAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCheckedAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "streamer_profiles_userId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "streamer_profiles_userId_platform_key"
  ON "streamer_profiles"("userId", "platform");
CREATE UNIQUE INDEX IF NOT EXISTS "streamer_profiles_platform_channelId_key"
  ON "streamer_profiles"("platform", "channelId");
CREATE INDEX IF NOT EXISTS "streamer_profiles_verifiedAt_idx"
  ON "streamer_profiles"("verifiedAt");

DO $$
BEGIN
  IF to_regclass('public."StreamerFollow"') IS NOT NULL
     AND to_regclass('public.streamer_follows') IS NULL THEN
    ALTER TABLE "StreamerFollow" RENAME TO "streamer_follows";
  END IF;
END
$$;
