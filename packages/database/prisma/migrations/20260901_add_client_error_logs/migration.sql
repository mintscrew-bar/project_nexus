CREATE TABLE "client_error_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "path" TEXT,
    "source" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_error_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_error_logs_createdAt_idx" ON "client_error_logs"("createdAt");
CREATE INDEX "client_error_logs_userId_createdAt_idx" ON "client_error_logs"("userId", "createdAt");

ALTER TABLE "client_error_logs" ADD CONSTRAINT "client_error_logs_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
