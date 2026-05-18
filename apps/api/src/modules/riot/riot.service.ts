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
import { DiscordBotService } from "../discord/discord-bot.service";
import { Role } from "@nexus/database";
import axios from "axios";

// 승인된 API key 메서드별 레이트 리밋 (limit / windowSeconds)
const RIOT_RATE_LIMITS: Record<string, { limit: number; windowSeconds: number }> = {
  // champion-rotation, challenger/grandmaster/master/leagues-list: 30 req/10s
  TIER_LIST:     { limit: 30,    windowSeconds: 10 },
  // league entries by queue/tier/division, league-exp entries:    50 req/10s
  LEAGUE_ENTRIES:{ limit: 50,    windowSeconds: 10 },
  // account-v1 by riot-id / by puuid:                          1000 req/min
  ACCOUNT:       { limit: 1000,  windowSeconds: 60 },
  // summoner-v4:                                               1600 req/min
  SUMMONER:      { limit: 1600,  windowSeconds: 60 },
  // match-v5:                                                  2000 req/10s
  MATCH:         { limit: 2000,  windowSeconds: 10 },
  // spectator-v5:                                             3000 req/10s
  SPECTATOR:     { limit: 3000,  windowSeconds: 10 },
  // champion-mastery-v4, lol-challenges-v1, clash-v1,
  // league entries/by-puuid, lol-status-v4:                 20000 req/10s
  HIGH:          { limit: 20000, windowSeconds: 10 },
};

// URL 패턴 → 레이트 리밋 그룹 매핑
function resolveRateLimitGroup(url: string): keyof typeof RIOT_RATE_LIMITS {
  if (
    url.includes("/lol/platform/v3/champion-rotations") ||
    url.includes("/lol/league/v4/challengerleagues/") ||
    url.includes("/lol/league/v4/grandmasterleagues/") ||
    url.includes("/lol/league/v4/masterleagues/") ||
    url.includes("/lol/league/v4/leagues/")
  ) return "TIER_LIST";

  // /entries/{queue}/{tier}/{division} — 대문자로 시작하는 큐명으로 구분
  if (/\/lol\/league(?:-exp)?\/v4\/entries\/[A-Z]/.test(url)) return "LEAGUE_ENTRIES";

  if (url.includes("/riot/account/v1/")) return "ACCOUNT";
  if (url.includes("/lol/summoner/v4/")) return "SUMMONER";
  if (url.includes("/lol/match/v5/"))    return "MATCH";
  if (url.includes("/lol/spectator/v5/")) return "SPECTATOR";

  return "HIGH";
}

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

type RiotLeagueEntryDto = {
  puuid?: string;
  summonerId: string;
};

type RiotLeagueListDto = {
  entries: RiotLeagueEntryDto[];
};

