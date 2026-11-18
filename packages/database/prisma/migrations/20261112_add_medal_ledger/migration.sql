-- 메달 원장·잔액 (리텐션 기획서 7·11절)
ALTER TYPE "AdminAction" ADD VALUE 'MEDAL_ADJUST';

CREATE TYPE "MedalReason" AS ENUM ('MATCH_COMPLETE', 'MATCH_WIN', 'RIOT_VERIFIED', 'MATCH_MVP', 'MATCH_ACE', 'COMMEND_RECEIVED', 'COMMEND_SESSION', 'HOST_COMPLETE', 'FIRST_MATCH', 'MATCH_VOID', 'PURCHASE', 'REFUND', 'ADMIN_ADJUST');

-- 잔액 — 원장과 같은 트랜잭션에서만 바뀐다
CREATE TABLE "medal_wallets" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medal_wallets_pkey" PRIMARY KEY ("userId")
);

-- 원장 — 추가만 한다. idempotencyKey 로 중복 지급을 막는다
CREATE TABLE "medal_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "MedalReason" NOT NULL,
    "sourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "retro" BOOLEAN NOT NULL DEFAULT false,
    "dayKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medal_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "medal_ledger_idempotencyKey_key" ON "medal_ledger"("idempotencyKey");
CREATE INDEX "medal_ledger_userId_createdAt_idx" ON "medal_ledger"("userId", "createdAt");
CREATE INDEX "medal_ledger_reason_createdAt_idx" ON "medal_ledger"("reason", "createdAt");
CREATE INDEX "medal_ledger_sourceId_idx" ON "medal_ledger"("sourceId");
CREATE INDEX "medal_ledger_userId_dayKey_idx" ON "medal_ledger"("userId", "dayKey");

-- 메달 지급에서 뺀 경기 (운영자 무효 처리)
CREATE TABLE "medal_match_voids" (
    "matchId" TEXT NOT NULL,
    "adminId" TEXT,
    "memo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medal_match_voids_pkey" PRIMARY KEY ("matchId")
);

ALTER TABLE "medal_wallets" ADD CONSTRAINT "medal_wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "medal_ledger" ADD CONSTRAINT "medal_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
