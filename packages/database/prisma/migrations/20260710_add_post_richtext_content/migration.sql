CREATE TYPE "PostContentFormat" AS ENUM ('MARKDOWN', 'RICHTEXT');

ALTER TABLE "posts"
  ADD COLUMN "contentFormat" "PostContentFormat" NOT NULL DEFAULT 'MARKDOWN',
  ADD COLUMN "contentJson" JSONB;
