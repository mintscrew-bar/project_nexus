import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { DataDragonService } from "../riot/data-dragon.service";
import { RiotMatchService } from "../riot/riot-match.service";
import { RedisService } from "../redis/redis.service";
import { StatsService } from "../stats/stats.service";

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

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly matchFetchConfigs: QueueGroupConfig[] = [
    {
      name: "ranked",
      queueIds: [420, 440],
      limit: 25,
      staleHours: 6,
      includeNexusUsers: true,
      fetchedAtField: "rankedFetchedAt",
      lastMatchIdField: "rankedLastMatchId",
    },
    {
      name: "normal",
      queueIds: [400, 430],
      limit: 15,
      staleHours: 12,
      includeNexusUsers: true,
      fetchedAtField: "normalFetchedAt",
      lastMatchIdField: "normalLastMatchId",
    },
    {
      name: "aram",
      queueIds: [450],
      limit: 7,
      staleHours: 24,
      includeNexusUsers: true,
      fetchedAtField: "aramFetchedAt",
      lastMatchIdField: "aramLastMatchId",
    },
    {
      name: "custom",
      queueIds: [0],
      limit: 3,
      staleHours: 24,
      includeNexusUsers: false,
      fetchedAtField: "customFetchedAt",
      lastMatchIdField: "customLastMatchId",
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
    private readonly riotMatchService: RiotMatchService,
    private readonly redis: RedisService,
    private readonly statsService: StatsService,
  ) {}

  private getSeasonStartUnixSeconds(): number {
    const now = new Date();
    return Math.floor(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0) / 1000);
  }

  private async fetchQueueMatchIdsUntilKnown(
    puuid: string,
    queueId: number,
    lastKnownMatchId?: string | null,
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
  ): Promise<{ latestMatchId: string | null; fetchedCount: number }> {
    let latestMatchId: string | null = null;
    const seen = new Set<string>();
    const orderedNewIds: string[] = [];

    for (const queueId of queueIds) {
      const ids = await this.fetchQueueMatchIdsUntilKnown(
        puuid,
        queueId,
        lastKnownMatchId,
      );

      if (!latestMatchId && ids.length > 0) {
        latestMatchId = ids[0];
      }

      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          orderedNewIds.push(id);
        }
      }
    }

    for (const matchId of orderedNewIds.reverse()) {
      await this.riotMatchService.getMatchById(matchId);
      await new Promise((resolve) => setTimeout(resolve, 150));
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

    const where: any = {
      OR: [
        { [config.fetchedAtField]: null },
        { [config.fetchedAtField]: { lt: staleBefore } },
      ],
    };

    if (!config.includeNexusUsers) {
      where.isNexusUser = false;
    }

    const candidates = await this.prisma.knownPuuid.findMany({
      where,
      orderBy: [
        { priority: "desc" },
        { [config.fetchedAtField]: "asc" },
      ] as any,
      take: config.limit,
    });

    if (candidates.length === 0) {
      return;
    }

    this.logger.log(
      `Match fetch [${config.name}] processing ${candidates.length} PUUID(s)`,
    );

    for (const candidate of candidates) {
      try {
        const lastKnownMatchId = candidate[config.lastMatchIdField];
        const result = await this.fetchMatchesForKnownPuuid(
          candidate.puuid,
          config.queueIds,
          lastKnownMatchId,
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
  @Cron("*/30 * * * *")
  async handleMatchFetch(): Promise<void> {
    const lockKey = "tasks:match-fetch";
    const lockToken = await this.redis.acquireLock(lockKey, 25 * 60 * 1000);

    if (!lockToken) {
      this.logger.warn("Match fetch skipped: another worker holds the lock");
      return;
    }

    try {
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
    const targets = queueGroup
      ? this.matchFetchConfigs.filter((config) => config.name === queueGroup)
      : this.matchFetchConfigs;

    for (const config of targets) {
      await this.processMatchFetchGroup(config);
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
            `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}?api_key=${apiKey}`,
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

          await this.prisma.riotAccount.update({
            where: { id: account.id },
            data: {
              tier: soloQ?.tier ?? "UNRANKED",
              rank: soloQ?.rank ?? "",
              lp: soloQ?.leaguePoints ?? 0,
              lastSyncedAt: new Date(),
            },
          });

          synced++;

          // Riot API rate limit: 20 req/s, 100 req/2min
          await new Promise((r) => setTimeout(r, 1500));
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
}
