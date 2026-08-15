import { Injectable, Logger } from "@nestjs/common";
import { Prisma, Role } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import {
  BALANCE_ROLES,
  BALANCE_SCORE_VERSION,
  calculatePlayerBalanceScores,
} from "./balance-score.util";

/** 라인별 점수 맵 ({ TOP: 24.4, ... }) */
export type BalanceScoreMap = Record<Role, number>;

/**
 * 자동 밸런스 점수 캐시를 관리한다.
 *
 * 점수 계산 자체는 싸다(40명에 1ms). 비싼 건 입력을 모으는 쪽이다 —
 * 현재 티어·최고 티어·라인 티어·솔랭 전적에 더해 내전 전적(NexusRanking,
 * NexusRoleRecord)까지 필요해서, 방을 조회할 때마다 조인이 붙는다.
 * 프로필·호버 프로필처럼 점수를 보여줄 곳이 늘수록 같은 조인이 곳곳에 번진다.
 *
 * 그래서 값이 바뀌는 시점(계정 갱신·라인 티어 수정·내전 종료)에만 계산해
 * RiotAccount 에 저장하고, 읽을 때는 컬럼만 꺼내 쓴다.
 */
@Injectable()
export class BalanceScoreService {
  private readonly logger = new Logger(BalanceScoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 저장된 캐시가 현재 산식 버전으로 계산된 것인지 */
  isFresh(account: {
    balanceScores?: Prisma.JsonValue | null;
    balanceScoreVersion?: string | null;
  }): boolean {
    return (
      !!account.balanceScores &&
      account.balanceScoreVersion === BALANCE_SCORE_VERSION
    );
  }

  /** 저장된 캐시를 점수 맵으로 읽는다. 버전이 다르거나 없으면 null. */
  readCached(account: {
    balanceScores?: Prisma.JsonValue | null;
    balanceScoreVersion?: string | null;
  }): BalanceScoreMap | null {
    if (!this.isFresh(account)) return null;

    const raw = account.balanceScores as Record<string, unknown>;
    const scores = {} as BalanceScoreMap;
    for (const role of BALANCE_ROLES) {
      const value = raw?.[role];
      // 한 라인이라도 비어 있으면 캐시를 신뢰하지 않는다.
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      scores[role] = value;
    }
    return scores;
  }

  /**
   * 한 라이엇 계정의 점수를 다시 계산해 저장한다.
   * 계정이 없으면 아무것도 하지 않는다(탈퇴·연동 해제 경합 대비).
   */
  async refreshAccount(riotAccountId: string): Promise<BalanceScoreMap | null> {
    const account = await this.prisma.riotAccount.findUnique({
      where: { id: riotAccountId },
      select: {
        id: true,
        tier: true,
        rank: true,
        lp: true,
        peakTier: true,
        peakRank: true,
        peakLp: true,
        soloWins: true,
        soloLosses: true,
        roleTiers: { select: { role: true, tier: true, rank: true, lp: true } },
        user: {
          select: {
            nexusRanking: { select: { wins: true, losses: true } },
            nexusRoleRecords: {
              select: { role: true, wins: true, losses: true },
            },
          },
        },
      },
    });
    if (!account) return null;

    const details = calculatePlayerBalanceScores({
      currentTier: {
        tier: account.tier,
        rank: account.rank,
        lp: account.lp,
      },
      peakTier: account.peakTier
        ? {
            tier: account.peakTier,
            rank: account.peakRank,
            lp: account.peakLp,
          }
        : null,
      roleTiers: account.roleTiers,
      soloWins: account.soloWins,
      soloLosses: account.soloLosses,
      overallRecord: account.user?.nexusRanking ?? null,
      roleRecords: account.user?.nexusRoleRecords ?? [],
    });

    const scores = Object.fromEntries(
      BALANCE_ROLES.map((role) => [role, details[role].score]),
    ) as BalanceScoreMap;

    await this.prisma.riotAccount.update({
      where: { id: riotAccountId },
      data: {
        balanceScores: scores as unknown as Prisma.InputJsonValue,
        balanceScoreVersion: BALANCE_SCORE_VERSION,
        balanceScoresAt: new Date(),
      },
    });

    return scores;
  }

  /**
   * 유저의 모든 라이엇 계정 점수를 갱신한다.
   * 내전이 끝나 전적이 바뀌었을 때처럼 유저 단위로 무효화될 때 쓴다.
   * 점수 갱신 실패가 상위 동작(경기 결과 저장 등)을 막으면 안 되므로 삼킨다.
   */
  async refreshUser(userId: string): Promise<void> {
    try {
      const accounts = await this.prisma.riotAccount.findMany({
        where: { userId },
        select: { id: true },
      });

      // 재계산이 실패했을 때 현재 버전의 오래된 값이 계속 노출되지 않게 먼저 무효화한다.
      await this.prisma.riotAccount.updateMany({
        where: { userId },
        data: { balanceScoreVersion: null },
      });

      for (const account of accounts) {
        try {
          await this.refreshAccount(account.id);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `밸런스 점수 계정 갱신 실패 riotAccountId=${account.id}: ${message}`,
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`밸런스 점수 갱신 실패 userId=${userId}: ${message}`);
    }
  }

  /** 주기적 복구용 전체 재계산. 한 계정 실패가 나머지 계정을 막지 않는다. */
  async refreshAllAccounts(): Promise<{ updated: number; failed: number }> {
    const accounts = await this.prisma.riotAccount.findMany({
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    let updated = 0;
    let failed = 0;

    for (const account of accounts) {
      try {
        const scores = await this.refreshAccount(account.id);
        if (scores) updated += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `밸런스 점수 정기 갱신 실패 riotAccountId=${account.id}: ${message}`,
        );
      }
    }

    return { updated, failed };
  }
}
