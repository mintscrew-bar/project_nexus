import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
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

@Injectable()
export class RiotService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://kr.api.riotgames.com";
  private readonly asiaUrl = "https://asia.api.riotgames.com";

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.apiKey = this.configService.get("RIOT_API_KEY") || "";
  }

  private async request<T>(url: string): Promise<T> {
    // Rate limiting check
    const rateLimit = await this.redis.checkRateLimit("riot:api", 20, 1);
    if (!rateLimit.allowed) {
      throw new BadRequestException(
        `Rate limited. Try again in ${rateLimit.resetIn}s`,
      );
    }

    const response = await axios.get<T>(url, {
      headers: { "X-Riot-Token": this.apiKey },
    });

    return response.data;
  }

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
        mmrPoints: TIER_POINTS.UNRANKED,
      };
    }

    const mmrPoints =
      (TIER_POINTS[soloQueue.tier] || 0) +
      (DIVISION_POINTS[soloQueue.rank] || 0) +
      soloQueue.leaguePoints;

    return {
      tier: soloQueue.tier,
      rank: soloQueue.rank,
      lp: soloQueue.leaguePoints,
      wins: soloQueue.wins,
      losses: soloQueue.losses,
      mmrPoints,
    };
  }

  async startVerification(userId: string, gameName: string, tagLine: string) {
    const summoner = await this.getSummonerByRiotId(gameName, tagLine);

    // Generate random icon ID for verification
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
      600,
    );

    return {
      gameName: summoner.gameName,
      tagLine: summoner.tagLine,
      currentIconId: summoner.profileIconId,
      requiredIconId: verificationIconId,
      expiresIn: 600,
    };
  }

  async verifyAccount(userId: string) {
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
      throw new BadRequestException(
        `Profile icon mismatch. Expected ${data.requiredIconId}, got ${summoner.profileIconId}`,
      );
    }

    // Get ranked info
    const ranked = await this.getRankedInfo(data.summonerId);

    // Save to database
    const riotAccount = await this.prisma.riotAccount.upsert({
      where: { puuid: data.puuid },
      update: {
        gameName: data.gameName,
        tagLine: data.tagLine,
        summonerId: data.summonerId,
        tier: ranked.tier,
        rank: ranked.rank,
        lp: ranked.lp,
        mmrPoints: ranked.mmrPoints,
        verifiedAt: new Date(),
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
        mmrPoints: ranked.mmrPoints,
        isPrimary: true,
        verifiedAt: new Date(),
      },
    });

    // Clean up verification data
    await this.redis.del(`verify:${userId}`);

    return riotAccount;
  }

  async syncRankedInfo(riotAccountId: string) {
    const account = await this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
    });

    if (!account) {
      throw new BadRequestException("Riot account not found");
    }

    const ranked = await this.getRankedInfo(account.summonerId);

    return this.prisma.riotAccount.update({
      where: { id: riotAccountId },
      data: {
        tier: ranked.tier,
        rank: ranked.rank,
        lp: ranked.lp,
        mmrPoints: ranked.mmrPoints,
        lastSyncedAt: new Date(),
      },
    });
  }
}
