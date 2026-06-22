import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { RiotRateLimiterService } from "./riot-rate-limiter.service";

// Riot Match-V5 API Response Types
export interface MatchDto {
  metadata: {
    matchId: string;
    participants: string[]; // puuids
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp: number;
    gameId: number;
    gameMode: string;
    gameName: string;
    gameStartTimestamp: number;
    gameType: string;
    gameVersion: string;
    mapId: number;
    platformId: string;
    queueId: number;
    tournamentCode?: string;
    participants: ParticipantDto[];
    teams: TeamDto[];
  };
}

export interface ParticipantDto {
  puuid: string;
  participantId: number;
  teamId: number;
  championId: number;
  championName: string;
  teamPosition: string;

  // Summoner Spells
  summoner1Id: number;
  summoner2Id: number;

  // KDA
  kills: number;
  deaths: number;
  assists: number;

  // Farm & Gold
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  goldSpent: number;

  // Damage
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  totalHeal: number;
  damageSelfMitigated: number;

  // Vision
  visionScore: number;
  wardsPlaced: number;
  wardsKilled: number;
  detectorWardsPlaced: number;

  // Items
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  item7?: number; // Quest reward slot (Role Quest - boots/wards)

  // Perks
  perks: {
    statPerks: {
      defense: number;
      flex: number;
      offense: number;
    };
    styles: {
      description: string;
      selections: {
        perk: number;
        var1: number;
        var2: number;
        var3: number;
      }[];
      style: number;
    }[];
  };

  // Stats
  champLevel: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  totalTimeSpentDead: number;

  // Objectives
  turretKills: number;
  inhibitorKills: number;
  dragonKills: number;
  baronKills: number;

  // Performance
  doubleKills: number;
  tripleKills: number;
  quadraKills: number;
  pentaKills: number;
  firstBloodKill: boolean;
  firstTowerKill: boolean;

  // Result
  win: boolean;
}

export interface TeamDto {
  teamId: number;
  win: boolean;
  bans: {
    championId: number;
    pickTurn: number;
  }[];
  objectives: {
    baron: { first: boolean; kills: number };
    champion: { first: boolean; kills: number };
    dragon: { first: boolean; kills: number };
    inhibitor: { first: boolean; kills: number };
    riftHerald: { first: boolean; kills: number };
    tower: { first: boolean; kills: number };
  };
}

type RiotMatchRequestPriority = "foreground" | "background";

interface GetMatchByIdOptions {
  emitCacheEvent?: boolean;
  propagateKnownPuuids?: boolean;
}

@Injectable()
export class RiotMatchService {
  private readonly logger = new Logger(RiotMatchService.name);
  private readonly apiKey: string;
  private readonly baseUrl = "https://asia.api.riotgames.com";
  private readonly matchRateLimitMax: number;
  private readonly matchRateLimitWindowSeconds: number;
  private readonly matchRequestDelayMs: number;
  private readonly backgroundMatchRateLimitMax: number;
  private readonly backgroundMatchRequestDelayMs: number;
  private lastMatchRequestAt = 0;
  private lastBackgroundMatchRequestAt = 0;

