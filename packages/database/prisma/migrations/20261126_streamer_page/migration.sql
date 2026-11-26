-- 스트리머 페이지 설정·공지사항 (/streamers/:id)
CREATE TABLE "streamer_pages" (
    "userId" TEXT NOT NULL,
    "tagline" TEXT,
    "scheduleDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "scheduleTime" TEXT,
    "showPrivateRooms" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streamer_pages_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "streamer_notices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streamer_notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "streamer_notices_userId_createdAt_idx" ON "streamer_notices"("userId", "createdAt");

ALTER TABLE "streamer_pages" ADD CONSTRAINT "streamer_pages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "streamer_notices" ADD CONSTRAINT "streamer_notices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
