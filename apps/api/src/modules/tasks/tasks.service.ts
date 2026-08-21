import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { DataDragonService } from "../riot/data-dragon.service";
import { RiotService } from "../riot/riot.service";
import { getPeakTierUpdate } from "../riot/riot-rank.util";
import { RedisService } from "../redis/redis.service";
import { PresenceService } from "../presence/presence.service";
import { StatsService } from "../stats/stats.service";
import { MatchDataCollectionService } from "../match/match-data-collection.service";
import { BalanceScoreService } from "../common/balance-score.service";

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  private readonly riotMatchCacheCleanupEnabled: boolean;
  private readonly riotMatchCacheTtlDays: number;
  /**
   * 배경 백필을 돌려도 되는 접속자 수 상한.
   *
   * Riot 예산은 앱 전체가 하나를 나눠 쓰므로, 사람이 붙어 있을 때 백필이
   * 예산을 먹으면 전적 검색이 429로 튕긴다. 이 수 이하일 때만 백필한다.
   */
  private readonly scanBackfillOnlineMax: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
    private readonly riotService: RiotService,
    private readonly redis: RedisService,
    private readonly statsService: StatsService,
    private readonly matchDataCollectionService: MatchDataCollectionService,
    private readonly balanceScores: BalanceScoreService,
    private readonly presence: PresenceService,
  ) {
    this.riotMatchCacheCleanupEnabled =
      this.configService.get<string>("RIOT_MATCH_CACHE_CLEANUP_ENABLED") ===
      "true";
    this.riotMatchCacheTtlDays = this.getPositiveIntConfig(
      "RIOT_MATCH_CACHE_TTL_DAYS",
      14,
    );
    // 0 을 허용해야 "아무도 없을 때만" 설정이 가능하므로 별도로 읽는다.
    const rawOnlineMax = this.configService.get<string>(
      "SCAN_BACKFILL_ONLINE_MAX",
    );
    const parsedOnlineMax = Number(rawOnlineMax);
    this.scanBackfillOnlineMax =
      rawOnlineMax !== undefined &&
      Number.isFinite(parsedOnlineMax) &&
      parsedOnlineMax >= 0
        ? Math.floor(parsedOnlineMax)
        : 2;
  }

  /** 이벤트 기반 갱신이 실패했거나 누락된 밸런스 점수를 12시간마다 복구한다. */
  @Cron("0 */12 * * *")
  async handleBalanceScoreRefresh(): Promise<void> {
    const lockKey = "tasks:balance-score-refresh";
    const lockToken = await this.redis.acquireLock(lockKey, 6 * 60 * 60 * 1000);
    if (!lockToken) return;

    try {
      const result = await this.balanceScores.refreshAllAccounts();
      this.logger.log(
        `밸런스 점수 정기 갱신: 성공 ${result.updated}건, 실패 ${result.failed}건`,
      );
    } catch (error) {
      this.logger.error("밸런스 점수 정기 갱신 실패", error);
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * 진행 중인 수동 사설방의 픽/밴을 경기 중에 캡처한다.
   *
   * 수동 사설방은 종료되면 Riot 어디에도 남지 않으므로 "경기가 켜져 있는 동안"이
   * 유일한 기회다. 이 크론은 그중 정상적으로 진행되는 경기를 담당한다.
   *
   * 방장이 결과를 즉시 입력해 IN_PROGRESS 구간이 수십 초로 끝나는 경우(실측: 2초,
   * 66초짜리 매치 존재)는 주기를 아무리 줄여도 폴링으로는 못 잡는다. 그쪽은
   * completeInternalMatchWithSnapshot()이 COMPLETED 전환 직전에 강제 조회로 막는다.
   *
   * 대상이 없으면 Riot 호출 0이라 유휴 비용이 없다.
   */
  /** Re-process completed internal matches whose Riot data was not persisted. */
  @Cron("*/15 * * * *")
  async handlePendingCustomMatchCollection(): Promise<void> {
    const lockKey = "tasks:pending-custom-match-collection";
    const lockTtlMs = 30 * 60 * 1000;
    const lockRenewIntervalMs = 5 * 60 * 1000;
    const lockToken = await this.redis.acquireLock(lockKey, lockTtlMs);

    if (!lockToken) {
      this.logger.warn(
        "Pending custom match collection skipped: another worker holds the lock",
      );
      return;
    }

    // Riot 429 Retry-After, 네트워크 재시도, 전역 rate-limit 대기로 한 사이클이
    // 예상보다 길어져도 작업 중에는 락 소유권을 유지한다. 토큰이 일치할 때만
    // 갱신되므로 만료 후 다른 워커가 획득한 락을 연장하지 않는다.
    const lockHeartbeat = setInterval(() => {
      void this.redis
        .extendLock(lockKey, lockToken, lockTtlMs)
        .then((extended) => {
          if (!extended) {
            this.logger.error(
              "Pending custom match collection lock was lost during execution",
            );
          }
        })
        .catch((error) => {
          this.logger.error(
            "Pending custom match collection lock renewal failed",
            error,
          );
        });
    }, lockRenewIntervalMs);
    lockHeartbeat.unref();

    try {
      await this.matchDataCollectionService.collectPendingMatches();
    } catch (error) {
      this.logger.error("Pending custom match collection failed", error);
    } finally {
      clearInterval(lockHeartbeat);
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  /**
   * 챔피언 시즌 통계 background 스캔 - 2분마다 소량씩.
   *
   * 전적 검색 시 큐잉된 puuid 를 우선순위/요청순으로 스캔한다.
   * 퍼스널 키 예산(앱 전체 100req/2분)을 잠식하지 않게 틱당 2건만 처리한다.
   * 매치 상세는 대부분 DB 캐시에서 나오므로 실제 Riot 호출은 이보다 훨씬 적다.
   *
   * 접속자가 적을 때는 아직 한 번도 수집되지 않은 계정을 백필 큐에 채운다.
   * 지금까지는 누군가 그 사람의 전적 화면을 열어야만 수집이 시작돼서, 라이엇을
   * 연동해 둔 계정 대부분이 라인별 전적 없이 남아 있었다(밸런스 점수의 라인
   * 차별화가 그 데이터에 기댄다). 반대로 사람이 붙어 있을 때는 백필 작업을
   * 아예 집지 않아, 전적 검색이 예산을 먼저 쓰게 한다.
   *
   * 이 크론은 `28e8aff chore: retire lab features and collectors` 에서 Lab 정리와
   * 함께 삭제됐다. 그 뒤로 큐를 비우는 주체가 없어 화면이 "수집 중"에서 멈춰 있었다.
   */
  @Cron("*/2 * * * *")
  async handleChampionSeasonScan(): Promise<void> {
    const lockKey = "tasks:champion-season-scan";
    // 한 건이 매치 100개라 Riot 전역 예산(95/2분) 안에 못 끝나는 게 정상이다.
    // 락이 크론 주기(2분)에 맞춰 만료되면 다음 틱이 진행 중인 작업을 모르고
    // 새 작업을 또 집어, scanning 이 계속 쌓이고 예산을 서로 뺏는다.
    // 작업이 도는 동안 락을 갱신해 크론을 한 번에 하나만 돌게 한다.
    const lockTtlMs = 10 * 60 * 1000;
    const lockRenewIntervalMs = 60 * 1000;
    const lockToken = await this.redis.acquireLock(lockKey, lockTtlMs);
    if (!lockToken) return;

    const lockHeartbeat = setInterval(() => {
      void this.redis
        .extendLock(lockKey, lockToken, lockTtlMs)
        .then((extended) => {
          if (!extended) {
            this.logger.error("챔피언 시즌 스캔 락을 실행 도중 잃었습니다");
          }
        })
        .catch(() => undefined);
    }, lockRenewIntervalMs);
    if (typeof lockHeartbeat.unref === "function") lockHeartbeat.unref();

    try {
      const online = this.presence.getOnlineUserCount();
      const quiet = online <= this.scanBackfillOnlineMax;

      if (quiet) {
        const queued = await this.statsService.enqueueChampionScanBackfill(4);
        if (queued > 0) {
          this.logger.log(`스캔 백필 큐잉: ${queued}건 (접속 ${online}명)`);
        }
      }

      // 붐빌 때는 배경 백필(음수 우선순위)을 건너뛴다.
      const processed = await this.statsService.processChampionScanQueue(
        2,
        quiet ? undefined : 0,
      );
      if (processed > 0) {
        this.logger.log(`챔피언 시즌 스캔 처리: ${processed}건`);
      }
    } catch (error) {
      this.logger.error("챔피언 시즌 스캔 처리 실패", error);
    } finally {
      clearInterval(lockHeartbeat);
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
}
