ALTER TABLE "pubg_accounts"
  ADD COLUMN "combatScore" INTEGER,
  ADD COLUMN "iglScore" INTEGER,
  ADD COLUMN "teamplayScore" INTEGER,
  ADD COLUMN "consistencyScore" INTEGER,
  ADD COLUMN "experienceScore" INTEGER,
  ADD COLUMN "nexusScore" INTEGER,
  ADD COLUMN "scoreUpdatedAt" TIMESTAMP(3);
