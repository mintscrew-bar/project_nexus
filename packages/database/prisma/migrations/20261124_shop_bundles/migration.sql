-- 상점 묶음 상품(번들)
ALTER TYPE "AdminAction" ADD VALUE 'SHOP_BUNDLE';

CREATE TABLE "shop_bundles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "itemCodes" TEXT[],
    "percent" INTEGER NOT NULL,
    "onSale" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shop_bundles_pkey" PRIMARY KEY ("id")
);
