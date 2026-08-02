-- AlterTable: add bracketFormat to rooms (schema already had it; DB was out of sync)
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "bracketFormat" "BracketType" DEFAULT 'SINGLE_ELIMINATION';
