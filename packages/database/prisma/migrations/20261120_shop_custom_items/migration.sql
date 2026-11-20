-- 관리자 상점 관리 2단계 — 관리자가 추가하는 상품
ALTER TYPE "AdminAction" ADD VALUE 'SHOP_ITEM_CREATE';
ALTER TYPE "AdminAction" ADD VALUE 'SHOP_ITEM_DELETE';

CREATE TABLE "shop_custom_items" (
    "code" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "rarity" TEXT NOT NULL,
    "onSale" BOOLEAN NOT NULL DEFAULT true,
    "baseCode" TEXT,
    "videoUrl" TEXT,
    "mp4Url" TEXT,
    "posterUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shop_custom_items_pkey" PRIMARY KEY ("code")
);
