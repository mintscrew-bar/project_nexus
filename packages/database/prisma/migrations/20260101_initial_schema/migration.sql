-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ONLINE', 'OFFLINE', 'AWAY');

-- CreateEnum
CREATE TYPE "AuthProviderType" AS ENUM ('EMAIL', 'GOOGLE', 'DISCORD');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('WAITING', 'TEAM_SELECTION', 'DRAFT', 'DRAFT_COMPLETED', 'ROLE_SELECTION', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TeamMode" AS ENUM ('SNAKE_DRAFT', 'AUCTION');

-- CreateEnum
CREATE TYPE "TeamCaptainSelection" AS ENUM ('RANDOM', 'TIER', 'MANUAL', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "RoomParticipantRole" AS ENUM ('PLAYER', 'SPECTATOR');

-- CreateEnum
CREATE TYPE "DiscordChannelType" AS ENUM ('VOICE', 'TEXT');

-- CreateEnum
CREATE TYPE "BracketType" AS ENUM ('SINGLE', 'ROUND_ROBIN', 'SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClanRole" AS ENUM ('OWNER', 'OFFICER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ClanActivityType" AS ENUM ('MEMBER_JOIN', 'MEMBER_LEAVE', 'MEMBER_KICK', 'MEMBER_PROMOTE', 'MEMBER_DEMOTE', 'OWNERSHIP_TRANSFER', 'CLAN_UPDATE', 'ANNOUNCEMENT_CREATE', 'INVITE_SENT', 'JOIN_REQUEST');

-- CreateEnum
CREATE TYPE "ClanInvitationType" AS ENUM ('INVITE', 'JOIN_REQUEST');

-- CreateEnum
CREATE TYPE "ClanInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PostCategory" AS ENUM ('NOTICE', 'FREE', 'TIP', 'QNA');

-- CreateEnum
CREATE TYPE "PostReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISINFORMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('TOXICITY', 'AFK', 'GRIEFING', 'CHEATING', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'MATCH_STARTING', 'MATCH_RESULT', 'TEAM_INVITE', 'MENTION', 'COMMENT', 'SYSTEM', 'CLAN_INVITE', 'CLAN_JOIN_REQUEST', 'CLAN_JOIN_APPROVED', 'CLAN_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('USER_ROLE_CHANGE', 'USER_BAN', 'USER_UNBAN', 'USER_RESTRICT', 'USER_UNRESTRICT', 'REPORT_REVIEW', 'POST_DELETE', 'POST_PIN', 'COMMENT_DELETE', 'CLAN_DELETE', 'ROOM_CLOSE', 'ROOM_ADD_BOT', 'ANNOUNCEMENT_SEND', 'APPEAL_APPROVE', 'APPEAL_REJECT');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "username" TEXT NOT NULL,
    "bio" TEXT,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "reputation" INTEGER NOT NULL DEFAULT 100,
    "isRestricted" BOOLEAN NOT NULL DEFAULT false,
    "restrictedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "reputationScore" DOUBLE PRECISION,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "bannedAt" TIMESTAMP(3),
    "banUntil" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_providers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProviderType" NOT NULL,
    "providerId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_agreements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsOfService" BOOLEAN NOT NULL DEFAULT false,
    "privacyPolicy" BOOLEAN NOT NULL DEFAULT false,
    "ageVerification" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notifyFriendRequest" BOOLEAN NOT NULL DEFAULT true,
    "notifyFriendAccepted" BOOLEAN NOT NULL DEFAULT true,
    "notifyMatchStart" BOOLEAN NOT NULL DEFAULT true,
    "notifyMatchResult" BOOLEAN NOT NULL DEFAULT true,
    "notifyTeamInvite" BOOLEAN NOT NULL DEFAULT true,
    "notifyMention" BOOLEAN NOT NULL DEFAULT true,
    "notifyComment" BOOLEAN NOT NULL DEFAULT true,
    "notifyClanActivity" BOOLEAN NOT NULL DEFAULT true,
    "notifySystem" BOOLEAN NOT NULL DEFAULT true,
    "showOnlineStatus" BOOLEAN NOT NULL DEFAULT true,
    "showMatchHistory" BOOLEAN NOT NULL DEFAULT true,
    "showRiotAccounts" BOOLEAN NOT NULL DEFAULT true,
    "showChampionStats" BOOLEAN NOT NULL DEFAULT true,
    "allowFriendRequests" BOOLEAN NOT NULL DEFAULT true,
    "highlightChampionId" TEXT,
    "highlightStatType" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riot_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "summonerId" TEXT,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'UNRANKED',
    "rank" TEXT NOT NULL DEFAULT '',
    "lp" INTEGER NOT NULL DEFAULT 0,
    "peakTier" TEXT,
    "peakRank" TEXT,
    "mainRole" "Role",
    "subRole" "Role",
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riot_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "champion_preferences" (
    "id" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "championId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "champion_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "password" TEXT,
    "maxParticipants" INTEGER NOT NULL DEFAULT 10,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "status" "RoomStatus" NOT NULL DEFAULT 'WAITING',
    "teamMode" "TeamMode" NOT NULL DEFAULT 'SNAKE_DRAFT',
    "allowSpectators" BOOLEAN NOT NULL DEFAULT true,
    "startingPoints" INTEGER,
    "minBidIncrement" INTEGER,
    "bidTimeLimit" INTEGER DEFAULT 30,
    "pickTimeLimit" INTEGER DEFAULT 60,
    "captainSelection" "TeamCaptainSelection" DEFAULT 'RANDOM',
    "discordGuildId" TEXT,
    "discordCategoryId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_participants" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoomParticipantRole" NOT NULL DEFAULT 'PLAYER',
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "roomName" TEXT,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_discord_channels" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelType" "DiscordChannelType" NOT NULL,
    "teamName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_discord_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "color" TEXT,
    "initialBudget" INTEGER NOT NULL DEFAULT 0,
    "remainingBudget" INTEGER NOT NULL DEFAULT 0,
    "hasReceivedBonus" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedRole" "Role",
    "soldPrice" INTEGER,
    "pickOrder" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snake_draft_picks" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snake_draft_picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_bids" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "isYuchal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "teamAId" TEXT,
    "teamBId" TEXT,
    "winnerId" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "matchNumber" INTEGER,
    "bracketRound" TEXT,
    "round" INTEGER,
    "bracketType" "BracketType",
    "tournamentCode" TEXT,
    "riotMatchId" TEXT,
    "patchVersion" TEXT,
    "gameDuration" INTEGER,
    "dataCollected" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_participants" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT,
    "teamId" TEXT,
    "puuid" TEXT,
    "riotTeamId" INTEGER,
    "championId" INTEGER NOT NULL,
    "championName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "summoner1Id" INTEGER NOT NULL,
    "summoner2Id" INTEGER NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "totalMinionsKilled" INTEGER NOT NULL,
    "neutralMinionsKilled" INTEGER NOT NULL,
    "goldEarned" INTEGER NOT NULL,
    "goldSpent" INTEGER NOT NULL,
    "totalDamageDealt" INTEGER NOT NULL,
    "totalDamageDealtToChampions" INTEGER NOT NULL,
    "totalDamageTaken" INTEGER NOT NULL,
    "totalHeal" INTEGER NOT NULL,
    "damageSelfMitigated" INTEGER NOT NULL,
    "visionScore" INTEGER NOT NULL,
    "wardsPlaced" INTEGER NOT NULL,
    "wardsKilled" INTEGER NOT NULL,
    "detectorWardsPlaced" INTEGER NOT NULL,
    "item0" INTEGER NOT NULL,
    "item1" INTEGER NOT NULL,
    "item2" INTEGER NOT NULL,
    "item3" INTEGER NOT NULL,
    "item4" INTEGER NOT NULL,
    "item5" INTEGER NOT NULL,
    "item6" INTEGER NOT NULL,
    "item7" INTEGER,
    "perks" JSONB NOT NULL,
    "champLevel" INTEGER NOT NULL,
    "largestKillingSpree" INTEGER NOT NULL,
    "largestMultiKill" INTEGER NOT NULL,
    "longestTimeSpentLiving" INTEGER NOT NULL,
    "totalTimeSpentDead" INTEGER NOT NULL,
    "turretKills" INTEGER NOT NULL,
    "inhibitorKills" INTEGER NOT NULL,
    "dragonKills" INTEGER NOT NULL,
    "baronKills" INTEGER NOT NULL,
    "doubleKills" INTEGER NOT NULL,
    "tripleKills" INTEGER NOT NULL,
    "quadraKills" INTEGER NOT NULL,
    "pentaKills" INTEGER NOT NULL,
    "firstBloodKill" BOOLEAN NOT NULL,
    "firstTowerKill" BOOLEAN NOT NULL,
    "win" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_team_stats" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "win" BOOLEAN NOT NULL,
    "towerKills" INTEGER NOT NULL,
    "inhibitorKills" INTEGER NOT NULL,
    "baronKills" INTEGER NOT NULL,
    "dragonKills" INTEGER NOT NULL,
    "riftHeraldKills" INTEGER NOT NULL,
    "firstBlood" BOOLEAN NOT NULL DEFAULT false,
    "firstTower" BOOLEAN NOT NULL DEFAULT false,
    "firstBaron" BOOLEAN NOT NULL DEFAULT false,
    "firstDragon" BOOLEAN NOT NULL DEFAULT false,
    "bans" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_team_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT,
    "logo" TEXT,
    "ownerId" TEXT NOT NULL,
    "isRecruiting" BOOLEAN NOT NULL DEFAULT true,
    "maxMembers" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "minTier" TEXT,
    "discord" TEXT,

    CONSTRAINT "clans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_members" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClanRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_chat_messages" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_invitations" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT,
    "type" "ClanInvitationType" NOT NULL,
    "status" "ClanInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "inviteCode" TEXT,
    "expiresAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_announcements" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_activity_logs" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "ClanActivityType" NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "PostCategory" NOT NULL,
    "authorId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isBlinded" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("postId","tagId")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "isBlinded" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_likes" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_bookmarks" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reason" "PostReportReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ratings" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "skillRating" INTEGER NOT NULL,
    "attitudeRating" INTEGER NOT NULL,
    "communicationRating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "matchId" TEXT,
    "clanChatMessageId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewerNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summoner_season_tiers" (
    "id" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "rank" TEXT NOT NULL,
    "lp" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summoner_season_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "known_puuids" (
    "puuid" TEXT NOT NULL,
    "gameName" TEXT,
    "tagLine" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isNexusUser" BOOLEAN NOT NULL DEFAULT false,
    "rankedFetchedAt" TIMESTAMP(3),
    "normalFetchedAt" TIMESTAMP(3),
    "aramFetchedAt" TIMESTAMP(3),
    "customFetchedAt" TIMESTAMP(3),
    "rankedLastMatchId" TEXT,
    "normalLastMatchId" TEXT,
    "aramLastMatchId" TEXT,
    "customLastMatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "known_puuids_pkey" PRIMARY KEY ("puuid")
);

-- CreateTable
CREATE TABLE "match_stats_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "queueGroup" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "matchCount" INTEGER NOT NULL,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_stats_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stats_recompute_queue" (
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stats_recompute_queue_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "riot_match_cache" (
    "matchId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "queueId" INTEGER NOT NULL,
    "gameEnd" TIMESTAMP(3) NOT NULL,
    "patchVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "riot_match_cache_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "direct_messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT,
    "receiverId" TEXT,
    "senderUsername" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "AdminAction" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nexus_rankings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalGames" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "globalRank" INTEGER,
    "recentWins" INTEGER NOT NULL DEFAULT 0,
    "recentLosses" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nexus_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_rankings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "totalGames" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clanRank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_champion_snapshots" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "patchVersion" TEXT,
    "championId" INTEGER NOT NULL,
    "position" TEXT,
    "games" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "avgKda" DOUBLE PRECISION NOT NULL,
    "avgDamage" DOUBLE PRECISION NOT NULL,
    "avgGold" DOUBLE PRECISION NOT NULL,
    "pickRate" DOUBLE PRECISION NOT NULL,
    "banRate" DOUBLE PRECISION NOT NULL,
    "wilsonLower" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_champion_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_synergy_snapshots" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "champ1Id" INTEGER NOT NULL,
    "champ2Id" INTEGER NOT NULL,
    "games" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "wilsonLower" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_synergy_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_ranked_champion_snapshots" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "patchVersion" TEXT,
    "championId" INTEGER NOT NULL,
    "position" TEXT,
    "games" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "avgKda" DOUBLE PRECISION NOT NULL,
    "avgDamage" DOUBLE PRECISION NOT NULL,
    "pickRate" DOUBLE PRECISION NOT NULL,
    "banRate" DOUBLE PRECISION NOT NULL,
    "wilsonLower" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,
    "lastMatchCreatedAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_ranked_champion_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_counter_snapshots" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "champId" INTEGER NOT NULL,
    "vsChampId" INTEGER NOT NULL,
    "position" TEXT,
    "games" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "wilsonLower" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_counter_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_reputation_idx" ON "users"("reputation");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_isBanned_idx" ON "users"("isBanned");

-- CreateIndex
CREATE INDEX "auth_providers_userId_idx" ON "auth_providers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_providers_provider_providerId_key" ON "auth_providers"("provider", "providerId");

-- CreateIndex
CREATE INDEX "terms_agreements_userId_idx" ON "terms_agreements"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshToken_key" ON "sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "riot_accounts_puuid_key" ON "riot_accounts"("puuid");

-- CreateIndex
CREATE INDEX "riot_accounts_userId_idx" ON "riot_accounts"("userId");

-- CreateIndex
CREATE INDEX "riot_accounts_puuid_idx" ON "riot_accounts"("puuid");

-- CreateIndex
CREATE UNIQUE INDEX "riot_accounts_gameName_tagLine_key" ON "riot_accounts"("gameName", "tagLine");

-- CreateIndex
CREATE INDEX "champion_preferences_riotAccountId_role_idx" ON "champion_preferences"("riotAccountId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "champion_preferences_riotAccountId_role_championId_key" ON "champion_preferences"("riotAccountId", "role", "championId");

-- CreateIndex
CREATE INDEX "rooms_hostId_idx" ON "rooms"("hostId");

-- CreateIndex
CREATE INDEX "rooms_status_idx" ON "rooms"("status");

-- CreateIndex
CREATE INDEX "rooms_isPrivate_idx" ON "rooms"("isPrivate");

-- CreateIndex
CREATE INDEX "rooms_createdAt_idx" ON "rooms"("createdAt");

-- CreateIndex
CREATE INDEX "room_participants_roomId_idx" ON "room_participants"("roomId");

-- CreateIndex
CREATE INDEX "room_participants_userId_idx" ON "room_participants"("userId");

-- CreateIndex
CREATE INDEX "room_participants_teamId_idx" ON "room_participants"("teamId");

-- CreateIndex
CREATE INDEX "room_participants_roomId_isReady_role_idx" ON "room_participants"("roomId", "isReady", "role");

-- CreateIndex
CREATE UNIQUE INDEX "room_participants_roomId_userId_key" ON "room_participants"("roomId", "userId");

-- CreateIndex
CREATE INDEX "chat_messages_roomId_createdAt_idx" ON "chat_messages"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_userId_idx" ON "chat_messages"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_roomName_idx" ON "chat_messages"("roomName");

-- CreateIndex
CREATE UNIQUE INDEX "room_discord_channels_channelId_key" ON "room_discord_channels"("channelId");

-- CreateIndex
CREATE INDEX "room_discord_channels_roomId_idx" ON "room_discord_channels"("roomId");

-- CreateIndex
CREATE INDEX "teams_roomId_idx" ON "teams"("roomId");

-- CreateIndex
CREATE INDEX "teams_captainId_idx" ON "teams"("captainId");

-- CreateIndex
CREATE INDEX "team_members_teamId_idx" ON "team_members"("teamId");

-- CreateIndex
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");

-- CreateIndex
CREATE INDEX "snake_draft_picks_roomId_idx" ON "snake_draft_picks"("roomId");

-- CreateIndex
CREATE INDEX "snake_draft_picks_teamId_idx" ON "snake_draft_picks"("teamId");

-- CreateIndex
CREATE INDEX "auction_bids_roomId_createdAt_idx" ON "auction_bids"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "auction_bids_teamId_idx" ON "auction_bids"("teamId");

-- CreateIndex
CREATE INDEX "auction_bids_targetUserId_idx" ON "auction_bids"("targetUserId");

-- CreateIndex
CREATE INDEX "auction_bids_targetUserId_createdAt_idx" ON "auction_bids"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "matches_roomId_idx" ON "matches"("roomId");

-- CreateIndex
CREATE INDEX "matches_teamAId_idx" ON "matches"("teamAId");

-- CreateIndex
CREATE INDEX "matches_teamBId_idx" ON "matches"("teamBId");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "match_participants_matchId_idx" ON "match_participants"("matchId");

-- CreateIndex
CREATE INDEX "match_participants_userId_idx" ON "match_participants"("userId");

-- CreateIndex
CREATE INDEX "match_participants_teamId_idx" ON "match_participants"("teamId");

-- CreateIndex
CREATE INDEX "match_participants_championId_idx" ON "match_participants"("championId");

-- CreateIndex
CREATE INDEX "match_participants_puuid_idx" ON "match_participants"("puuid");

-- CreateIndex
CREATE UNIQUE INDEX "match_participants_matchId_puuid_key" ON "match_participants"("matchId", "puuid");

-- CreateIndex
CREATE INDEX "match_team_stats_matchId_idx" ON "match_team_stats"("matchId");

-- CreateIndex
CREATE INDEX "match_team_stats_teamId_idx" ON "match_team_stats"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "match_team_stats_matchId_teamId_key" ON "match_team_stats"("matchId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "clans_name_key" ON "clans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "clans_tag_key" ON "clans"("tag");

-- CreateIndex
CREATE INDEX "clans_ownerId_idx" ON "clans"("ownerId");

-- CreateIndex
CREATE INDEX "clans_isRecruiting_idx" ON "clans"("isRecruiting");

-- CreateIndex
CREATE INDEX "clan_members_clanId_idx" ON "clan_members"("clanId");

-- CreateIndex
CREATE INDEX "clan_members_userId_idx" ON "clan_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clan_members_clanId_userId_key" ON "clan_members"("clanId", "userId");

-- CreateIndex
CREATE INDEX "clan_chat_messages_clanId_createdAt_idx" ON "clan_chat_messages"("clanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "clan_invitations_inviteCode_key" ON "clan_invitations"("inviteCode");

-- CreateIndex
CREATE INDEX "clan_invitations_clanId_status_idx" ON "clan_invitations"("clanId", "status");

-- CreateIndex
CREATE INDEX "clan_invitations_inviteeId_status_idx" ON "clan_invitations"("inviteeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clan_invitations_clanId_inviteeId_type_status_key" ON "clan_invitations"("clanId", "inviteeId", "type", "status");

-- CreateIndex
CREATE INDEX "clan_announcements_clanId_isPinned_createdAt_idx" ON "clan_announcements"("clanId", "isPinned", "createdAt");

-- CreateIndex
CREATE INDEX "clan_activity_logs_clanId_createdAt_idx" ON "clan_activity_logs"("clanId", "createdAt");

-- CreateIndex
CREATE INDEX "posts_category_isPinned_createdAt_idx" ON "posts"("category", "isPinned", "createdAt");

-- CreateIndex
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "post_tags_tagId_idx" ON "post_tags"("tagId");

-- CreateIndex
CREATE INDEX "comments_postId_createdAt_idx" ON "comments"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_parentId_idx" ON "comments"("parentId");

-- CreateIndex
CREATE INDEX "comment_likes_commentId_idx" ON "comment_likes"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "comment_likes_userId_commentId_key" ON "comment_likes"("userId", "commentId");

-- CreateIndex
CREATE INDEX "post_bookmarks_userId_idx" ON "post_bookmarks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "post_bookmarks_userId_postId_key" ON "post_bookmarks"("userId", "postId");

-- CreateIndex
CREATE INDEX "post_reports_status_createdAt_idx" ON "post_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "post_reports_reporterId_idx" ON "post_reports"("reporterId");

-- CreateIndex
CREATE INDEX "post_likes_postId_idx" ON "post_likes"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_userId_postId_key" ON "post_likes"("userId", "postId");

-- CreateIndex
CREATE INDEX "user_ratings_targetUserId_idx" ON "user_ratings"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "user_ratings_reporterId_targetUserId_matchId_key" ON "user_ratings"("reporterId", "targetUserId", "matchId");

-- CreateIndex
CREATE INDEX "user_reports_targetUserId_status_createdAt_idx" ON "user_reports"("targetUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "user_reports_status_idx" ON "user_reports"("status");

-- CreateIndex
CREATE INDEX "friendships_userId_status_idx" ON "friendships"("userId", "status");

-- CreateIndex
CREATE INDEX "friendships_friendId_status_idx" ON "friendships"("friendId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_userId_friendId_key" ON "friendships"("userId", "friendId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "summoner_season_tiers_puuid_idx" ON "summoner_season_tiers"("puuid");

-- CreateIndex
CREATE UNIQUE INDEX "summoner_season_tiers_puuid_season_key" ON "summoner_season_tiers"("puuid", "season");

-- CreateIndex
CREATE INDEX "known_puuids_priority_rankedFetchedAt_idx" ON "known_puuids"("priority", "rankedFetchedAt");

-- CreateIndex
CREATE INDEX "known_puuids_priority_normalFetchedAt_idx" ON "known_puuids"("priority", "normalFetchedAt");

-- CreateIndex
CREATE INDEX "known_puuids_priority_aramFetchedAt_idx" ON "known_puuids"("priority", "aramFetchedAt");

-- CreateIndex
CREATE INDEX "known_puuids_priority_customFetchedAt_idx" ON "known_puuids"("priority", "customFetchedAt");

-- CreateIndex
CREATE INDEX "known_puuids_isNexusUser_priority_idx" ON "known_puuids"("isNexusUser", "priority");

-- CreateIndex
CREATE INDEX "match_stats_cache_userId_idx" ON "match_stats_cache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "match_stats_cache_userId_queueGroup_season_key" ON "match_stats_cache"("userId", "queueGroup", "season");

-- CreateIndex
CREATE INDEX "stats_recompute_queue_queuedAt_idx" ON "stats_recompute_queue"("queuedAt");

-- CreateIndex
CREATE INDEX "riot_match_cache_queueId_idx" ON "riot_match_cache"("queueId");

-- CreateIndex
CREATE INDEX "riot_match_cache_gameEnd_idx" ON "riot_match_cache"("gameEnd");

-- CreateIndex
CREATE INDEX "riot_match_cache_patchVersion_idx" ON "riot_match_cache"("patchVersion");

-- CreateIndex
CREATE INDEX "direct_messages_senderId_receiverId_createdAt_idx" ON "direct_messages"("senderId", "receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "direct_messages_receiverId_isRead_idx" ON "direct_messages"("receiverId", "isRead");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminId_idx" ON "admin_audit_logs"("adminId");

-- CreateIndex
CREATE INDEX "admin_audit_logs_action_idx" ON "admin_audit_logs"("action");

-- CreateIndex
CREATE INDEX "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "nexus_rankings_userId_key" ON "nexus_rankings"("userId");

-- CreateIndex
CREATE INDEX "nexus_rankings_globalRank_idx" ON "nexus_rankings"("globalRank");

-- CreateIndex
CREATE INDEX "nexus_rankings_winRate_idx" ON "nexus_rankings"("winRate");

-- CreateIndex
CREATE INDEX "clan_rankings_clanId_clanRank_idx" ON "clan_rankings"("clanId", "clanRank");

-- CreateIndex
CREATE UNIQUE INDEX "clan_rankings_userId_clanId_key" ON "clan_rankings"("userId", "clanId");

-- CreateIndex
CREATE INDEX "appeals_userId_status_idx" ON "appeals"("userId", "status");

-- CreateIndex
CREATE INDEX "appeals_status_createdAt_idx" ON "appeals"("status", "createdAt");

-- CreateIndex
CREATE INDEX "lab_champion_snapshots_period_championId_idx" ON "lab_champion_snapshots"("period", "championId");

-- CreateIndex
CREATE INDEX "lab_champion_snapshots_period_position_wilsonLower_idx" ON "lab_champion_snapshots"("period", "position", "wilsonLower");

-- CreateIndex
CREATE UNIQUE INDEX "lab_champion_snapshots_period_patchVersion_championId_posit_key" ON "lab_champion_snapshots"("period", "patchVersion", "championId", "position");

-- CreateIndex
CREATE INDEX "lab_synergy_snapshots_period_champ1Id_idx" ON "lab_synergy_snapshots"("period", "champ1Id");

-- CreateIndex
CREATE INDEX "lab_synergy_snapshots_period_champ2Id_idx" ON "lab_synergy_snapshots"("period", "champ2Id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_synergy_snapshots_period_champ1Id_champ2Id_key" ON "lab_synergy_snapshots"("period", "champ1Id", "champ2Id");

-- CreateIndex
CREATE INDEX "lab_ranked_champion_snapshots_period_championId_idx" ON "lab_ranked_champion_snapshots"("period", "championId");

-- CreateIndex
CREATE INDEX "lab_ranked_champion_snapshots_period_position_wilsonLower_idx" ON "lab_ranked_champion_snapshots"("period", "position", "wilsonLower");

-- CreateIndex
CREATE UNIQUE INDEX "lab_ranked_champion_snapshots_period_patchVersion_championI_key" ON "lab_ranked_champion_snapshots"("period", "patchVersion", "championId", "position");

-- CreateIndex
CREATE INDEX "lab_counter_snapshots_period_champId_idx" ON "lab_counter_snapshots"("period", "champId");

-- CreateIndex
CREATE INDEX "lab_counter_snapshots_period_champId_position_idx" ON "lab_counter_snapshots"("period", "champId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lab_counter_snapshots_period_champId_vsChampId_position_key" ON "lab_counter_snapshots"("period", "champId", "vsChampId", "position");

-- AddForeignKey
ALTER TABLE "auth_providers" ADD CONSTRAINT "auth_providers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riot_accounts" ADD CONSTRAINT "riot_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "champion_preferences" ADD CONSTRAINT "champion_preferences_riotAccountId_fkey" FOREIGN KEY ("riotAccountId") REFERENCES "riot_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_discord_channels" ADD CONSTRAINT "room_discord_channels_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snake_draft_picks" ADD CONSTRAINT "snake_draft_picks_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snake_draft_picks" ADD CONSTRAINT "snake_draft_picks_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snake_draft_picks" ADD CONSTRAINT "snake_draft_picks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamAId_fkey" FOREIGN KEY ("teamAId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_teamBId_fkey" FOREIGN KEY ("teamBId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_team_stats" ADD CONSTRAINT "match_team_stats_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_team_stats" ADD CONSTRAINT "match_team_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clans" ADD CONSTRAINT "clans_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_chat_messages" ADD CONSTRAINT "clan_chat_messages_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_chat_messages" ADD CONSTRAINT "clan_chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_invitations" ADD CONSTRAINT "clan_invitations_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_invitations" ADD CONSTRAINT "clan_invitations_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_invitations" ADD CONSTRAINT "clan_invitations_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_announcements" ADD CONSTRAINT "clan_announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_announcements" ADD CONSTRAINT "clan_announcements_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_activity_logs" ADD CONSTRAINT "clan_activity_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_activity_logs" ADD CONSTRAINT "clan_activity_logs_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_bookmarks" ADD CONSTRAINT "post_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reports" ADD CONSTRAINT "post_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_clanChatMessageId_fkey" FOREIGN KEY ("clanChatMessageId") REFERENCES "clan_chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_stats_cache" ADD CONSTRAINT "match_stats_cache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stats_recompute_queue" ADD CONSTRAINT "stats_recompute_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nexus_rankings" ADD CONSTRAINT "nexus_rankings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_rankings" ADD CONSTRAINT "clan_rankings_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_rankings" ADD CONSTRAINT "clan_rankings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
