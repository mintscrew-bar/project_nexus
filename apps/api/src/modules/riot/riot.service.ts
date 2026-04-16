import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { Role } from "@nexus/database";
import axios from "axios";

// 티어별 포인트 (팀 밸런싱, 경매 선수 가치 산정에 사용)
export const TIER_POINTS: Record<string, number> = {
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

// 디비전별 포인트 (세부 티어 차이 계산에 사용)
export const DIVISION_POINTS: Record<string, number> = {
  I: 75,
  II: 50,
  III: 25,
  IV: 0,
};

// 플레이어의 총 포인트 계산 (팀 밸런싱용)
export function calculatePlayerPoints(tier: string, division: string): number {
  return (TIER_POINTS[tier] || 0) + (DIVISION_POINTS[division] || 0);
}

// 현재 티어가 기존 최고 티어보다 높은지 비교
function isHigherTier(
  currentTier: string,
  currentRank: string,
  peakTier: string | null,
  peakRank: string | null,
): boolean {
  if (!peakTier) return true;
  const currentPoints = calculatePlayerPoints(currentTier, currentRank);
  const peakPoints = calculatePlayerPoints(peakTier, peakRank || "IV");
  return currentPoints > peakPoints;
}

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
  private readonly logger = new Logger(RiotService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly asiaUrl = "https://asia.api.riotgames.com";

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    // Try both ConfigService and process.env
    this.apiKey =
      this.configService.get("RIOT_API_KEY") || process.env.RIOT_API_KEY || "";
    const region =
      this.configService.get("RIOT_REGION") || process.env.RIOT_REGION || "kr";
    this.baseUrl = `https://${region}.api.riotgames.com`;

    this.logger.log(`RiotService initialized (region: ${region})`);
  }

  private async upsertKnownPuuid(
    puuid: string,
    options?: {
      gameName?: string;
      tagLine?: string;
      priority?: number;
      isNexusUser?: boolean;
    },
  ): Promise<void> {
    const existing = await this.prisma.knownPuuid.findUnique({
      where: { puuid },
    });

    const nextPriority = Math.max(existing?.priority ?? 0, options?.priority ?? 0);

    await this.prisma.knownPuuid.upsert({
      where: { puuid },
      create: {
        puuid,
        gameName: options?.gameName,
        tagLine: options?.tagLine,
        priority: nextPriority,
        isNexusUser: options?.isNexusUser ?? false,
      },
      update: {
        gameName: options?.gameName ?? existing?.gameName ?? undefined,
        tagLine: options?.tagLine ?? existing?.tagLine ?? undefined,
        priority: nextPriority,
        isNexusUser: options?.isNexusUser ?? existing?.isNexusUser ?? false,
      },
    });
  }

  private async enqueueStatsRecompute(
    userId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.statsRecomputeQueue.upsert({
      where: { userId },
      create: {
        userId,
        reason,
        queuedAt: new Date(),
      },
      update: {
        reason,
        queuedAt: new Date(),
      },
    });
  }

  private async request<T>(url: string): Promise<T> {
    // Rate limiting check (20 requests per second)
    const rateLimit = await this.redis.checkRateLimit("riot:api", 20, 1);
    if (!rateLimit.allowed) {
      throw new HttpException(
        `Rate limited. Try again in ${rateLimit.resetIn}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const response = await axios.get<T>(url, {
        headers: { "X-Riot-Token": this.apiKey },
        timeout: 5000,
      });
      this.logger.debug(`Riot API ${response.status} ${url}`);
      return response.data;
    } catch (error: any) {
      this.logger.warn("Riot API Error", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url,
      });
      if (error.response?.status === 404) {
        throw new NotFoundException("Summoner not found");
      }
      if (error.response?.status === 403) {
        throw new BadRequestException(
          "Forbidden - API key may be invalid or lack permissions",
        );
      }
      if (error.response?.status === 429) {
        throw new HttpException(
          "Rate limit exceeded",
          HttpStatus.TOO_MANY_REQUESTS,
        );
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
    // Redis 캐시 확인 (2분 TTL — 동일 소환사 중복 API 호출 방지)
    const cacheKey = `riot:summoner:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const url = `${this.asiaUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

    let account;
    try {
      account = await this.request<{
        puuid: string;
        gameName: string;
        tagLine: string;
      }>(url);
    } catch (error) {
      this.logger.warn("getSummonerByRiotId failed", { gameName, tagLine });
      throw error;
    }

    const summoner = await this.request<{
      id: string; // Encrypted summoner ID
      accountId: string;
      puuid: string;
      profileIconId: number;
      revisionDate: number;
      summonerLevel: number;
    }>(`${this.baseUrl}/lol/summoner/v4/summoners/by-puuid/${account.puuid}`);

    // Fetch ranked info using PUUID (new Riot API)
    const rankedInfo = await this.getRankedInfoByPuuid(account.puuid);

    const result = {
      ...account,
      summonerId: summoner.id,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      tier: rankedInfo.tier !== "UNRANKED" ? rankedInfo.tier : undefined,
      rank: rankedInfo.tier !== "UNRANKED" ? rankedInfo.rank : undefined,
      leaguePoints: rankedInfo.lp,
      wins: rankedInfo.wins,
      losses: rankedInfo.losses,
    };

    // 캐시 저장 (2분)
    await this.redis.set(cacheKey, JSON.stringify(result), 120);

    return result;
  }

  async getRankedInfoByPuuid(puuid: string) {
    const leagues = await this.request<
      Array<{
        queueType: string;
        tier: string;
        rank: string;
        leaguePoints: number;
        wins: number;
        losses: number;
      }>
    >(`${this.baseUrl}/lol/league/v4/entries/by-puuid/${puuid}`);

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
    // 인증 시작 시 소환사 캐시를 삭제해 항상 최신 profileIconId를 가져옴
    // (이전 인증 실패 후 재시도 시 캐시된 구 아이콘 ID가 반환되는 문제 방지)
    const cacheKey = `riot:summoner:${gameName.toLowerCase()}:${tagLine.toLowerCase()}`;
    await this.redis.del(cacheKey);

    const summoner = await this.getSummonerByRiotId(gameName, tagLine);

    // 기본 프로필 아이콘 범위(1-28)에서 현재 아이콘과 다른 ID를 선택
    // 현재 아이콘과 동일하면 사용자가 아이콘을 변경하지 않아도 인증이 통과되는 취약점 방지
    let verificationIconId: number;
    let attempts = 0;
    do {
      verificationIconId = Math.floor(Math.random() * 28) + 1;
      attempts++;
    } while (verificationIconId === summoner.profileIconId && attempts < 10);

    // 10회 시도에도 다른 아이콘을 찾지 못한 경우(실질적으로 불가능) 고정값 사용
    if (verificationIconId === summoner.profileIconId) {
      verificationIconId = summoner.profileIconId === 1 ? 2 : 1;
    }

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

    // Verify icon and get summoner ID
    const summoner = await this.request<{
      id: string; // Encrypted summoner ID
      profileIconId: number;
    }>(`${this.baseUrl}/lol/summoner/v4/summoners/by-puuid/${data.puuid}`);

    if (summoner.profileIconId !== data.requiredIconId) {
      throw new BadRequestException("Profile icon verification failed");
    }

    // Get ranked info using PUUID (more reliable than summonerId)
    const ranked = await this.getRankedInfoByPuuid(data.puuid);

    // Use summoner ID from API response instead of Redis data
    const summonerId = summoner.id;

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

    // 사용자 입력 peakTier vs 현재 티어 중 높은 값 사용
    const inputPeakTier = dto.peakTier || ranked.tier;
    const inputPeakRank = dto.peakRank || ranked.rank;
    const useCurrentAsPeak = isHigherTier(
      ranked.tier,
      ranked.rank,
      inputPeakTier,
      inputPeakRank,
    );
    const finalPeakTier = useCurrentAsPeak ? ranked.tier : inputPeakTier;
    const finalPeakRank = useCurrentAsPeak ? ranked.rank : inputPeakRank;

    // Create or update Riot account
    const riotAccount = await this.prisma.riotAccount.upsert({
      where: { puuid: data.puuid },
      update: {
        gameName: data.gameName,
        tagLine: data.tagLine,
        summonerId: summonerId,
        tier: ranked.tier,
        rank: ranked.rank,
        lp: ranked.lp,
        peakTier: finalPeakTier,
        peakRank: finalPeakRank,
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
        summonerId: summonerId,
        tier: ranked.tier,
        rank: ranked.rank,
        lp: ranked.lp,
        peakTier: finalPeakTier,
        peakRank: finalPeakRank,
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

    await this.upsertKnownPuuid(data.puuid, {
      gameName: data.gameName,
      tagLine: data.tagLine,
      priority: 10,
      isNexusUser: true,
    });
    await this.enqueueStatsRecompute(userId, "account-linked");

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

  async syncRankedInfo(userId: string, riotAccountId: string) {
    const account = await this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
    });

    if (!account) {
      throw new NotFoundException("Riot account not found");
    }
    if (account.userId !== userId) {
      throw new ForbiddenException("Cannot sync another user's account");
    }

    // Use PUUID for ranked info to avoid issues with undefined summonerId
    const ranked = await this.getRankedInfoByPuuid(account.puuid);

    // 현재 티어가 최고 티어보다 높으면 peakTier 갱신
    const peakUpdate = isHigherTier(
      ranked.tier,
      ranked.rank,
      account.peakTier,
      account.peakRank,
    )
      ? { peakTier: ranked.tier, peakRank: ranked.rank }
      : {};

    const updated = await this.prisma.riotAccount.update({
      where: { id: riotAccountId },
      data: {
        tier: ranked.tier,
        rank: ranked.rank,
        lp: ranked.lp,
        ...peakUpdate,
        lastSyncedAt: new Date(),
      },
    });

    await this.upsertKnownPuuid(account.puuid, {
      gameName: account.gameName,
      tagLine: account.tagLine,
      priority: 10,
      isNexusUser: true,
    });
    await this.enqueueStatsRecompute(userId, "rank-sync");

    return updated;
  }

  async updateChampionPreferences(
    userId: string,
    riotAccountId: string,
    role: Role,
    championIds: string[],
  ) {
    if (championIds.length < 3) {
      throw new BadRequestException("At least 3 champions required");
    }

    const account = await this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
    });
    if (!account) {
      throw new NotFoundException("Riot account not found");
    }
    if (account.userId !== userId) {
      throw new ForbiddenException(
        "Cannot modify another user's champion preferences",
      );
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

  async deleteRiotAccount(
    userId: string,
    riotAccountId: string,
  ): Promise<void> {
    const account = await this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
    });

    if (!account) {
      throw new NotFoundException("Riot account not found");
    }
    if (account.userId !== userId) {
      throw new ForbiddenException("Cannot delete another user's account");
    }

    // 삭제하려는 계정이 대표 계정이면 다른 계정을 대표로 지정
    if (account.isPrimary) {
      const other = await this.prisma.riotAccount.findFirst({
        where: { userId, id: { not: riotAccountId } },
        orderBy: { verifiedAt: "desc" },
      });
      if (other) {
        await this.prisma.riotAccount.update({
          where: { id: other.id },
          data: { isPrimary: true },
        });
      }
    }

    await this.prisma.riotAccount.delete({ where: { id: riotAccountId } });
  }

  async updateRiotAccountInfo(
    userId: string,
    riotAccountId: string,
    dto: {
      mainRole: Role;
      subRole: Role;
      peakTier?: string;
      peakRank?: string;
      championsByRole?: { [key in Role]?: string[] };
    },
  ) {
    const account = await this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
    });

    if (!account) {
      throw new NotFoundException("Riot account not found");
    }
    if (account.userId !== userId) {
      throw new ForbiddenException("Cannot modify another user's account");
    }

    if (dto.mainRole === dto.subRole) {
      throw new BadRequestException("주 역할과 부 역할은 동일할 수 없습니다");
    }

    // peakTier는 기존보다 높을 때만 갱신 (절대 내려가지 않음)
    let peakUpdate = {};
    if (dto.peakTier !== undefined) {
      if (
        isHigherTier(
          dto.peakTier,
          dto.peakRank || "IV",
          account.peakTier,
          account.peakRank,
        )
      ) {
        peakUpdate = { peakTier: dto.peakTier, peakRank: dto.peakRank || "IV" };
      }
    }

    await this.prisma.riotAccount.update({
      where: { id: riotAccountId },
      data: {
        mainRole: dto.mainRole,
        subRole: dto.subRole,
        ...peakUpdate,
      },
    });

    if (dto.championsByRole) {
      for (const [role, championIds] of Object.entries(dto.championsByRole)) {
        if (championIds && championIds.length >= 3) {
          await this.updateChampionPreferences(
            userId,
            riotAccountId,
            role as Role,
            championIds,
          );
        }
      }
    }

    return this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
      include: {
        championPreferences: { orderBy: [{ role: "asc" }, { order: "asc" }] },
      },
    });
  }
}
