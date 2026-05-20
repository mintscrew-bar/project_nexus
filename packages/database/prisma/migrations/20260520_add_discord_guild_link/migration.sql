-- CreateEnum
CREATE TYPE "DiscordGuildLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- AlterEnum
ALTER TYPE "AdminAction" ADD VALUE 'DISCORD_GUILD_LINK';

-- CreateTable
CREATE TABLE "discord_guild_links" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT,
    "ownerId" TEXT NOT NULL,
    "clanId" TEXT,
    "status" "DiscordGuildLinkStatus" NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_guild_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discord_guild_links_guildId_key" ON "discord_guild_links"("guildId");

-- CreateIndex
CREATE INDEX "discord_guild_links_ownerId_idx" ON "discord_guild_links"("ownerId");

-- CreateIndex
CREATE INDEX "discord_guild_links_clanId_idx" ON "discord_guild_links"("clanId");

-- CreateIndex
CREATE INDEX "discord_guild_links_status_idx" ON "discord_guild_links"("status");

-- AddForeignKey
ALTER TABLE "discord_guild_links" ADD CONSTRAINT "discord_guild_links_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_guild_links" ADD CONSTRAINT "discord_guild_links_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