export type HighTierSoloQueuePuuidResult = {
  puuids: string[];
  challengerCount: number;
  grandmasterCount: number;
  missingPuuidCount: number;
};

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
    private readonly discordBotService: DiscordBotService,
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

    const nextPriority = Math.max(
      existing?.priority ?? 0,
      options?.priority ?? 0,
    );

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
    const group = resolveRateLimitGroup(url);
    const { limit, windowSeconds } = RIOT_RATE_LIMITS[group];
    const rateLimit = await this.redis.checkRateLimit(
      `riot:rl:${group.toLowerCase()}`,
      limit,
      windowSeconds,
    );
    if (!rateLimit.allowed) {
      throw new HttpException(
        `Rate limited (${group}). Try again in ${rateLimit.resetIn}s`,
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
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new ForbiddenException(
          "Riot API key is invalid or expired",
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
    } catch (error: any) {
      // account-v1은 존재하지 않는 계정에 404 대신 400을 반환하는 케이스가 있음
      if (error instanceof BadRequestException) {
        throw new NotFoundException("Summoner not found");
      }
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

  async getHighTierSoloQueuePuuids(): Promise<HighTierSoloQueuePuuidResult> {
    const queue = "RANKED_SOLO_5x5";
    const [challenger, grandmaster] = await Promise.all([
      this.request<RiotLeagueListDto>(
        `${this.baseUrl}/lol/league/v4/challengerleagues/by-queue/${queue}`,
      ),
      this.request<RiotLeagueListDto>(
        `${this.baseUrl}/lol/league/v4/grandmasterleagues/by-queue/${queue}`,
      ),
    ]);

    const entries = [...challenger.entries, ...grandmaster.entries];
    const puuids = entries
      .map((entry) => entry.puuid)
      .filter((puuid): puuid is string => Boolean(puuid));
    const missingPuuidCount = entries.length - puuids.length;

    if (missingPuuidCount > 0) {
      this.logger.warn(
        `High-tier league entries without puuid: ${missingPuuidCount}`,
      );
    }

    return {
      puuids,
      challengerCount: challenger.entries.length,
      grandmasterCount: grandmaster.entries.length,
      missingPuuidCount,
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
    // 아이콘 변경 인증 단계를 제거하고 닉네임/태그로 직접 puuid 조회 후 등록.
    // 라이엇은 외부 OAuth 가 없어 100% 본인 확인이 불가하지만, puuid 유니크 제약으로
    // 이중 등록(다른 유저가 이미 연동한 계정)은 막힘.
    const summoner = await this.getSummonerByRiotId(dto.gameName, dto.tagLine);

    // getSummonerByRiotId 는 UNRANKED 일 때 tier/rank 를 undefined 로 반환하므로 보정.
    const ranked = {
      tier: summoner.tier ?? "UNRANKED",
      rank: summoner.rank ?? "",
      lp: summoner.leaguePoints ?? 0,
    };

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
      where: { puuid: summoner.puuid },
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
      where: { puuid: summoner.puuid },
      update: {
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        summonerId: summoner.summonerId,
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
        puuid: summoner.puuid,
        gameName: summoner.gameName,
        tagLine: summoner.tagLine,
        summonerId: summoner.summonerId,
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

    await this.upsertKnownPuuid(summoner.puuid, {
      gameName: summoner.gameName,
      tagLine: summoner.tagLine,
      priority: 10,
      isNexusUser: true,
    });
    await this.enqueueStatsRecompute(userId, "account-linked");
    await this.discordBotService.syncUserTierAndLineRoles(userId).catch(() => {
      this.logger.warn(`Discord tier/line role sync failed (register): ${userId}`);
    });

    // 옛 아이콘 인증 흔적이 남아 있다면 청소(이전 버전에서 step2 진행 중이던 유저 대비).
    await this.redis.del(`verify:${userId}`).catch(() => undefined);

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
    await this.discordBotService.syncUserTierAndLineRoles(userId).catch(() => {
      this.logger.warn(`Discord tier/line role sync failed (rank-sync): ${userId}`);
    });

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
    const accounts = await this.prisma.riotAccount.findMany({
      where: { userId },
      include: {
        championPreferences: {
          orderBy: [{ role: "asc" }, { order: "asc" }],
        },
      },
      orderBy: [{ isPrimary: "desc" }, { verifiedAt: "desc" }],
    });

    // 자가 치유: 계정은 있는데 primary가 하나도 없는 경우 가장 최근 계정을 primary로 승격
    if (accounts.length > 0 && !accounts.some((a) => a.isPrimary)) {
      const target = accounts[0];
      await this.prisma.riotAccount.update({
        where: { id: target.id },
        data: { isPrimary: true },
      });
      target.isPrimary = true;
    }

    return accounts;
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

    const updated = await this.prisma.riotAccount.update({
      where: { id: riotAccountId },
      data: { isPrimary: true },
    });
    await this.discordBotService.syncUserTierAndLineRoles(userId).catch(() => {
      this.logger.warn(`Discord tier/line role sync failed (primary): ${userId}`);
    });
    return updated;
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
    await this.discordBotService.syncUserTierAndLineRoles(userId).catch(() => {
      this.logger.warn(`Discord tier/line role sync failed (delete): ${userId}`);
    });
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
    await this.discordBotService.syncUserTierAndLineRoles(userId).catch(() => {
      this.logger.warn(`Discord tier/line role sync failed (update): ${userId}`);
    });

    return this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
      include: {
        championPreferences: { orderBy: [{ role: "asc" }, { order: "asc" }] },
      },
    });
  }
}
