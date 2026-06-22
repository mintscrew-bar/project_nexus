CREATE TYPE "StreamerPlatform" AS ENUM ('CHZZK', 'SOOP', 'YOUTUBE');

CREATE TABLE "streamer_profiles" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "StreamerPlatform" NOT NULL,
  "channelUrl" TEXT NOT NULL,
  "channelName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "settings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "streamer_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "streamer_profiles_userId_key" ON "streamer_profiles"("userId");
CREATE INDEX "streamer_profiles_platform_idx" ON "streamer_profiles"("platform");
CREATE INDEX "streamer_profiles_isActive_idx" ON "streamer_profiles"("isActive");

ALTER TABLE "streamer_profiles"
  ADD CONSTRAINT "streamer_profiles_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
