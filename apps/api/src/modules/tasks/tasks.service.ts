import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 임시 밴 자동 해제 - 매 5분마다 실행
   * banUntil이 현재 시간보다 이전인 유저의 밴을 해제한다.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAutoUnban(): Promise<void> {
    try {
      const result = await this.prisma.user.updateMany({
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

      if (result.count > 0) {
        this.logger.log(`Auto-unbanned ${result.count} user(s)`);
      }
    } catch (error) {
      this.logger.error("Auto-unban task failed", error);
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
          OR: [
            { lastSyncedAt: null },
            { lastSyncedAt: { lt: sixHoursAgo } },
          ],
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

          if (!res.ok) continue;

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
        this.logger.log(`Tier sync complete: ${synced}/${staleAccounts.length}`);
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
        this.logger.log(`Cleaned up ${result.count} expired session(s)`);
      }
    } catch (error) {
      this.logger.error("Session cleanup task failed", error);
    }
  }
}
