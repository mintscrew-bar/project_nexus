-- 꾸미기 보유·장착 (리텐션 기획서 10절, Task 8·9)

-- CreateTable
CREATE TABLE "user_cosmetics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PURCHASE',
    "ledgerId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cosmetic_loadouts" (
    "userId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_cosmetic_loadouts_pkey" PRIMARY KEY ("userId","slot")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_cosmetics_userId_itemCode_key" ON "user_cosmetics"("userId", "itemCode");

-- AddForeignKey
ALTER TABLE "user_cosmetics" ADD CONSTRAINT "user_cosmetics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cosmetic_loadouts" ADD CONSTRAINT "user_cosmetic_loadouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

