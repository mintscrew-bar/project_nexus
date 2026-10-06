-- 일별 운영 지표 스냅샷 (DAU/WAU/MAU 시계열)
CREATE TABLE "admin_daily_stats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scope" TEXT NOT NULL,
    "totalUsers" INTEGER,
    "newUsers" INTEGER,
    "active1d" INTEGER,
    "active7d" INTEGER,
    "active30d" INTEGER,
    "roomsEnded" INTEGER,
    "roomsStarted" INTEGER,
    "records" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_daily_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_daily_stats_date_scope_key" ON "admin_daily_stats"("date", "scope");
CREATE INDEX "admin_daily_stats_scope_date_idx" ON "admin_daily_stats"("scope", "date");
