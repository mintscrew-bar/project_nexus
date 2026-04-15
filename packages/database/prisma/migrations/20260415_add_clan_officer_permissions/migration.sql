ALTER TABLE "clans"
ADD COLUMN "officerCanManageSettings" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "officerCanManageMembers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "officerCanManageAnnouncements" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "officerCanManageInvitations" BOOLEAN NOT NULL DEFAULT true;
