import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { DiscordAdminAlertService } from "../discord/discord-admin-alert.service";
import { MAX_COLLECT_ATTEMPTS } from "../match/match-data-collection.service";

/** 같은 사유의 알림은 이 시간 안에 다시 보내지 않는다 */
const REPEAT_SUPPRESS_MS = 6 * 60 * 60_000;
/** 롤은 한두 건은 흔한 실패라 이 건수부터 알린다 */
export const LOL_STALLED_THRESHOLD = 3;
/** 배그는 진행 중 방의 오류라 한 건이어도 알린다 — 방이 멈춘다 */
export const PUBG_ERROR_THRESHOLD = 1;

export type OpsIssue = {
  kind: "LOL_STALLED" | "PUBG_ERROR";
  count: number;
  summary: string;
};

/** 세어 온 건수에서 보낼 알림을 정한다 (순수 함수) */
export function decideOpsIssues(counts: {
  lolStalled: number;
  pubgErrors: number;
}): OpsIssue[] {
  const issues: OpsIssue[] = [];
  if (counts.lolStalled >= LOL_STALLED_THRESHOLD) {
    issues.push({
      kind: "LOL_STALLED",
      count: counts.lolStalled,
      summary: `Riot 전적 수집을 ${MAX_COLLECT_ATTEMPTS}회 시도하고 포기한 내전이 ${counts.lolStalled}건 있습니다. Riot 쪽 문제가 풀렸다면 관리자 > 내전 기록에서 수집 재시도를 누르세요.`,
    });
  }
  if (counts.pubgErrors >= PUBG_ERROR_THRESHOLD) {
    issues.push({
      kind: "PUBG_ERROR",
      count: counts.pubgErrors,
      summary: `진행 중인 스크림 ${counts.pubgErrors}건에서 자동 수집 오류가 났습니다. 관리자 > 스크림 기록에서 확인하세요.`,
    });
  }
  return issues;
}

/**
 * 운영 알림 — 수집이 막힌 걸 운영자가 대시보드를 열기 전에 알린다.
 *
 * 신고 접수는 이미 접수 즉시 알림이 간다(`notifyReportSubmitted`). 여기서는 사람이
 * 신호를 못 주는 것, 즉 **조용히 멈춘 수집**만 다룬다. 같은 사유는 6시간에 한 번만
 * 보내 알림이 쌓이지 않게 한다. 알림 실패는 로그만 남긴다.
 */
@Injectable()
export class AdminOpsAlertService {
  private readonly logger = new Logger(AdminOpsAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly alerts: DiscordAdminAlertService,
  ) {}

  @Cron("5 * * * *")
  async handleHourly() {
    try {
      await this.check();
    } catch (error) {
      this.logger.error("운영 알림 점검 실패", error);
    }
  }

  async check() {
    const [lolStalled, pubgErrors] = await Promise.all([
      this.prisma.match.count({
        where: {
          isInternal: true,
          status: "COMPLETED",
          dataCollected: false,
          collectAttempts: { gte: MAX_COLLECT_ATTEMPTS },
          // 수집이 원천적으로 불가능한 경기(코드 없는 사설방)는 재시도해도 소용없어 뺀다.
          OR: [
            { tournamentCode: { not: null } },
            { riotMatchId: { not: null } },
          ],
        },
      }),
      this.prisma.scrim.count({
        where: { status: "IN_PROGRESS", collectionError: { not: null } },
      }),
    ]);

    const sent: OpsIssue[] = [];
    for (const issue of decideOpsIssues({ lolStalled, pubgErrors })) {
      // 락을 풀지 않고 TTL 로 두면 "6시간에 한 번" 문이 된다.
      const gate = await this.redis.acquireLock(
        `admin:ops-alert:${issue.kind}`,
        REPEAT_SUPPRESS_MS,
      );
      if (!gate) continue;

      const ok = await this.alerts.notifyCollectionIssue(issue);
      if (ok) sent.push(issue);
      else {
        // 못 보냈으면 다음 점검에서 다시 시도하도록 문을 연다.
        await this.redis.releaseLock(`admin:ops-alert:${issue.kind}`, gate);
      }
    }
    return { lolStalled, pubgErrors, sent: sent.map((i) => i.kind) };
  }
}
