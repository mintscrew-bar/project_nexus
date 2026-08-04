ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STREAMER_LIVE';

CREATE TABLE "StreamerFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "streamerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamerFollow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StreamerFollow_followerId_streamerId_key"
    ON "StreamerFollow"("followerId", "streamerId");
CREATE INDEX "StreamerFollow_streamerId_idx" ON "StreamerFollow"("streamerId");

ALTER TABLE "StreamerFollow"
    ADD CONSTRAINT "StreamerFollow_followerId_fkey"
    FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StreamerFollow"
    ADD CONSTRAINT "StreamerFollow_streamerId_fkey"
    FOREIGN KEY ("streamerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
