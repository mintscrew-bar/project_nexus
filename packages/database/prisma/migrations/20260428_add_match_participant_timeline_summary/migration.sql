ALTER TABLE "match_participants"
  ADD COLUMN IF NOT EXISTS "itemPurchaseOrder" JSONB,
  ADD COLUMN IF NOT EXISTS "skillOrder" JSONB,
  ADD COLUMN IF NOT EXISTS "timelineExtractedAt" TIMESTAMP(3);
