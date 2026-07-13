import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { DataDragonService } from "../riot/data-dragon.service";
import { RiotMatchService } from "../riot/riot-match.service";
import { RiotService } from "../riot/riot.service";
import { getPeakTierUpdate } from "../riot/riot-rank.util";
import { RedisService } from "../redis/redis.service";
import { StatsService } from "../stats/stats.service";
import { MatchDataCollectionService } from "../match/match-data-collection.service";

type QueueGroupConfig = {
  name: "ranked" | "normal" | "aram" | "custom";
  queueIds: number[];
  limit: number;
  staleHours: number;
  includeNexusUsers: boolean;
  fetchedAtField:
    | "rankedFetchedAt"
    | "normalFetchedAt"
    | "aramFetchedAt"
    | "customFetchedAt";
  lastMatchIdField:
    | "rankedLastMatchId"
    | "normalLastMatchId"
    | "aramLastMatchId"
    | "customLastMatchId";
};

export type MatchFetchQueueGroup = QueueGroupConfig["name"];

type HighTierSeedingResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  challengerCount: number;
  grandmasterCount: number;
  targetCount: number;
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  missingPuuidCount: number;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly seededHighTierPriority = 7;
  private readonly rankedSeededSlotCap: number;
  private readonly rankedSeededStaleHours: number;
  private readonly rankedSeededInitialBackfillLimit: number;
  private readonly riotMatchCacheCleanupEnabled: boolean;
  private readonly riotMatchCacheTtlDays: number;
  private readonly matchFetchEnabled: boolean;
  private readonly matchFetchConfigs: QueueGroupConfig[];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
    private readonly riotService: RiotService,
    private readonly riotMatchService: RiotMatchService,
    private readonly redis: RedisService,
    private readonly statsService: StatsService,
    private readonly matchDataCollectionService: MatchDataCollectionService,
  ) {
    this.rankedSeededSlotCap = this.getPositiveIntConfig(
      "MATCH_FETCH_RANKED_SEEDED_SLOT_CAP",
      15,
    );
    this.rankedSeededStaleHours = this.getPositiveIntConfig(
      "MATCH_FETCH_RANKED_SEEDED_STALE_HOURS",
      72,
    );
    this.rankedSeededInitialBackfillLimit = this.getPositiveIntConfig(
      "MATCH_FETCH_RANKED_SEEDED_INITIAL_BACKFILL_LIMIT",
      25,
    );
    this.riotMatchCacheCleanupEnabled =
      this.configService.get<string>("RIOT_MATCH_CACHE_CLEANUP_ENABLED") ===
      "true";
    this.riotMatchCacheTtlDays = this.getPositiveIntConfig(
      "RIOT_MATCH_CACHE_TTL_DAYS",
      14,
    );
    // 대량 매치 ingest는 Lab 보류로 소비자가 사라져 기본 비활성.
    // 퍼스널 키 예산을 전적 검색·챔피언 시즌 스캔에 몰아주기 위함.
    // 되살리려면 MATCH_FETCH_ENABLED=true.
    this.matchFetchEnabled =
      this.configService.get<string>("MATCH_FETCH_ENABLED") === "true";
    this.matchFetchConfigs = [
      {
        name: "ranked",
        queueIds: [420, 440],
        limit: this.getPositiveIntConfig("MATCH_FETCH_RANKED_LIMIT", 5),
        staleHours: this.getPositiveIntConfig(
          "MATCH_FETCH_RANKED_STALE_HOURS",
          6,
        ),
        includeNexusUsers: true,
        fetchedAtField: "rankedFetchedAt",
        lastMatchIdField: "rankedLastMatchId",
      },
      {
        name: "normal",
        queueIds: [400, 430],
        limit: this.getPositiveIntConfig("MATCH_FETCH_NORMAL_LIMIT", 3),
        staleHours: this.getPositiveIntConfig(
          "MATCH_FETCH_NORMAL_STALE_HOURS",
          12,
        ),
        includeNexusUsers: true,
        fetchedAtField: "normalFetchedAt",
        lastMatchIdField: "normalLastMatchId",
      },
      {
        name: "aram",
        queueIds: [450],
        limit: this.getPositiveIntConfig("MATCH_FETCH_ARAM_LIMIT", 2),
        staleHours: this.getPositiveIntConfig(
          "MATCH_FETCH_ARAM_STALE_HOURS",
          24,
        ),
        includeNexusUsers: true,
        fetchedAtField: "aramFetchedAt",
        lastMatchIdField: "aramLastMatchId",
      },
      {
        name: "custom",
        queueIds: [0],
        limit: this.getPositiveIntConfig("MATCH_FETCH_CUSTOM_LIMIT", 1),
        staleHours: this.getPositiveIntConfig(
          "MATCH_FETCH_CUSTOM_STALE_HOURS",
          24,
        ),
        includeNexusUsers: false,
        fetchedAtField: "customFetchedAt",
        lastMatchIdField: "customLastMatchId",
      },
    ];
  }

  /** Re-process completed internal matches whose Riot data was not persisted. */
  @Cron("*/15 * * * *")
  async handlePendingCustomMatchCollection(): Promise<void> {
    const lockKey = "tasks:pending-custom-match-collection";
    // 락 TTL은 크론 주기(15분)보다 길어야 한다.
    // 최대 20경기 × (경기당 3초 지연 + Riot API 호출/레이트리밋 대기)이므로
    // 한 사이클이 15분을 넘길 수 있는데, TTL이 더 짧으면 작업이 아직 도는 중에
    // 락이 먼저 풀려 다음 크론이 겹쳐 들어온다.
    // 정상 종료 시에는 finally에서 즉시 해제하므로, TTL은 프로세스가 죽었을 때를
    // 대비한 안전망 역할만 한다.
    const lockToken = await this.redis.acquireLock(lockKey, 30 * 60 * 1000);

    if (!lockToken) {
      this.logger.warn(
        "Pending custom match collection skipped: another worker holds the lock",
      );
      return;
    }

    try {
      await this.matchDataCollectionService.collectPendingMatches();
    } catch (error) {
      this.logger.error("Pending custom match collection failed", error);
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
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

  private async upsertHighTierSeededPuuid(
    puuid: string,
  ): Promise<"inserted" | "updated"> {
    const rows = await this.prisma.$queryRaw<Array<{ inserted: boolean }>>`
      INSERT INTO "known_puuids" ("puuid", "priority", "isNexusUser", "createdAt", "updatedAt")
      VALUES (${puuid}, ${this.seededHighTierPriority}, false, NOW(), NOW())
      ON CONFLICT ("puuid") DO UPDATE
      SET "priority" = GREATEST("known_puuids"."priority", EXCLUDED."priority"),
          "updatedAt" = NOW()
      RETURNING ("xmax" = 0) AS inserted
    `;

    return rows[0]?.inserted ? "inserted" : "updated";
  }

  private async runHighTierSeedingInternal(): Promise<HighTierSeedingResult> {
    const highTier = await this.riotService.getHighTierSoloQueuePuuids();
    const uniquePuuids = [...new Set(highTier.puuids)];

    let insertedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const puuid of uniquePuuids) {
      try {
        const upserted = await this.upsertHighTierSeededPuuid(puuid);
        if (upserted === "inserted") {
          insertedCount += 1;
        } else {
          updatedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        this.logger.warn(`High-tier seeding failed for ${puuid}: ${error}`);
      }
    }

    const result: HighTierSeedingResult = {
      ok: true,
      skipped: false,
      challengerCount: highTier.challengerCount,
      grandmasterCount: highTier.grandmasterCount,
      targetCount: uniquePuuids.length,
      insertedCount,
      updatedCount,
      failedCount,
      missingPuuidCount: highTier.missingPuuidCount,
    };

    this.logger.log(
      `High-tier seeding completed: challenger=${result.challengerCount}, grandmaster=${result.grandmasterCount}, target=${result.targetCount}, inserted=${result.insertedCount}, updated=${result.updatedCount}, failed=${result.failedCount}, missingPuuid=${result.missingPuuidCount}`,
    );

    return result;
  }

  async runHighTierSeeding(): Promise<HighTierSeedingResult> {
    const lockKey = "tasks:high-tier-seeding";
    const lockToken = await this.redis.acquireLock(lockKey, 20 * 60 * 1000);

    if (!lockToken) {
      return {
        ok: false,
        skipped: true,
        reason: "another worker holds the lock",
        challengerCount: 0,
        grandmasterCount: 0,
        targetCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        failedCount: 0,
        missingPuuidCount: 0,
      };
    }

    try {
      return await this.runHighTierSeedingInternal();
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  private getSeasonStartUnixSeconds(): number {
    const now = new Date();
    return Math.floor(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0) / 1000);
  }

  private async fetchQueueMatchIdsUntilKnown(
    puuid: string,
    queueId: number,
    lastKnownMatchId?: string | null,
    maxNewIds?: number,
  ): Promise<string[]> {
    const newIds: string[] = [];
    let start = 0;
    const count = 100;
    const seasonStart = this.getSeasonStartUnixSeconds();

    while (true) {
      const ids = await this.riotMatchService.getMatchIdsByPuuid(
        puuid,
        start,
        count,
        queueId,
        undefined,
        3,
        seasonStart,
        undefined,
        "background",
      );

      if (ids.length === 0) {
        break;
      }

      let shouldStop = false;
      for (const id of ids) {
        if (lastKnownMatchId && id === lastKnownMatchId) {
          shouldStop = true;
          break;
        }
        newIds.push(id);
        if (maxNewIds !== undefined && newIds.length >= maxNewIds) {
          shouldStop = true;
          break;
        }
      }

      if (shouldStop || ids.length < count) {
        break;
      }

      start += count;
    }

    return newIds;
  }

  private async fetchMatchesForKnownPuuid(
    puuid: string,
    queueIds: number[],
    lastKnownMatchId?: string | null,
    maxBackfillMatchIds?: number,
  ): Promise<{ latestMatchId: string | null; fetchedCount: number }> {
    let latestMatchId: string | null = null;
    const seen = new Set<string>();
    const orderedNewIds: string[] = [];

    for (const queueId of queueIds) {
      const remainingBudget =
        maxBackfillMatchIds !== undefined
          ? Math.max(0, maxBackfillMatchIds - orderedNewIds.length)
          : undefined;
      if (remainingBudget === 0) {
        break;
      }

      const ids = await this.fetchQueueMatchIdsUntilKnown(
        puuid,
        queueId,
        lastKnownMatchId,
        remainingBudget,
      );

      if (!latestMatchId && ids.length > 0) {
        latestMatchId = ids[0];
      }

      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          orderedNewIds.push(id);
          if (
            maxBackfillMatchIds !== undefined &&
            orderedNewIds.length >= maxBackfillMatchIds
          ) {
            break;
          }
        }
      }

      if (
        maxBackfillMatchIds !== undefined &&
        orderedNewIds.length >= maxBackfillMatchIds
      ) {
        break;
      }
    }

    for (const matchId of orderedNewIds.reverse()) {
      await this.riotMatchService.getMatchById(matchId, 3, "background");
    }

    return {
      latestMatchId,
      fetchedCount: orderedNewIds.length,
    };
  }

  private async processMatchFetchGroup(
    config: QueueGroupConfig,
  ): Promise<void> {
    const staleBefore = new Date(
      Date.now() - config.staleHours * 60 * 60 * 1000,
    );

    const staleCondition: any = {
      OR: [
        { [config.fetchedAtField]: null },
        { [config.fetchedAtField]: { lt: staleBefore } },
      ],
    };

    const baseWhere: any = { ...staleCondition };
    if (!config.includeNexusUsers) {
      baseWhere.isNexusUser = false;
    }

    let candidates: Array<{
      puuid: string;
      isNexusUser: boolean;
      priority: number;
      [key: string]: any;
    }> = [];

    if (config.name === "ranked") {
      const seededStaleBefore = new Date(
        Date.now() - this.rankedSeededStaleHours * 60 * 60 * 1000,
      );

      const nonSeededCandidates = await this.prisma.knownPuuid.findMany({
        where: {
          ...baseWhere,
          NOT: {
            isNexusUser: false,
            priority: this.seededHighTierPriority,
          },
        },
        orderBy: [
          { priority: "desc" },
          { [config.fetchedAtField]: "asc" },
        ] as any,
        take: config.limit,
      });

      const seededCandidates = await this.prisma.knownPuuid.findMany({
        where: {
          isNexusUser: false,
          priority: this.seededHighTierPriority,
          OR: [
            { [config.fetchedAtField]: null },
            { [config.fetchedAtField]: { lt: seededStaleBefore } },
          ],
        } as any,
        orderBy: [
          { priority: "desc" },
          { [config.fetchedAtField]: "asc" },
        ] as any,
        take: this.rankedSeededSlotCap,
      });

      const selectedNonSeeded = nonSeededCandidates.slice(0, config.limit);
      const remaining = Math.max(0, config.limit - selectedNonSeeded.length);
      const seededTake = Math.min(remaining, this.rankedSeededSlotCap);
      const selectedSeeded = seededCandidates.slice(0, seededTake);
      candidates = [...selectedNonSeeded, ...selectedSeeded];

      this.logger.log(
        `Match fetch [${config.name}] slots: total=${candidates.length}, nexus=${candidates.filter((candidate) => candidate.isNexusUser).length}, seeded=${selectedSeeded.length}`,
      );
    } else {
      candidates = await this.prisma.knownPuuid.findMany({
        where: baseWhere,
        orderBy: [
          { priority: "desc" },
          { [config.fetchedAtField]: "asc" },
        ] as any,
        take: config.limit,
      });
    }

    if (candidates.length === 0) {
      return;
    }

    this.logger.log(
      `Match fetch [${config.name}] processing ${candidates.length} PUUID(s)`,
    );

    for (const candidate of candidates) {
      try {
        const lastKnownMatchId = candidate[config.lastMatchIdField];
        const isRankedSeededCandidate =
          config.name === "ranked" &&
          !candidate.isNexusUser &&
          candidate.priority === this.seededHighTierPriority;
        const maxBackfillMatchIds =
          isRankedSeededCandidate && !lastKnownMatchId
            ? this.rankedSeededInitialBackfillLimit
            : undefined;
        const result = await this.fetchMatchesForKnownPuuid(
          candidate.puuid,
          config.queueIds,
          lastKnownMatchId,
          maxBackfillMatchIds,
        );

        const nextLastMatchId =
          result.latestMatchId ?? lastKnownMatchId ?? null;

        await this.prisma.knownPuuid.update({
          where: { puuid: candidate.puuid },
          data: {
            [config.fetchedAtField]: new Date(),
            [config.lastMatchIdField]: nextLastMatchId,
          } as any,
        });

        this.logger.log(
          `Match fetch [${config.name}] ${candidate.puuid}: ${result.fetchedCount} new match(es)`,
        );
        if (maxBackfillMatchIds !== undefined) {
          this.logger.log(
            `Match fetch [${config.name}] ${candidate.puuid}: initial seeded backfill capped at ${maxBackfillMatchIds}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Match fetch [${config.name}] failed for ${candidate.puuid}: ${error}`,
        );
      }
    }
  }

  /**
   * KnownPuuid 기반 Riot 매치 사전 수집 — 30분마다 실행
   */
  private async seedKnownPuuidsFromLinkedRiotAccounts(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ puuid: string }>>`
      INSERT INTO "known_puuids" (
        "puuid",
        "gameName",
        "tagLine",
        "priority",
        "isNexusUser",
        "createdAt",
        "updatedAt"
      )
      SELECT
        ra."puuid",
        ra."gameName",
        ra."tagLine",
        10,
        true,
        NOW(),
        NOW()
      FROM "riot_accounts" ra
      WHERE ra."puuid" IS NOT NULL
        AND ra."puuid" <> ''
        -- admin 테스트 봇 제외: 가짜 puuid(bot_puuid_*)·tagLine 'BOT'은
        -- Riot match-v5에서 400만 유발하므로 ingest 대상에서 원천 차단.
        AND ra."puuid" NOT LIKE 'bot_puuid_%'
        AND ra."tagLine" IS DISTINCT FROM 'BOT'
      ON CONFLICT ("puuid") DO UPDATE
      SET
        "gameName" = COALESCE(EXCLUDED."gameName", "known_puuids"."gameName"),
        "tagLine" = COALESCE(EXCLUDED."tagLine", "known_puuids"."tagLine"),
        "priority" = GREATEST("known_puuids"."priority", EXCLUDED."priority"),
        "isNexusUser" = true,
        "updatedAt" = NOW()
      RETURNING "puuid"
    `;

    if (rows.length > 0) {
      this.logger.log(
        `KnownPuuid linked account seed upserted ${rows.length} row(s)`,
      );
    }

    return rows.length;
  }

  @Cron("*/30 * * * *")
  async handleMatchFetch(): Promise<void> {
    // Lab 보류로 대량 ingest 비활성 (기본). 예산은 전적 검색·챔피언 스캔에 할당.
    if (!this.matchFetchEnabled) {
      return;
    }

    const lockKey = "tasks:match-fetch";
    const lockToken = await this.redis.acquireLock(lockKey, 25 * 60 * 1000);

    if (!lockToken) {
      this.logger.warn("Match fetch skipped: another worker holds the lock");
      return;
    }

    try {
      await this.seedKnownPuuidsFromLinkedRiotAccounts();
      for (const config of this.matchFetchConfigs) {
        await this.processMatchFetchGroup(config);
      }
    } catch (error) {
      this.logger.error("Match fetch task failed", error);
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  async runMatchFetch(queueGroup?: MatchFetchQueueGroup): Promise<void> {
    await this.seedKnownPuuidsFromLinkedRiotAccounts();

    const targets = queueGroup
      ? this.matchFetchConfigs.filter((config) => config.name === queueGroup)
      : this.matchFetchConfigs;

    for (const config of targets) {
      await this.processMatchFetchGroup(config);
    }
  }

  /**
   * KR 챌린저 + 그마 PUUID 시딩 — 3일마다 새벽 5시 실행
   */
  @Cron("0 5 */3 * *")
  async handleHighTierSeeding(): Promise<void> {
    // 시딩은 대량 ingest 파이프라인 전용 — ingest 비활성 시 무의미하므로 동반 중단.
    if (!this.matchFetchEnabled) {
      return;
    }

    try {
      const result = await this.runHighTierSeeding();
      if (result.skipped) {
        this.logger.warn(
          `High-tier seeding skipped: ${result.reason ?? "lock not acquired"}`,
        );
      }
    } catch (error) {
      this.logger.error("High-tier seeding task failed", error);
    }
  }

  /**
   * StatsRecomputeQueue 기반 개인 통계 캐시 재계산 — 매 정시 실행
   */
  @Cron("0 * * * *")
  async handleMatchStatsCompute(): Promise<void> {
    const lockKey = "tasks:match-stats-compute";
    const lockToken = await this.redis.acquireLock(lockKey, 55 * 60 * 1000);

    if (!lockToken) {
      this.logger.warn(
        "Match stats compute skipped: another worker holds the lock",
      );
      return;
    }

    try {
      const queuedUsers = await this.prisma.statsRecomputeQueue.findMany({
        orderBy: [{ queuedAt: "asc" }],
        take: 100,
      });

      if (queuedUsers.length === 0) {
        return;
      }

      this.logger.log(
        `Match stats compute processing ${queuedUsers.length} user(s)`,
      );

      for (const queued of queuedUsers) {
        try {
          await this.statsService.recomputeChampionStatsForUser(queued.userId);
        } catch (error) {
          this.logger.warn(
            `Match stats compute failed for ${queued.userId}: ${error}`,
          );
        }
      }
    } catch (error) {
      this.logger.error("Match stats compute task failed", error);
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  async runMatchStatsCompute(userId?: string): Promise<void> {
    if (userId) {
      await this.statsService.recomputeChampionStatsForUser(userId);
      return;
    }

    const queuedUsers = await this.prisma.statsRecomputeQueue.findMany({
      orderBy: [{ queuedAt: "asc" }],
      take: 100,
    });

    for (const queued of queuedUsers) {
      await this.statsService.recomputeChampionStatsForUser(queued.userId);
    }
  }

  async runKnownPuuidCleanup(): Promise<{
    demotedCount: number;
    deletedCount: number;
  }> {
    const demoteBefore = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const deleteBefore = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const [demoted, deleted] = await this.prisma.$transaction([
      this.prisma.knownPuuid.updateMany({
        where: {
          priority: { gte: 5, lte: 9 },
          updatedAt: { lt: demoteBefore },
        },
        data: {
          priority: 0,
        },
      }),
      this.prisma.knownPuuid.deleteMany({
        where: {
          priority: { gte: 0, lte: 4 },
          updatedAt: { lt: deleteBefore },
        },
      }),
    ]);

    return {
      demotedCount: demoted.count,
      deletedCount: deleted.count,
    };
  }

  async runRiotMatchCacheCleanup(): Promise<{
    deletedCount: number;
    cutoff: Date;
    enabled: boolean;
  }> {
    const cutoff = new Date(
      Date.now() - this.riotMatchCacheTtlDays * 24 * 60 * 60 * 1000,
    );

    if (!this.riotMatchCacheCleanupEnabled) {
      return { deletedCount: 0, cutoff, enabled: false };
    }

    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "riot_match_cache" rmc
      WHERE rmc."gameEnd" < ${cutoff}
        AND EXISTS (
          SELECT 1
          FROM "matches" m
          WHERE m."riotMatchId" = rmc."matchId"
        )
    `;

    return { deletedCount: Number(deleted), cutoff, enabled: true };
  }

  /**
   * Riot raw match cache TTL cleanup - 매일 새벽 2시 20분.
   * 정형 MatchParticipant 인제스트가 완료된 row만 삭제 (EXISTS 조건).
   * RIOT_MATCH_CACHE_CLEANUP_ENABLED=true 로 활성화.
   */
  @Cron("20 2 * * *")
  async handleRiotMatchCacheCleanup(): Promise<void> {
    try {
      const result = await this.runRiotMatchCacheCleanup();
      if (!result.enabled) return;
      if (result.deletedCount > 0) {
        this.logger.log(
          `RiotMatchCache TTL 정리: ${result.deletedCount}건 삭제 (cutoff=${result.cutoff.toISOString()})`,
        );
      }
    } catch (error) {
      this.logger.error("RiotMatchCache TTL 정리 실패", error);
    }
  }

  /**
   * KnownPuuid 미활동 정리 - 매월 1일 새벽 2시
   * priority 5~9는 180일 미활동 시 0으로 강등, 0~4는 365일 미활동 시 삭제
   */
  @Cron("0 2 1 * *")
  async handleKnownPuuidCleanup(): Promise<void> {
    try {
      const result = await this.runKnownPuuidCleanup();

      if (result.demotedCount > 0 || result.deletedCount > 0) {
        this.logger.log(
          `KnownPuuid 정리 완료: 강등 ${result.demotedCount}건, 삭제 ${result.deletedCount}건`,
        );
      }
    } catch (error) {
      this.logger.error("KnownPuuid 정리 작업 실패", error);
    }
  }

  /**
   * DDragon 최신 버전 동기화 — 매주 월요일 새벽 4시
   * 롤 패치는 2주 단위 수요일에 배포되므로 주 1회 갱신으로 충분
   * Redis 캐시를 무효화한 뒤 재조회하여 최신 버전을 갱신한다
   */
  @Cron("0 4 * * 1")
  async handleDdragonVersionSync(): Promise<void> {
    try {
      // TTL 만료를 기다리지 않고 강제 갱신
      await this.dataDragon.invalidateVersionCache();
      const version = await this.dataDragon.getLatestVersion();
      this.logger.log(`DDragon 버전 동기화 완료: ${version}`);
    } catch (error) {
      this.logger.error("DDragon 버전 동기화 실패", error);
    }
  }

  /**
   * 임시 밴 및 임시 제한 자동 해제 - 매 5분마다 실행
   * banUntil / restrictedUntil이 현재 시간보다 이전인 유저를 자동 해제한다.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAutoUnban(): Promise<void> {
    try {
      // 임시 밴 자동 해제 (banUntil이 설정된 경우만)
      const banResult = await this.prisma.user.updateMany({
        where: {
          isBanned: true,
          banUntil: {
            not: null,
            lte: new Date(),
          },
        },
        data: {
          isBanned: false,
          banReason: null,
          bannedAt: null,
          banUntil: null,
        },
      });

      if (banResult.count > 0) {
        this.logger.log(`임시 밴 자동 해제: ${banResult.count}명`);
      }

      // 임시 제한(isRestricted) 자동 해제 - 신고 누적 시 24시간 임시 제한 해제
      const restrictResult = await this.prisma.user.updateMany({
        where: {
          isRestricted: true,
          restrictedUntil: {
            not: null,
            lte: new Date(),
          },
        },
        data: {
          isRestricted: false,
          restrictedUntil: null,
        },
      });

      if (restrictResult.count > 0) {
        this.logger.log(`임시 제한 자동 해제: ${restrictResult.count}명`);
      }
    } catch (error) {
      this.logger.error("자동 밴/제한 해제 작업 실패", error);
    }
  }

  /**
   * Riot 계정 티어 동기화 - 매시간 실행
   * 최근 6시간 이상 동기화하지 않은 인증된 계정만 대상
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleTierSync(): Promise<void> {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    try {
      const staleAccounts = await this.prisma.riotAccount.findMany({
        where: {
          verifiedAt: { not: null },
          OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: sixHoursAgo } }],
        },
        select: {
          id: true,
          puuid: true,
          gameName: true,
          tagLine: true,
          peakTier: true,
          peakRank: true,
        },
        take: 50,
      });

      if (staleAccounts.length === 0) return;

      this.logger.log(
        `Tier sync: processing ${staleAccounts.length} account(s)`,
      );

      let synced = 0;

      for (const account of staleAccounts) {
        try {
          const apiKey = process.env.RIOT_API_KEY;
          if (!apiKey) break;

          const res = await fetch(
            `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
            { headers: { "X-Riot-Token": apiKey } },
          );

          if (!res.ok) {
            this.logger.warn(
              `Riot API error for account ${account.id} (puuid: ${account.puuid}): ${res.status} ${res.statusText}`,
            );
            continue;
          }

          const entries: any[] = await res.json();
          const soloQ = entries.find(
            (e: any) => e.queueType === "RANKED_SOLO_5x5",
          );
          const tier = soloQ?.tier ?? "UNRANKED";
          const rank = soloQ?.rank ?? "";

          await this.prisma.riotAccount.update({
            where: { id: account.id },
            data: {
              tier,
              rank,
              lp: soloQ?.leaguePoints ?? 0,
              ...getPeakTierUpdate(
                tier,
                rank,
                account.peakTier,
                account.peakRank,
              ),
              lastSyncedAt: new Date(),
            },
          });

          synced++;

          // entries/by-puuid → HIGH 그룹: 20,000 req/10s — 딜레이 불필요
          await new Promise((r) => setTimeout(r, 50));
        } catch {
          this.logger.warn(
            `Failed to sync account ${account.gameName}#${account.tagLine}`,
          );
        }
      }

      if (synced > 0) {
        this.logger.log(
          `Tier sync complete: ${synced}/${staleAccounts.length}`,
        );
      }
    } catch (error) {
      this.logger.error("Tier sync task failed", error);
    }
  }

  /**
   * 만료된 세션 정리 - 매일 새벽 3시
   */
  @Cron("0 3 * * *")
  async handleExpiredSessions(): Promise<void> {
    try {
      const result = await this.prisma.session.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });

      if (result.count > 0) {
        this.logger.log(`만료 세션 정리: ${result.count}건`);
      }
    } catch (error) {
      this.logger.error("세션 정리 작업 실패", error);
    }
  }

  /**
   * DM 90일 만료 삭제 - 매일 새벽 3시 10분
   * 개인정보처리방침 보관기간 준수: DM은 최대 90일 보관
   */
  @Cron("10 3 * * *")
  async handleExpiredDirectMessages(): Promise<void> {
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const result = await this.prisma.directMessage.deleteMany({
        where: {
          createdAt: { lt: ninetyDaysAgo },
        },
      });

      if (result.count > 0) {
        this.logger.log(`DM 만료 삭제: ${result.count}건 (90일 초과)`);
      }
    } catch (error) {
      this.logger.error("DM 만료 삭제 실패", error);
    }
  }

  /**
   * 채팅 로그 1년 만료 삭제 - 매일 새벽 3시 20분
   * 개인정보처리방침 보관기간 준수: 방 채팅 및 클랜 채팅 최대 1년 보관
   * 참고: ClanChatMessage 삭제 시 UserReport.clanChatMessageId는 SetNull (스키마 설정)
   */
  @Cron("20 3 * * *")
  async handleExpiredChatLogs(): Promise<void> {
    try {
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      const [roomResult, clanResult] = await Promise.all([
        this.prisma.chatMessage.deleteMany({
          where: { createdAt: { lt: oneYearAgo } },
        }),
        this.prisma.clanChatMessage.deleteMany({
          where: { createdAt: { lt: oneYearAgo } },
        }),
      ]);

      const total = roomResult.count + clanResult.count;
      if (total > 0) {
        this.logger.log(
          `채팅 로그 만료 삭제: 방채팅 ${roomResult.count}건, 클랜채팅 ${clanResult.count}건 (1년 초과)`,
        );
      }
    } catch (error) {
      this.logger.error("채팅 로그 만료 삭제 실패", error);
    }
  }

  /**
   * 신고 기록 3년 만료 삭제 - 매일 새벽 3시 30분
   * 개인정보처리방침 보관기간 준수: 신고 기록 최대 3년 보관
   * PENDING 상태(미처리)는 삭제하지 않고 APPROVED/REJECTED만 삭제
   */
  @Cron("30 3 * * *")
  async handleExpiredReports(): Promise<void> {
    try {
      const threeYearsAgo = new Date(
        Date.now() - 3 * 365 * 24 * 60 * 60 * 1000,
      );

      const [userResult, postResult] = await Promise.all([
        this.prisma.userReport.deleteMany({
          where: {
            createdAt: { lt: threeYearsAgo },
            status: { in: ["APPROVED", "REJECTED"] },
          },
        }),
        this.prisma.postReport.deleteMany({
          where: {
            createdAt: { lt: threeYearsAgo },
            status: { in: ["APPROVED", "REJECTED"] },
          },
        }),
      ]);

      const total = userResult.count + postResult.count;
      if (total > 0) {
        this.logger.log(
          `신고 기록 만료 삭제: 유저신고 ${userResult.count}건, 게시글신고 ${postResult.count}건 (3년 초과)`,
        );
      }
    } catch (error) {
      this.logger.error("신고 기록 만료 삭제 실패", error);
    }
  }

  /**
   * 챔피언 시즌 통계 background 스캔 처리 - 2분마다 소량씩
   * 전적 검색 시 큐잉된 puuid를 우선순위/요청순으로 스캔.
   * 퍼스널 키 예산을 잠식하지 않게 틱당 2건만 처리(매치는 대부분 DB 캐시 히트).
   */
  @Cron("*/2 * * * *")
  async handleChampionSeasonScan(): Promise<void> {
    try {
      const processed = await this.statsService.processChampionScanQueue(2);
      if (processed > 0) {
        this.logger.log(`챔피언 시즌 스캔 처리: ${processed}건`);
      }
    } catch (error) {
      this.logger.error("챔피언 시즌 스캔 처리 실패", error);
    }
  }
}
