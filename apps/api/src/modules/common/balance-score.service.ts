import { Injectable, Logger } from "@nestjs/common";
import { Prisma, Role } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import {
  BALANCE_ROLES,
  BALANCE_SCORE_VERSION,
  calculatePlayerBalanceScores,
  type BalanceLaneEdgeInput,
} from "./balance-score.util";

/** 솔로랭크 큐 ID — 자유랭크(440)는 라인 실력 신호가 약해 쓰지 않는다 */
const RANKED_SOLO_QUEUE_ID = 420;

/** 이보다 짧은 경기는 리메이크·조기 종료라 지표가 실력을 반영하지 않는다 */
const MIN_RATED_GAME_SECONDS = 600;

/** 라인별 점수 맵 ({ TOP: 24.4, ... }) */
export type BalanceScoreMap = Record<Role, number>;

/**
 * 자동 밸런스 점수 캐시를 관리한다.
 *
 * 점수 계산 자체는 싸다(40명에 1ms). 비싼 건 입력을 모으는 쪽이다 —
 * 현재 티어·최고 티어·라인 티어·솔랭 전적에 더해 내전 전적(NexusRanking,
 * NexusRoleRecord)과 솔랭 라인별 전적(MatchParticipant 집계)까지 필요해서,
 * 방을 조회할 때마다 조인이 붙는다.
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
   * 솔로랭크 라인별 전적을 집계한다.
   *
   * 리그 엔트리(soloWins/soloLosses)에는 라인 정보가 없어서, 이미 수집해 둔
   * 매치 참가 기록에서 직접 센다. 계정 하나당 인덱스(puuid)를 타고 수백 행만
   * 읽으므로 3ms 안팎이고, 이 메서드는 점수 캐시를 갱신할 때만 불린다.
   *
   * userId 가 아니라 puuid 로 찾는 이유가 둘 있다. 점수 자체가 계정 단위라
   * 부계정 전적이 섞이면 안 되고, MatchParticipant.userId 는 매치를 저장하던
   * 시점에 연동돼 있던 계정만 채워져 있어서 나중에 연동한 사람은 비어 있다
   * (실측: puuid 로 찾으면 95계정, userId 로 찾으면 51명).
   *
   * 자유랭크(440)는 라인 실력 신호가 약해 제외하고 솔로랭크(420)만 센다.
   */
  private async loadRankedRoleRecords(
    puuid: string | null,
  ): Promise<{ role: Role; wins: number; losses: number }[]> {
    if (!puuid) return [];

    try {
      const rows = await this.prisma.$queryRaw<
        { position: string; wins: bigint; games: bigint }[]
      >`
        SELECT p.position,
               COUNT(*) FILTER (WHERE p.win) AS wins,
               COUNT(*) AS games
        FROM match_participants p
        JOIN matches m ON m.id = p."matchId"
        WHERE p.puuid = ${puuid}
          AND m."queueId" = ${RANKED_SOLO_QUEUE_ID}
          AND p.position = ANY(${BALANCE_ROLES}::text[])
        GROUP BY p.position
      `;

      return rows.map((row) => {
        const wins = Number(row.wins);
        const games = Number(row.games);
        return { role: row.position as Role, wins, losses: games - wins };
      });
    } catch (error) {
      // 집계 실패로 점수 갱신 자체가 멈추면 안 된다 — 라인 보정 없이 계산한다.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`솔랭 라인 전적 집계 실패 puuid=${puuid}: ${message}`);
      return [];
    }
  }

  /**
   * 라인 대결 지표를 집계한다 — 같은 경기·같은 라인·반대 팀 상대와의 차이.
   *
   * 라인별 티어는 본인이 등록해야 하는데 실제 등록률이 2%라 티어 점수가 다섯
   * 라인 모두 같았다. 라인 상대라는 대조군은 랭크 매칭이 티어를 맞춰 주므로,
   * 별도 보정 없이도 "이 사람이 이 라인에서 얼마나 앞서는가"를 잴 수 있다.
   *
   * 리메이크·조기 종료는 지표가 무의미하므로 10분 미만 경기는 뺀다.
   */
  private async loadLaneEdges(
    puuid: string | null,
  ): Promise<BalanceLaneEdgeInput[]> {
    if (!puuid) return [];

    try {
      const rows = await this.prisma.$queryRaw<
        {
          position: string;
          games: bigint;
          gold: number | null;
          cs: number | null;
          damage: number | null;
          vision: number | null;
          net: number | null;
        }[]
      >`
        WITH me AS (
          SELECT p."matchId", p.position, p."riotTeamId",
                 m."gameDuration" / 60.0 AS mins,
                 p."goldEarned"::numeric AS gold,
                 (p."totalMinionsKilled" + p."neutralMinionsKilled")::numeric AS cs,
                 p."totalDamageDealtToChampions"::numeric AS damage,
                 p."visionScore"::numeric AS vision,
                 (p.kills + p.assists - p.deaths)::numeric AS net
          FROM match_participants p
          JOIN matches m ON m.id = p."matchId"
          WHERE p.puuid = ${puuid}
            AND m."queueId" = ${RANKED_SOLO_QUEUE_ID}
            AND m."gameDuration" >= ${MIN_RATED_GAME_SECONDS}
            AND p.position = ANY(${BALANCE_ROLES}::text[])
        )
        SELECT me.position,
               COUNT(*) AS games,
               AVG((me.gold - o."goldEarned") / me.mins)::float8 AS gold,
               AVG((me.cs - (o."totalMinionsKilled" + o."neutralMinionsKilled")) / me.mins)::float8 AS cs,
               AVG((me.damage - o."totalDamageDealtToChampions") / me.mins)::float8 AS damage,
               AVG((me.vision - o."visionScore") / me.mins)::float8 AS vision,
               AVG(me.net - (o.kills + o.assists - o.deaths))::float8 AS net
        FROM me
        JOIN match_participants o
          ON o."matchId" = me."matchId"
         AND o.position = me.position
         AND o."riotTeamId" <> me."riotTeamId"
        GROUP BY me.position
      `;

      return rows.map((row) => ({
        role: row.position as Role,
        games: Number(row.games),
        goldPerMin: row.gold ?? 0,
        csPerMin: row.cs ?? 0,
        damagePerMin: row.damage ?? 0,
        visionPerMin: row.vision ?? 0,
        netKills: row.net ?? 0,
      }));
    } catch (error) {
      // 라인 보정 없이도 점수는 나와야 한다.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`라인 대결 지표 집계 실패 puuid=${puuid}: ${message}`);
      return [];
    }
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
        puuid: true,
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
      rankedRoleRecords: await this.loadRankedRoleRecords(account.puuid),
      laneEdges: await this.loadLaneEdges(account.puuid),
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
