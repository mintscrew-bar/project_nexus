import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { Role } from "@nexus/database";
import axios from "axios";

const TIER_POINTS: Record<string, number> = {
  CHALLENGER: 2800,
  GRANDMASTER: 2600,
  MASTER: 2400,
  DIAMOND: 2000,
  EMERALD: 1600,
  PLATINUM: 1200,
  GOLD: 800,
  SILVER: 400,
  BRONZE: 200,
  IRON: 100,
  UNRANKED: 0,
};

const DIVISION_POINTS: Record<string, number> = {
  I: 75,
  II: 50,
  III: 25,
  IV: 0,
};

export interface RegisterRiotAccountDto {
  gameName: string;
  tagLine: string;
  peakTier?: string;
  peakRank?: string;
  mainRole: Role;
  subRole: Role;
  championsByRole: {
    [key in Role]?: string[]; // Champion IDs
  };
}

@Injectable()
export class RiotService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly asiaUrl = "https://asia.api.riotgames.com";

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.configService.get("RIOT_API_KEY") || "";
    const region = this.configService.get("RIOT_REGION") || "kr";
    this.baseUrl = `https://${region}.api.riotgames.com`;
  }

  private async request<T>(url: string): Promise<T> {
    // Rate limiting check (20 requests per second)
    const rateLimit = await this.redis.checkRateLimit("riot:api", 20, 1);
    if (!rateLimit.allowed) {
      throw new BadRequestException(
        `Rate limited. Try again in ${rateLimit.resetIn}s`,
      );
    }

    try {
      const response = await axios.get<T>(url, {
        headers: { "X-Riot-Token": this.apiKey },
        timeout: 5000,
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new NotFoundException("Summoner not found");
      }
      if (error.response?.status === 429) {
        throw new BadRequestException("Rate limit exceeded");
      }
      throw new BadRequestException(
        error.response?.data?.status?.message || "Riot API error",
      );
    }
  }

  // ========================================
  // Account Lookup
  // ========================================

  async getSummonerByRiotId(gameName: string, tagLine: string) {
    const account = await this.request<{
      puuid: string;
      gameName: string;
      tagLine: string;
    }>(
      `${this.asiaUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    );

    const summoner = await this.request<{
      id: string;
      accountId: string;
      puuid: string;
      profileIconId: number;
      summonerLevel: number;
    }>(`${this.baseUrl}/lol/summoner/v4/summoners/by-puuid/${account.puuid}`);

    return {
      ...account,
      summonerId: summoner.id,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
    };
  }

  async getRankedInfo(summonerId: string) {
    const leagues = await this.request<
      Array<{
        queueType: string;
        tier: string;
        rank: string;
        leaguePoints: number;
        wins: number;
        losses: number;
      }>
    >(`${this.baseUrl}/lol/league/v4/entries/by-summoner/${summonerId}`);

    const soloQueue = leagues.find((l) => l.queueType === "RANKED_SOLO_5x5");

    if (!soloQueue) {
      return {
        tier: "UNRANKED",
        rank: "",
        lp: 0,
        wins: 0,
        losses: 0,
      };
    }

    return {
      tier: soloQueue.tier,
      rank: soloQueue.rank,
      lp: soloQueue.leaguePoints,
      wins: soloQueue.wins,
      losses: soloQueue.losses,
    };
  }

  // ========================================
  // Account Verification (Icon Method)
  // ========================================

  async startVerification(userId: string, gameName: string, tagLine: string) {
    const summoner = await this.getSummonerByRiotId(gameName, tagLine);

    // Generate random icon ID for verification (1-28)
    const verificationIconId = Math.floor(Math.random() * 28) + 1;

    // Store verification data in Redis (expires in 10 minutes)
    await this.redis.set(
      `verify:${userId}`,
      JSON.stringify({
        puuid: summoner.puuid,
        summonerId: summoner.summonerId,
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        currentIconId: summoner.profileIconId,
        requiredIconId: verificationIconId,
      }),
      600, // 10 minutes
    );

    return {
      gameName: summoner.gameName,
      tagLine: summoner.tagLine,
      currentIconId: summoner.profileIconId,
      requiredIconId: verificationIconId,
      expiresIn: 600,
    };
  }

  async checkVerification(userId: string) {
    const verificationData = await this.redis.get(`verify:${userId}`);

    if (!verificationData) {
      throw new BadRequestException("Verification expired or not found");
    }

    const data = JSON.parse(verificationData);

    // Check current profile icon
    const summoner = await this.request<{ profileIconId: number }>(
      `${this.baseUrl}/lol/summoner/v4/summoners/by-puuid/${data.puuid}`,
    );

    if (summoner.profileIconId !== data.requiredIconId) {
      return {
        verified: false,
        expected: data.requiredIconId,
        current: summoner.profileIconId,
      };
    }

    return {
      verified: true,
      expected: data.requiredIconId,
      current: summoner.profileIconId,
    };
  }

  // ========================================
  // Account Registration
  // ========================================

  async registerRiotAccount(userId: string, dto: RegisterRiotAccountDto) {
    // Check verification
    const verificationData = await this.redis.get(`verify:${userId}`);
    if (!verificationData) {
      throw new BadRequestException("Please complete verification first");
    }

    const data = JSON.parse(verificationData);

    // Verify icon
    const summoner = await this.request<{ profileIconId: number }>(
      `${this.baseUrl}/lol/summoner/v4/summoners/by-puuid/${data.puuid}`,
    );

    if (summoner.profileIconId !== data.requiredIconId) {
      throw new BadRequestException("Profile icon verification failed");
    }

    // Get ranked info
    const ranked = await this.getRankedInfo(data.summonerId);

    // Validate champion preferences (at least 3 per role)
    for (const role of [dto.mainRole, dto.subRole]) {
      const champions = dto.championsByRole[role] || [];
      if (champions.length < 3) {
        throw new BadRequestException(
          `At least 3 champions required for ${role}`,
        );
      }
    }

    // Check if account already exists
    const existing = await this.prisma.riotAccount.findUnique({
      where: { puuid: data.puuid },
    });

    if (existing && existing.userId !== userId) {
      throw new BadRequestException(
        "This Riot account is already linked to another user",
      );
    }

    // Set other accounts as non-primary
    await this.prisma.riotAccount.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false },
    });

    // Create or update Riot account
    const riotAccount = await this.prisma.riotAccount.upsert({
      where: { puuid: data.puuid },
      update: {
        gameName: data.gameName,
        tagLine: data.tagLine,
        summonerId: data.summonerId,
        tier: ranked.tier,
        rank: ranked.rank,
        lp: ranked.lp,
        peakTier: dto.peakTier || ranked.tier,
        peakRank: dto.peakRank || ranked.rank,
        mainRole: dto.mainRole,
        subRole: dto.subRole,
        isPrimary: true,
        verifiedAt: new Date(),
        lastSyncedAt: new Date(),
      },
      create: {
        userId,
        puuid: data.puuid,
        gameName: data.gameName,
        tagLine: data.tagLine,
        summonerId: data.summonerId,
        tier: ranked.tier,
        rank: ranked.rank,
        lp: ranked.lp,
        peakTier: dto.peakTier || ranked.tier,
        peakRank: dto.peakRank || ranked.rank,
        mainRole: dto.mainRole,
        subRole: dto.subRole,
        isPrimary: true,
        verifiedAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });

    // Delete existing champion preferences
    await this.prisma.championPreference.deleteMany({
      where: { riotAccountId: riotAccount.id },
    });

    // Create champion preferences
    const championPreferences = [];
    for (const [role, championIds] of Object.entries(dto.championsByRole)) {
      if (!championIds || championIds.length === 0) continue;

      for (let i = 0; i < championIds.length; i++) {
        championPreferences.push({
          riotAccountId: riotAccount.id,
          role: role as Role,
          championId: championIds[i],
          order: i + 1,
        });
      }
    }

    if (championPreferences.length > 0) {
      await this.prisma.championPreference.createMany({
        data: championPreferences,
      });
    }

    // Clean up verification data
    await this.redis.del(`verify:${userId}`);

    return this.prisma.riotAccount.findUnique({
      where: { id: riotAccount.id },
      include: {
        championPreferences: {
          orderBy: [{ role: "asc" }, { order: "asc" }],
        },
      },
    });
  }

  // ========================================
  // Account Sync
  // ========================================

  async syncRankedInfo(riotAccountId: string) {
    const account = await this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
    });

    if (!account) {
      throw new NotFoundException("Riot account not found");
    }

    const ranked = await this.getRankedInfo(account.summonerId);

    return this.prisma.riotAccount.update({
      where: { id: riotAccountId },
      data: {
        tier: ranked.tier,
        rank: ranked.rank,
        lp: ranked.lp,
        lastSyncedAt: new Date(),
      },
    });
  }

  async updateChampionPreferences(
    riotAccountId: string,
    role: Role,
    championIds: string[],
  ) {
    if (championIds.length < 3) {
      throw new BadRequestException("At least 3 champions required");
    }

    // Delete existing preferences for this role
    await this.prisma.championPreference.deleteMany({
      where: { riotAccountId, role },
    });

    // Create new preferences
    const preferences = championIds.map((championId, index) => ({
      riotAccountId,
      role,
      championId,
      order: index + 1,
    }));

    await this.prisma.championPreference.createMany({
      data: preferences,
    });

    return this.prisma.championPreference.findMany({
      where: { riotAccountId, role },
      orderBy: { order: "asc" },
    });
  }

  // ========================================
  // User Riot Accounts
  // ========================================

  async getUserRiotAccounts(userId: string) {
    return this.prisma.riotAccount.findMany({
      where: { userId },
      include: {
        championPreferences: {
          orderBy: [{ role: "asc" }, { order: "asc" }],
        },
      },
      orderBy: [{ isPrimary: "desc" }, { verifiedAt: "desc" }],
    });
  }

  async setPrimaryAccount(userId: string, riotAccountId: string) {
    const account = await this.prisma.riotAccount.findFirst({
      where: { id: riotAccountId, userId },
    });

    if (!account) {
      throw new NotFoundException("Riot account not found");
    }

    await this.prisma.riotAccount.updateMany({
      where: { userId, isPrimary: true },
      data: { isPrimary: false },
    });

    return this.prisma.riotAccount.update({
      where: { id: riotAccountId },
      data: { isPrimary: true },
    });
  }
}
