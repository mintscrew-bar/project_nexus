ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailEncrypted" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailLookupHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_emailLookupHash_key" ON "users"("emailLookupHash");
