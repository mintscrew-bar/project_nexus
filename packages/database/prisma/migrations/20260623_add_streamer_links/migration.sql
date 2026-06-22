CREATE TABLE "streamer_links" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "imageUrl" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "streamer_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "streamer_links_userId_order_idx" ON "streamer_links"("userId", "order");
CREATE INDEX "streamer_links_isActive_idx" ON "streamer_links"("isActive");

ALTER TABLE "streamer_links"
  ADD CONSTRAINT "streamer_links_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
