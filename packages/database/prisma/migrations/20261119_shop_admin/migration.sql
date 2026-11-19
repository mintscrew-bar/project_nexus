-- 관리자 상점 관리 1단계 — 상품 덮어쓰기·기간 할인·감사 기록 종류
ALTER TYPE "AdminAction" ADD VALUE 'SHOP_ITEM_UPDATE';
ALTER TYPE "AdminAction" ADD VALUE 'SHOP_GRANT';
ALTER TYPE "AdminAction" ADD VALUE 'SHOP_REVOKE';
ALTER TYPE "AdminAction" ADD VALUE 'SHOP_DISCOUNT';

CREATE TABLE "shop_item_overrides" (
    "code" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "price" INTEGER,
    "rarity" TEXT,
    "onSale" BOOLEAN,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shop_item_overrides_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "shop_discounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "itemCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shop_discounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shop_discounts_startsAt_endsAt_idx" ON "shop_discounts"("startsAt", "endsAt");
