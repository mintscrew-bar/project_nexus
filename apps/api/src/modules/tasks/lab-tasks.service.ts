import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { LabStatsService } from "../stats/lab-stats.service";

@Injectable()
export class LabTasksService {
  private readonly logger = new Logger(LabTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly labStatsService: LabStatsService,
  ) {}

  // ─── Task 7: RiotTierRefreshTask — 매일 새벽 3시 ───

  /**
   * 활성 유저 RiotAccount 솔로랭크 티어 배치 갱신
   * 장인 시스템 D2+ 게이트가 최신 티어 기반이어야 하므로
   * LabSnapshotTask(새벽 4시) 이전에 완료
   */
  @Cron("0 3 * * *")
  async handleRiotTierRefresh(): Promise<void> {
    const lockKey = "tasks:riot-tier-refresh";
    const lockToken = await this.redis.acquireLock(lockKey, 55 * 60 * 1000);

    if (!lockToken) {
      this.logger.warn(
        "RiotTierRefreshTask 건너뜀: 다른 워커가 락을 보유 중",
      );
      return;
    }

    try {
      await this.runRiotTierRefresh();
    } catch (error) {
      this.logger.error("RiotTierRefreshTask 실패", error);
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  async runRiotTierRefresh(): Promise<{
    synced: number;
    failed: number;
    total: number;
  }> {
    const apiKey = process.env.RIOT_API_KEY;
    if (!apiKey) {
      this.logger.warn("RIOT_API_KEY 미설정 — 티어 갱신 중단");
      return { synced: 0, failed: 0, total: 0 };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 1순위: 최근 30일 내전 참가 기록이 있는 유저의 RiotAccount
    const activeUserIds = await this.prisma.$queryRaw<{ userId: string }[]>`
      SELECT DISTINCT mp."userId"
      FROM "match_participants" mp
      INNER JOIN "matches" m ON m."id" = mp."matchId"
      WHERE COALESCE(m."completedAt", m."createdAt") >= ${thirtyDaysAgo}
    `;
    const activeUserIdSet = new Set(activeUserIds.map((row) => row.userId));

    // 활성 유저의 모든 RiotAccount (당일 미갱신만)
    const priorityAccounts = await this.prisma.riotAccount.findMany({
      where: {
        userId: { in: Array.from(activeUserIdSet) },
        OR: [
          { lastSyncedAt: null },
          { lastSyncedAt: { lt: todayStart } },
        ],
      },
      select: {
        id: true,
        puuid: true,
        gameName: true,
        tagLine: true,
      },
      take: 2000,
    });

    // 2순위: 나머지 계정 (lastSyncedAt 가장 오래된 순, 남은 할당량)
    const remaining = Math.max(0, 3000 - priorityAccounts.length);
    const rollingAccounts =
      remaining > 0
        ? await this.prisma.riotAccount.findMany({
            where: {
              userId: { notIn: Array.from(activeUserIdSet) },
              OR: [
                { lastSyncedAt: null },
                { lastSyncedAt: { lt: todayStart } },
              ],
            },
            select: {
              id: true,
              puuid: true,
              gameName: true,
              tagLine: true,
            },
            orderBy: { lastSyncedAt: "asc" },
            take: remaining,
          })
        : [];

    const allAccounts = [...priorityAccounts, ...rollingAccounts];
    if (allAccounts.length === 0) {
      this.logger.log("RiotTierRefreshTask: 갱신 대상 없음");
      return { synced: 0, failed: 0, total: 0 };
    }

    this.logger.log(
      `RiotTierRefreshTask 시작: 1순위 ${priorityAccounts.length}건, 2순위 ${rollingAccounts.length}건`,
    );

    let synced = 0;
    let failed = 0;

    // 50명씩 청크로 나눠 처리 (분당 50건 안전 마진)
    const chunkSize = 50;
    for (let i = 0; i < allAccounts.length; i += chunkSize) {
      const chunk = allAccounts.slice(i, i + chunkSize);

      const results = await Promise.allSettled(
        chunk.map(async (account) => {
          const res = await fetch(
            `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
            { headers: { "X-Riot-Token": apiKey } },
          );

          if (!res.ok) {
            throw new Error(`API ${res.status}: ${account.gameName}#${account.tagLine}`);
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
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") synced++;
        else {
          failed++;
          this.logger.warn(`티어 갱신 실패: ${result.reason}`);
        }
      }

      // 청크 사이 1분 대기 (rate limit 안전 마진)
      if (i + chunkSize < allAccounts.length) {
        await new Promise((r) => setTimeout(r, 60_000));
      }
    }

    this.logger.log(
      `RiotTierRefreshTask 완료: 성공 ${synced}, 실패 ${failed}, 전체 ${allAccounts.length}`,
    );

    return { synced, failed, total: allAccounts.length };
  }

  // ─── Task 8: LabSnapshotTask — 매일 새벽 4시 ───

  /**
   * Lab 스냅샷 야간 전체 재계산
   * RiotTierRefreshTask(새벽 3시) 완료 후 1시간 뒤 실행
   */
  @Cron("0 4 * * *")
  async handleLabSnapshot(): Promise<void> {
    const lockKey = "tasks:lab-snapshot";
    const lockToken = await this.redis.acquireLock(lockKey, 55 * 60 * 1000);

    if (!lockToken) {
      this.logger.warn(
        "LabSnapshotTask 건너뜀: 다른 워커가 락을 보유 중",
      );
      return;
    }

    try {
      await this.labStatsService.recomputeAllSnapshots();
    } catch (error) {
      this.logger.error("LabSnapshotTask 실패", error);
    } finally {
      await this.redis.releaseLock(lockKey, lockToken);
    }
  }

  /** 수동 트리거용 */
  async runLabSnapshot(): Promise<{
    champions: number;
    synergies: number;
    counters: number;
  }> {
    return this.labStatsService.recomputeAllSnapshots();
  }
}
