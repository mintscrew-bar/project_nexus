-- Additive migration: legacy plaintext remains temporarily for a safe, resumable backfill.
-- Application code must switch reads to encrypted fields before legacy columns are removed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailEncrypted" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailLookupHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_emailLookupHash_key" ON "users"("emailLookupHash");

ALTER TABLE "auth_providers" ADD COLUMN IF NOT EXISTS "providerIdEncrypted" TEXT;
ALTER TABLE "auth_providers" ADD COLUMN IF NOT EXISTS "providerLookupHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "auth_providers_providerLookupHash_key" ON "auth_providers"("providerLookupHash");

ALTER TABLE "riot_accounts" ADD COLUMN IF NOT EXISTS "puuidEncrypted" TEXT;
ALTER TABLE "riot_accounts" ADD COLUMN IF NOT EXISTS "puuidLookupHash" TEXT;
ALTER TABLE "riot_accounts" ADD COLUMN IF NOT EXISTS "summonerIdEncrypted" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "riot_accounts_puuidLookupHash_key" ON "riot_accounts"("puuidLookupHash");