  // In-memory cache for match data (matches don't change after the game ends)
  private readonly matchCache = new Map<
    string,
    { data: MatchDto; expires: number }
  >();
  private readonly timelineCache = new Map<
    string,
    { data: any; expires: number }
  >();
  private readonly MATCH_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly rateLimiter: RiotRateLimiterService,
  ) {
    this.apiKey = this.configService.get("RIOT_API_KEY") || "";
    if (!this.apiKey) {
      this.logger.warn("RIOT_API_KEY not configured");
    }
    this.matchRateLimitMax = this.getPositiveIntConfig(
      "RIOT_MATCH_RATE_LIMIT_MAX",
      70,
    );
    this.matchRateLimitWindowSeconds = this.getPositiveIntConfig(
      "RIOT_MATCH_RATE_LIMIT_WINDOW_SECONDS",
      120,
    );
    this.matchRequestDelayMs = this.getPositiveIntConfig(
      "RIOT_MATCH_REQUEST_DELAY_MS",
      1350,
    );
    this.backgroundMatchRateLimitMax = this.getPositiveIntConfig(
      "RIOT_MATCH_BACKGROUND_RATE_LIMIT_MAX",
      15,
    );
    this.backgroundMatchRequestDelayMs = this.getPositiveIntConfig(
      "RIOT_MATCH_BACKGROUND_REQUEST_DELAY_MS",
      8000,
    );

    // 만료된 in-memory 캐시 엔트리를 1시간마다 정리 (메모리 누수 방지)
    setInterval(
      () => {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, val] of this.matchCache) {
          if (val.expires < now) {
            this.matchCache.delete(key);
            cleaned++;
          }
        }
        for (const [key, val] of this.timelineCache) {
          if (val.expires < now) {
            this.timelineCache.delete(key);
            cleaned++;
          }
        }
        if (cleaned > 0) {
          this.logger.debug(
            `in-memory 캐시 정리: ${cleaned}개 만료 엔트리 삭제`,
          );
        }
      },
      60 * 60 * 1000,
    ); // 1시간마다
  }

  private getPositiveIntConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.logger.warn(`Invalid config ${key}=${raw}, fallback=${fallback}`);
      return fallback;
    }
    return Math.floor(parsed);
  }

  private async waitForMatchRateLimit(
    priority: RiotMatchRequestPriority,
  ): Promise<void> {
    const isBackground = priority === "background";
    const key = isBackground
      ? "riot:rl:match:background"
      : "riot:rl:match:foreground";
    const limit = isBackground
      ? this.backgroundMatchRateLimitMax
      : this.matchRateLimitMax;
    const delayMs = isBackground
      ? this.backgroundMatchRequestDelayMs
      : this.matchRequestDelayMs;
    const lastRequestAt = isBackground
      ? this.lastBackgroundMatchRequestAt
      : this.lastMatchRequestAt;

    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs - elapsed));
    }

    const rl = await this.redis.checkRateLimit(
      key,
      limit,
      this.matchRateLimitWindowSeconds,
    );

    if (!rl.allowed) {
      const waitMs = rl.resetIn * 1000 + 500;
      this.logger.warn(
        `Riot Match API ${priority} local limit reached (${limit}/${this.matchRateLimitWindowSeconds}s), waiting ${waitMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.waitForMatchRateLimit(priority);
    }

    // 전역 예산(퍼스널 키 100/2분·20/1초) — 모든 Riot 호출이 공유하는 권위 캡.
    // 로컬 분리 캡을 통과해도 전역 예산이 없으면 생길 때까지 대기한다.
    const acquired = await this.rateLimiter.acquireWaiting();
    if (!acquired) {
      this.logger.warn(`Riot 전역 예산 대기 한도 초과 (${priority}), 재시도`);
      return this.waitForMatchRateLimit(priority);
    }

    if (isBackground) {
      this.lastBackgroundMatchRequestAt = Date.now();
    } else {
      this.lastMatchRequestAt = Date.now();
    }
  }

  private async waitForRateLimit(
    retryAfterHeader?: string,
    defaultMs = 2000,
  ): Promise<void> {
    const waitMs = retryAfterHeader
      ? parseInt(retryAfterHeader, 10) * 1000 + 200
      : defaultMs;
    this.logger.warn(`Rate limit hit, waiting ${waitMs}ms before retry...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  /**
   * Riot `info.gameVersion` (ex: "14.8.616.1234")에서 패치 버전("14.8")만 추출.
   * 챔피언/아이템 메타가 패치 단위로 바뀌므로 Lab 분석 시 기준 키로 사용.
   */
  private parsePatchVersion(gameVersion?: string): string | null {
    if (!gameVersion) return null;
    const parts = gameVersion.split(".");
    if (parts.length < 2) return null;
    const major = parts[0]?.trim();
    const minor = parts[1]?.trim();
    if (!major || !minor) return null;
    return `${major}.${minor}`;
  }

  private async propagateKnownPuuids(matchData: MatchDto): Promise<void> {
    const participantPuuids = Array.from(
      new Set(matchData.metadata.participants.filter(Boolean)),
    );

    if (participantPuuids.length === 0) {
      return;
    }

    const linkedAccounts = await this.prisma.riotAccount.findMany({
      where: {
        puuid: { in: participantPuuids },
      },
      select: {
        puuid: true,
        gameName: true,
        tagLine: true,
        userId: true,
      },
    });

    const hasNexusUser = linkedAccounts.length > 0;

    const existingRows = await this.prisma.knownPuuid.findMany({
      where: { puuid: { in: participantPuuids } },
      select: {
        puuid: true,
        priority: true,
        isNexusUser: true,
        gameName: true,
        tagLine: true,
      },
    });

    const existingMap = new Map(existingRows.map((row) => [row.puuid, row]));
    const linkedMap = new Map(linkedAccounts.map((row) => [row.puuid, row]));

    await Promise.all(
      participantPuuids.map((puuid) => {
        const existing = existingMap.get(puuid);
        const linked = linkedMap.get(puuid);
        const nextPriority = linked
          ? Math.max(existing?.priority ?? 0, 10)
          : Math.max(existing?.priority ?? 0, hasNexusUser ? 5 : 0);

        return this.prisma.knownPuuid.upsert({
          where: { puuid },
          create: {
            puuid,
            gameName: linked?.gameName,
            tagLine: linked?.tagLine,
            priority: nextPriority,
            isNexusUser: Boolean(linked),
          },
          update: {
            gameName: linked?.gameName ?? existing?.gameName ?? undefined,
            tagLine: linked?.tagLine ?? existing?.tagLine ?? undefined,
            priority: nextPriority,
            isNexusUser: Boolean(linked) || existing?.isNexusUser || false,
          },
        });
      }),
    );

    await Promise.all(
      Array.from(new Set(linkedAccounts.map((account) => account.userId))).map(
        (userId) =>
          this.prisma.statsRecomputeQueue.upsert({
            where: { userId },
            create: {
              userId,
              reason: "riot-match-added",
              queuedAt: new Date(),
            },
            update: {
              reason: "riot-match-added",
              queuedAt: new Date(),
            },
          }),
      ),
    );
  }

  /**
   * Get match data by match ID (with in-memory cache + 429 retry)
   */
  async getMatchById(
    matchId: string,
    retries = 3,
    priority: RiotMatchRequestPriority = "foreground",
    options: GetMatchByIdOptions = {},
  ): Promise<MatchDto | null> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return null;
    }

    // matchId는 외부 입력이 axios URL에 삽입되므로 형식 검증으로 SSRF 차단
    if (!/^[A-Z0-9]{2,10}_\d+$/.test(matchId)) {
      this.logger.warn(`잘못된 matchId 형식 거부: ${matchId}`);
      return null;
    }

    // 1. In-memory cache (fastest)
    const cached = this.matchCache.get(matchId);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    // 2. DB 영구 캐시 (서버 재시작해도 유지)
    try {
      const dbCached = await this.prisma.riotMatchCache.findUnique({
        where: { matchId },
      });
      if (dbCached) {
        const matchData = dbCached.data as unknown as MatchDto;
        // in-memory 캐시에도 올려두기
        this.matchCache.set(matchId, {
          data: matchData,
          expires: Date.now() + this.MATCH_CACHE_TTL_MS,
        });
        return matchData;
      }
    } catch (dbErr) {
      this.logger.warn(`DB cache read failed for ${matchId}: ${dbErr}`);
    }

    try {
      const url = `${this.baseUrl}/lol/match/v5/matches/${matchId}`;

      this.logger.log(`Fetching match data: ${matchId}`);

      await this.waitForMatchRateLimit(priority);

      const response = await axios.get<MatchDto>(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 15000,
      });

      const matchData = response.data;

      // in-memory 캐시
      this.matchCache.set(matchId, {
        data: matchData,
        expires: Date.now() + this.MATCH_CACHE_TTL_MS,
      });

      // DB 영구 캐시 저장 (비동기 — 응답 지연 없이 저장)
      const queueId = matchData.info?.queueId ?? 0;
      const gameEndTs = matchData.info?.gameEndTimestamp ?? Date.now();
      const patchVersion = this.parsePatchVersion(matchData.info?.gameVersion);
      const emitCacheEvent = options.emitCacheEvent ?? true;
      const propagateKnownPuuids = options.propagateKnownPuuids ?? true;
      void this.prisma.riotMatchCache
        .upsert({
          where: { matchId },
          create: {
            matchId,
            data: matchData as any,
            queueId,
            gameEnd: new Date(gameEndTs),
            patchVersion,
          },
          update: {}, // 이미 존재하면 덮어쓰지 않음
        })
        .then(async () => {
          // 캐시 저장 완료 → 정규화 ingest 트리거 (RiotMatchCacheIngestService가 listen)
          if (emitCacheEvent) {
            const result = this.eventEmitter.emit("riot.match.cached", {
              matchId,
            });
            this.logger.log(
              `Emitted riot.match.cached for ${matchId} (received=${result})`,
            );
          }

          if (propagateKnownPuuids) {
            await this.propagateKnownPuuids(matchData);
          }
        })
        .catch((e: any) =>
          this.logger.warn(`DB cache write failed for ${matchId}: ${e}`),
        );

      return matchData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`Match not found: ${matchId}`);
        return null;
      }

      if (error.response?.status === 429) {
        if (retries > 0) {
          await this.waitForRateLimit(error.response.headers["retry-after"]);
          return this.getMatchById(matchId, retries - 1, priority, options);
        }
        this.logger.error(
          `Rate limit exhausted for match ${matchId}, skipping`,
        );
        return null;
      }

      if (error.response?.status === 403) {
        this.logger.error(
          `Riot API key forbidden (expired?) for match ${matchId}`,
        );
        return null;
      }

      if (
        (error.response?.status === 500 || error.response?.status === 503) &&
        retries > 0
      ) {
        this.logger.warn(
          `Riot API ${error.response.status} for ${matchId}, retrying (${retries} left)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 800));
        return this.getMatchById(matchId, retries - 1, priority, options);
      }

      if (!error.response && retries > 0) {
        // Network/timeout error - retry once
        this.logger.warn(
          `Network error for match ${matchId}, retrying (${retries} left)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getMatchById(matchId, retries - 1, priority, options);
      }

      this.logger.error(`Error fetching match ${matchId}:`, error.message);
      return null;
    }
  }

  /**
   * Get matches by tournament code
   */
  async getMatchIdsByTournamentCode(tournamentCode: string): Promise<string[]> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return [];
    }

    try {
      const url = `${this.baseUrl}/lol/match/v5/matches/by-tournament-code/${tournamentCode}/ids`;

      this.logger.log(
        `Fetching matches for tournament code: ${tournamentCode}`,
      );

      const response = await axios.get<string[]>(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 10000,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(
          `No matches found for tournament code: ${tournamentCode}`,
        );
        return [];
      }

      this.logger.error(
        `Error fetching matches for tournament code ${tournamentCode}:`,
        error.message,
      );
      return [];
    }
  }

  /**
   * Get match timeline (detailed events) with cache + 429 retry
   */
  async getMatchTimeline(matchId: string, retries = 3): Promise<any> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return null;
    }

    // matchId는 경로 파라미터로 외부에서 주입되어 axios URL에 직접 삽입되므로,
    // Riot 매치 ID 형식(예: KR_1234567890)만 허용해 SSRF를 차단한다.
    if (!/^[A-Z0-9]{2,10}_\d+$/.test(matchId)) {
      this.logger.warn(`잘못된 matchId 형식 거부: ${matchId}`);
      return null;
    }

    // Check cache
    const cached = this.timelineCache.get(matchId);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/lol/match/v5/matches/${matchId}/timeline`;

      this.logger.log(`Fetching match timeline: ${matchId}`);

      const response = await axios.get(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 15000,
      });

      this.timelineCache.set(matchId, {
        data: response.data,
        expires: Date.now() + this.MATCH_CACHE_TTL_MS,
      });

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`Match timeline not found: ${matchId}`);
        return null;
      }

      if (error.response?.status === 429) {
        if (retries > 0) {
          await this.waitForRateLimit(error.response.headers["retry-after"]);
          return this.getMatchTimeline(matchId, retries - 1);
        }
        this.logger.error(`Rate limit exhausted for timeline ${matchId}`);
        return null;
      }

      this.logger.error(
        `Error fetching match timeline ${matchId}:`,
        error.message,
      );
      return null;
    }
  }

  /**
   * Check if match exists and is completed
   */
  async isMatchCompleted(matchId: string): Promise<boolean> {
    const match = await this.getMatchById(matchId);
    return match !== null && match.info.gameEndTimestamp > 0;
  }

  /**
   * Wait for match to be available in Riot API
   * Riot API can take a few minutes to process match data after game ends
   */
  async waitForMatchData(
    matchId: string,
    maxAttempts: number = 10,
    delayMs: number = 30000,
  ): Promise<MatchDto | null> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.log(
        `Attempt ${attempt}/${maxAttempts} to fetch match ${matchId}`,
      );

      const match = await this.getMatchById(matchId);
      if (match) {
        return match;
      }

      if (attempt < maxAttempts) {
        this.logger.log(`Waiting ${delayMs}ms before next attempt...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    this.logger.error(
      `Failed to fetch match ${matchId} after ${maxAttempts} attempts`,
    );
    return null;
  }

  /**
   * Get match IDs for a player by PUUID
   * @param puuid - Player's PUUID
   * @param start - Starting index (default: 0)
   * @param count - Number of match IDs to return (default: 20, max: 100)
   * @param queueId - Filter by queue ID (optional)
   * @param type - Filter by match type: ranked, normal, tourney, tutorial (optional)
   * @returns Array of match IDs
   */
  async getMatchIdsByPuuid(
    puuid: string,
    start: number = 0,
    count: number = 20,
    queueId?: number,
    type?: string,
    retries = 3,
    startTime?: number, // Unix seconds
    endTime?: number, // Unix seconds
    priority: RiotMatchRequestPriority = "foreground",
  ): Promise<string[]> {
    if (!this.apiKey) {
      this.logger.error("RIOT_API_KEY not configured");
      return [];
    }

    // Redis 캐시 확인 (3분 TTL)
    const cacheKey = `riot:matchids:${puuid}:${start}:${count}:${queueId ?? "all"}:${type ?? "all"}:${startTime ?? 0}:${endTime ?? 0}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    try {
      const params = new URLSearchParams({
        start: start.toString(),
        count: Math.min(count, 100).toString(), // Max 100 per request
      });

      if (queueId !== undefined) {
        params.append("queue", queueId.toString());
      }

      if (type) {
        params.append("type", type);
      }

      if (startTime !== undefined) {
        params.append("startTime", startTime.toString());
      }

      if (endTime !== undefined) {
        params.append("endTime", endTime.toString());
      }

      const url = `${this.baseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?${params}`;

      this.logger.log(`Fetching match IDs for PUUID: ${puuid}`);

      await this.waitForMatchRateLimit(priority);

      const response = await axios.get<string[]>(url, {
        headers: {
          "X-Riot-Token": this.apiKey,
        },
        timeout: 10000,
      });

      // Redis 캐시 저장 (3분)
      await this.redis.set(cacheKey, JSON.stringify(response.data), 180);

      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`No matches found for PUUID: ${puuid}`);
        return [];
      }

      if (error.response?.status === 429) {
        if (retries > 0) {
          await this.waitForRateLimit(error.response.headers["retry-after"]);
          return this.getMatchIdsByPuuid(
            puuid,
            start,
            count,
            queueId,
            type,
            retries - 1,
            startTime,
            endTime,
            priority,
          );
        }
        this.logger.error(
          `Rate limit exhausted fetching match IDs for PUUID ${puuid}`,
        );
        return [];
      }

      if (!error.response && retries > 0) {
        this.logger.warn(
          `Network error fetching match IDs, retrying (${retries} left)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getMatchIdsByPuuid(
          puuid,
          start,
          count,
          queueId,
          type,
          retries - 1,
          startTime,
          endTime,
          priority,
        );
      }

      this.logger.error(
        `Error fetching match IDs for PUUID ${puuid}:`,
        error.message,
      );
      return [];
    }
  }

  /**
   * Get detailed match history for a player
   * @param puuid - Player's PUUID
   * @param count - Number of matches to fetch (default: 20)
   * @param queueId - Filter by queue ID (optional)
   * @returns Array of detailed match data
   */
  async getMatchHistoryByPuuid(
    puuid: string,
    count: number = 20,
    queueId?: number,
    start: number = 0,
    priority: RiotMatchRequestPriority = "foreground",
  ): Promise<MatchDto[]> {
    const matchIds = await this.getMatchIdsByPuuid(
      puuid,
      start,
      count,
      queueId,
      undefined,
      3,
      undefined,
      undefined,
      priority,
    );

    if (matchIds.length === 0) {
      return [];
    }

    // getMatchById 내부 로컬 limiter가 foreground/background 예산을 분리한다.
    const matches: MatchDto[] = [];

    for (const matchId of matchIds) {
      const match = await this.getMatchById(matchId, 3, priority);
      if (match !== null) {
        matches.push(match);
      }
    }

    return matches;
  }
}
