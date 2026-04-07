import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { DataDragonService } from "../riot/data-dragon.service";

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataDragon: DataDragonService,
  ) {}

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
