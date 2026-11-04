import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BalanceScoreService } from "../common/balance-score.service";
import { Role } from "@nexus/database";
import { resolveWinnerSlot } from "../match/match-roster.util";
import { rankingScore } from "./ranking-score";
import { applyAutoMvpAce } from "../match/auto-mvp.util";
import {
  summarizeCommendations,
  type CommendationSummary,
} from "../reputation/commendation.service";
import {
  NO_TEST_BOT_MATCH_WHERE,
  TEST_BOT_USER_WHERE,
} from "../common/test-bot.util";

/** 부팅 직후 DB·다른 모듈 준비를 기다렸다가 재계산한다 */
const BOOT_RECALC_DELAY_MS = 60 * 1000;

/** 리더보드에 보일 사람 — 봇 행이 남아 있어도(재계산 전) 목록·순위에서 뺀다 */
const NOT_BOT_USER = { NOT: TEST_BOT_USER_WHERE };

/** 리더보드 정렬 — 보정 승률 점수 → 같으면 판수 많은 순 (ranking-score.ts) */
const RANKING_ORDER = [
  { score: "desc" as const },
  { totalGames: "desc" as const },
];

/** 리더보드 행에 붙이는 내전 지표 (Riot 데이터가 수집된 경기 기준) */
export interface RankingRowStats {
  /** KDA 를 낸 경기 수 — 수동 입력 경기는 K/D/A 가 없어 판수보다 적을 수 있다 */
  statGames: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  /** (K+A)/D, 데스 0 이면 K+A */
  kda: number | null;
  /** 내전 MVP 횟수 — Riot 기록으로 자동으로 정한다 (match/auto-mvp.util) */
  mvpCount: number;
  /**
   * 평판 — 경기 뒤 함께 뛴 사람들이 남긴 칭찬 수와 많이 받은 태그.
   * 경매 매물 카드·프로필과 같은 값(reputation/commendation.service).
   */
  commendations: CommendationSummary;
  /** 많이 한 챔피언 순 최대 3개 (Riot 챔피언 키) */
  topChampions: string[];
}

@Injectable()
export class RankingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RankingService.name);
  // 정렬은 보정 승률 점수 순(ranking-score.ts). 1판짜리 100% 가 위로 튀지 않고,
  // 많이 지기만 한 사람이 판수로 올라가지도 않는다.
  // 랭킹 등재 최소 판수. 2026-11-03 10판 → 1판: 내전 성사 자체가 드물어 10판 조건이면 목록이 비어 있었다.
  private static readonly MIN_GAMES_FOR_RANK = 1;
  private static readonly RECENT_GAMES_COUNT = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceScores: BalanceScoreService,
  ) {}

  /**
   * 부팅할 때 한 번 전체 랭킹을 다시 계산한다.
   *
   * 랭킹은 경기가 끝날 때 그 경기 참가자만 갱신하는 저장값이라, 집계 규칙이
   * 바뀌어도(예: 2026-11-04 봇 낀 판 제외) 다음 경기를 뛰기 전까지 옛 값이 남는다.
   * 관리자 화면에 재계산 버튼이 없어 배포마다 한 번씩 맞춰 둔다.
   * 대상이 수십 명이라 비용은 작다.
   */
  onApplicationBootstrap() {
    // 테스트 환경에서는 타이머를 걸지 않는다
    if (process.env.NODE_ENV === "test") return;
    setTimeout(() => {
      this.recalculateAllRankings().catch((error) =>
        this.logger.warn(`부팅 후 랭킹 재계산 실패: ${error}`),
      );
    }, BOOT_RECALC_DELAY_MS).unref();
  }

  /**
   * 테스트 봇인지 확인한다.
   *
   * 봇은 내전 테스트에 그대로 참여하므로(실측: 내전 19경기 중 3경기) 막지 않으면
   * 일반 유저와 같은 경로로 랭킹에 쌓인다. 실제로 리더보드 58행 중 19행이
   * 봇이었다. 판별 기준은 admin 화면과 같은 것을 쓴다 — 갈라지면 "관리자
   * 화면에선 봇인데 리더보드엔 올라와 있는" 상태가 다시 생긴다.
   */
  private async isTestBot(userId: string): Promise<boolean> {
    const hit = await this.prisma.user.findFirst({
      where: { id: userId, ...TEST_BOT_USER_WHERE },
      select: { id: true },
    });
    return hit !== null;
  }

  /**
   * Update ranking for a user after match completion
   */
  async updateRanking(userId: string): Promise<void> {
    try {
      // 봇은 전적·라인기록·클랜랭킹·밸런스점수 어디에도 쌓지 않는다.
      // updateRanking 이 이 네 가지의 유일한 입구라 여기 한 곳만 막으면 된다.
      if (await this.isTestBot(userId)) return;

      const {
        totalGames,
        wins,
        losses,
        winRate,
        recentWins,
        recentLosses,
        byRole,
      } = await this.computeInternalRecord(userId);

      await this.syncRoleRecords(userId, byRole);

      // Upsert NexusRanking
      await this.prisma.nexusRanking.upsert({
        where: { userId },
        create: {
          userId,
          totalGames,
          wins,
          losses,
          winRate,
          score: rankingScore(wins, totalGames),
          recentWins,
          recentLosses,
        },
        update: {
          totalGames,
          wins,
          losses,
          winRate,
          score: rankingScore(wins, totalGames),
          recentWins,
          recentLosses,
        },
      });

      // 전체·라인 전적을 모두 저장한 뒤 계산해야 방금 끝난 경기까지 반영된다.
      await this.balanceScores.refreshUser(userId);

      // Update clan rankings if user is in any clan
      const clanMemberships = await this.prisma.clanMember.findMany({
        where: { userId },
        select: { clanId: true },
      });

      for (const membership of clanMemberships) {
        await this.updateClanRanking(userId, membership.clanId);
      }

      this.logger.log(
        `Updated ranking for user ${userId}: ${wins}W ${losses}L (${winRate.toFixed(1)}%)`,
      );
    } catch (error) {
      this.logger.error(`Failed to update ranking for user ${userId}:`, error);
    }
  }

  /**
   * 내전 전적(승/패)을 계산한다.
   *
   * 예전에는 match_participants(=Riot 수집 결과)로 셌다. 그런데 수동 사설방은
   * Riot이 데이터를 주지 않아 참가자 행이 0건이고, 방장이 버튼으로 입력한 승패가
   * 랭킹에 전혀 반영되지 않았다.
   *
   * 승패는 Nexus가 자체적으로 확정하는 값이므로 Riot 수집 여부와 무관해야 한다.
   * 로스터 스냅샷(방이 삭제돼도 남는다)과 매치 결과만으로 계산한다.
   */
  private async computeInternalRecord(userId: string): Promise<{
    totalGames: number;
    wins: number;
    losses: number;
    winRate: number;
    recentWins: number;
    recentLosses: number;
    byRole: Map<Role, { totalGames: number; wins: number }>;
  }> {
    const rosters = await this.prisma.matchRosterSnapshot.findMany({
      where: {
        userId,
        // 봇을 채워 시험한 판은 실제 내전이 아니라 사람 쪽 전적에도 넣지 않는다
        match: {
          isInternal: true,
          status: "COMPLETED",
          ...NO_TEST_BOT_MATCH_WHERE,
        },
      },
      select: {
        teamSlot: true,
        assignedRole: true,
        match: {
          select: {
            completedAt: true,
            winnerId: true,
            winnerIdSnapshot: true,
            teamAId: true,
            teamBId: true,
            teamAIdSnapshot: true,
            teamBIdSnapshot: true,
          },
        },
      },
      orderBy: { match: { completedAt: "desc" } },
    });

    // 승패가 확정된 경기만 집계한다 (결과 미입력 경기는 제외).
    const results = rosters
      .map((roster) => {
        const winnerSlot = resolveWinnerSlot(roster.match);
        return winnerSlot
          ? { win: winnerSlot === roster.teamSlot, role: roster.assignedRole }
          : null;
      })
      .filter(
        (result): result is { win: boolean; role: Role | null } =>
          result !== null,
      );

    const totalGames = results.length;
    const wins = results.filter((result) => result.win).length;
    const recentGames = results.slice(0, RankingService.RECENT_GAMES_COUNT);
    const recentWins = recentGames.filter((result) => result.win).length;

    // 라인별 집계. 역할 선택을 거치지 않은 경기(assignedRole 없음)는 제외한다.
    const byRole = new Map<Role, { totalGames: number; wins: number }>();
    for (const result of results) {
      if (!result.role) continue;
      const entry = byRole.get(result.role) ?? { totalGames: 0, wins: 0 };
      entry.totalGames += 1;
      if (result.win) entry.wins += 1;
      byRole.set(result.role, entry);
    }

    return {
      totalGames,
      wins,
      losses: totalGames - wins,
      winRate: totalGames > 0 ? (wins / totalGames) * 100 : 0,
      recentWins,
      recentLosses: recentGames.length - recentWins,
      byRole,
    };
  }

  /**
   * 라인별 전적을 저장한다.
   * 집계에서 사라진 라인은 남겨두면 오래된 값이 유령처럼 보이므로 지운다.
   */
  private async syncRoleRecords(
    userId: string,
    byRole: Map<Role, { totalGames: number; wins: number }>,
  ): Promise<void> {
    const activeRoles = [...byRole.keys()];

    await this.prisma.nexusRoleRecord.deleteMany({
      where: {
        userId,
        ...(activeRoles.length > 0 ? { role: { notIn: activeRoles } } : {}),
      },
    });

    for (const [role, entry] of byRole) {
      const losses = entry.totalGames - entry.wins;
      const winRate =
        entry.totalGames > 0 ? (entry.wins / entry.totalGames) * 100 : 0;
      const payload = {
        totalGames: entry.totalGames,
        wins: entry.wins,
        losses,
        winRate,
        score: rankingScore(entry.wins, entry.totalGames),
      };

      await this.prisma.nexusRoleRecord.upsert({
        where: { userId_role: { userId, role } },
        create: { userId, role, ...payload },
        update: payload,
      });
    }
  }

  /**
   * Update clan-specific ranking for a user.
   * Since rooms don't have a clanId field, clan ranking uses the same
   * Nexus custom-match stats to rank members within each clan.
   */
  private async updateClanRanking(
    userId: string,
    clanId: string,
  ): Promise<void> {
    const { totalGames, wins, losses, winRate } =
      await this.computeInternalRecord(userId);

    await this.prisma.clanRanking.upsert({
      where: { userId_clanId: { userId, clanId } },
      create: {
        userId,
        clanId,
        totalGames,
        wins,
        losses,
        winRate,
      },
      update: {
        totalGames,
        wins,
        losses,
        winRate,
      },
    });
  }

  /**
   * 글로벌 랭킹 (페이지네이션, 내전 1판 이상).
   * - role 을 주면 그 라인으로 뛴 경기만 모은 라인별 랭킹(nexus_role_records)
   * - q 를 주면 사이트 닉네임·Riot 게임 이름으로 거른다
   * 순위 번호는 검색 결과 안의 순서가 아니라 (그 탭의) 전체 랭킹 기준 순위다.
   */
  async getGlobalRanking(
    page: number = 1,
    limit: number = 50,
    q?: string,
    role?: Role,
  ) {
    const skip = (page - 1) * limit;
    const search = q?.trim();
    const userWhere = {
      ...NOT_BOT_USER,
      ...(search
        ? {
            OR: [
              {
                username: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                riotAccounts: {
                  some: {
                    gameName: {
                      contains: search,
                      mode: "insensitive" as const,
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const baseWhere = {
      totalGames: { gte: RankingService.MIN_GAMES_FOR_RANK },
      user: userWhere,
    };
    const userInclude = {
      user: {
        select: {
          id: true,
          username: true,
          avatar: true,
          riotAccounts: {
            where: { isPrimary: true },
            select: {
              gameName: true,
              tagLine: true,
              tier: true,
              rank: true,
            },
            take: 1,
          },
        },
      },
    };

    // 종합과 라인별은 테이블만 다르고 모양(판수·승패·점수 + 유저)은 같다
    const [rankings, total] = role
      ? await Promise.all([
          this.prisma.nexusRoleRecord.findMany({
            where: { ...baseWhere, role },
            include: userInclude,
            orderBy: RANKING_ORDER,
            skip,
            take: limit,
          }),
          this.prisma.nexusRoleRecord.count({ where: { ...baseWhere, role } }),
        ])
      : await Promise.all([
          this.prisma.nexusRanking.findMany({
            where: baseWhere,
            include: userInclude,
            orderBy: RANKING_ORDER,
            skip,
            take: limit,
          }),
          this.prisma.nexusRanking.count({ where: baseWhere }),
        ]);

    const stats = await this.getRankingRowStats(
      rankings.map((r) => r.userId),
      role,
    );

    // 순위 번호 — 검색 중이면 각자 전체 순위를 따로 센다(결과가 한 페이지라 비용이 작다)
    const rankedData = await Promise.all(
      rankings.map(async (r, i) => ({
        ...r,
        globalRank: search
          ? (await this.countRankedAbove(r.score, r.totalGames, role)) + 1
          : skip + i + 1,
        stats: stats.get(r.userId) ?? null,
      })),
    );

    return {
      rankings: rankedData,
      total,
      page,
      limit,
      role: role ?? null,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** 정렬 기준(점수 → 판수)과 같은 순서로 "나보다 위" 인원을 센다 */
  private countRankedAbove(score: number, totalGames: number, role?: Role) {
    const where = {
      totalGames: { gte: RankingService.MIN_GAMES_FOR_RANK },
      user: NOT_BOT_USER,
      OR: [{ score: { gt: score } }, { score, totalGames: { gt: totalGames } }],
    };
    return role
      ? this.prisma.nexusRoleRecord.count({ where: { ...where, role } })
      : this.prisma.nexusRanking.count({ where });
  }

  /**
   * 리더보드 한 페이지 사람들의 KDA·MVP·주력 챔피언.
   *
   * 승패는 로스터 스냅샷으로 세지만 K/D/A·챔피언은 Riot 이 준 경기
   * (match_participants)에만 있다. 그래서 statGames 가 판수보다 적을 수 있고,
   * 화면은 statGames 가 0 이면 지표 칸을 비운다.
   * 라인 탭이면 그 라인으로 뛴 경기만 센다 — KDA·챔피언은 Riot 포지션,
   * MVP 는 역할 선택에서 배정된 라인 기준. 칭찬은 사람에 대한 평가라 전체 값을 쓴다.
   */
  private async getRankingRowStats(
    userIds: string[],
    role?: Role,
  ): Promise<Map<string, RankingRowStats>> {
    const result = new Map<string, RankingRowStats>();
    if (userIds.length === 0) return result;

    const internalMatch = {
      isInternal: true,
      status: "COMPLETED" as const,
      ...NO_TEST_BOT_MATCH_WHERE,
    };
    const participantWhere = {
      userId: { in: userIds },
      match: internalMatch,
      ...(role ? { position: role } : {}),
    };

    const [kdaRows, championRows, mvpCounts, commendations] = await Promise.all(
      [
        this.prisma.matchParticipant.groupBy({
          by: ["userId"],
          where: participantWhere,
          _sum: { kills: true, deaths: true, assists: true },
          _count: { _all: true },
        }),
        this.prisma.matchParticipant.groupBy({
          by: ["userId", "championName"],
          where: participantWhere,
          _count: { _all: true },
        }),
        this.countMvps(userIds, role, internalMatch),
        summarizeCommendations(this.prisma, userIds),
      ],
    );

    // 챔피언은 판수 많은 순, 같으면 이름순으로 3개
    const championsByUser = new Map<
      string,
      { name: string; games: number }[]
    >();
    for (const row of championRows) {
      if (!row.userId || !row.championName) continue;
      const list = championsByUser.get(row.userId) ?? [];
      list.push({ name: row.championName, games: row._count._all });
      championsByUser.set(row.userId, list);
    }

    const kdaByUser = new Map(kdaRows.map((row) => [row.userId, row]));
    for (const userId of userIds) {
      const row = kdaByUser.get(userId);
      const games = row?._count._all ?? 0;
      const kills = row?._sum.kills ?? 0;
      const deaths = row?._sum.deaths ?? 0;
      const assists = row?._sum.assists ?? 0;
      const round1 = (value: number) => Math.round(value * 10) / 10;
      result.set(userId, {
        statGames: games,
        avgKills: games ? round1(kills / games) : 0,
        avgDeaths: games ? round1(deaths / games) : 0,
        avgAssists: games ? round1(assists / games) : 0,
        kda: games
          ? Math.round(((kills + assists) / Math.max(1, deaths)) * 100) / 100
          : null,
        mvpCount: mvpCounts.get(userId) ?? 0,
        commendations: commendations.get(userId) ?? { total: 0, topTags: [] },
        topChampions: (championsByUser.get(userId) ?? [])
          .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name))
          .slice(0, 3)
          .map((champion) => champion.name),
      });
    }
    return result;
  }

  /** 내전 MVP 횟수. 라인 탭이면 그 라인으로 배정된 경기에서 받은 것만 센다. */
  private async countMvps(
    userIds: string[],
    role: Role | undefined,
    internalMatch: object,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (role) {
      const rosters = await this.prisma.matchRosterSnapshot.findMany({
        where: {
          userId: { in: userIds },
          assignedRole: role,
          match: { ...internalMatch, mvpUserId: { in: userIds } },
        },
        select: { userId: true, match: { select: { mvpUserId: true } } },
      });
      for (const roster of rosters) {
        if (roster.userId && roster.match.mvpUserId === roster.userId) {
          counts.set(roster.userId, (counts.get(roster.userId) ?? 0) + 1);
        }
      }
      return counts;
    }

    const rows = await this.prisma.match.groupBy({
      by: ["mvpUserId"],
      where: { ...internalMatch, mvpUserId: { in: userIds } },
      _count: { _all: true },
    });
    for (const row of rows) {
      if (row.mvpUserId) counts.set(row.mvpUserId, row._count._all);
    }
    return counts;
  }

  /**
   * Get clan ranking (paginated)
   */
  async getClanRanking(clanId: string, page: number = 1, limit: number = 50) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
    });

    if (!clan) {
      throw new NotFoundException("Clan not found");
    }

    const skip = (page - 1) * limit;

    const [rankings, total] = await Promise.all([
      this.prisma.clanRanking.findMany({
        where: { clanId, user: NOT_BOT_USER },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
        orderBy: [{ totalGames: "desc" }, { winRate: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.clanRanking.count({
        where: { clanId, user: NOT_BOT_USER },
      }),
    ]);

    const rankedData = rankings.map(
      (r: (typeof rankings)[number], i: number) => ({
        ...r,
        clanRank: skip + i + 1,
      }),
    );

    return {
      clan: { id: clan.id, name: clan.name, tag: clan.tag },
      rankings: rankedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a specific user's ranking info
   */
  async getUserRanking(userId: string) {
    const [ranking, roleRecords] = await Promise.all([
      this.prisma.nexusRanking.findUnique({ where: { userId } }),
      // 라인별 전적 — 표시 순서는 라인 순(TOP→SUPPORT)으로 고정한다.
      this.prisma.nexusRoleRecord.findMany({ where: { userId } }),
    ]);

    const ROLE_ORDER: Role[] = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
    const byRole = ROLE_ORDER.map(
      (role) => roleRecords.find((record) => record.role === role) ?? null,
    ).filter((record): record is (typeof roleRecords)[number] =>
      Boolean(record),
    );

    if (!ranking) {
      return {
        totalGames: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        globalRank: null,
        recentWins: 0,
        recentLosses: 0,
        byRole,
      };
    }

    // Calculate global rank position
    let globalRank: number | null = null;
    if (ranking.totalGames >= RankingService.MIN_GAMES_FOR_RANK) {
      globalRank =
        (await this.countRankedAbove(ranking.score, ranking.totalGames)) + 1;
    }

    return {
      ...ranking,
      globalRank,
      byRole,
    };
  }

  /**
   * Recalculate all rankings (admin/cron)
   */
  async recalculateAllRankings(): Promise<{
    processed: number;
    purgedBotRows: number;
  }> {
    // updateRanking 은 봇을 건너뛰기만 하므로, 봇 차단 이전에 쌓인 행은
    // 재계산으로도 0 이 되지 않고 리더보드에 그대로 남는다(실측 58행 중 19행).
    // 재계산 전에 봇 행을 지워 둬야 순위 번호도 봇을 뺀 기준으로 매겨진다.
    const purgedBotRows = await this.purgeTestBotRankings();

    // MVP·ACE 는 투표가 아니라 Riot 기록으로 정한다(match/auto-mvp.util). 투표로 정해졌거나
    // 자동 계산이 생기기 전에 수집된 판도 같은 기준으로 맞춘다 — 랭킹 MVP 칸이 이 값을 센다.
    const collectedMatches = await this.prisma.match.findMany({
      where: { isInternal: true, dataCollected: true },
      select: { id: true },
    });
    for (const { id } of collectedMatches) {
      await applyAutoMvpAce(this.prisma, id);
    }

    // 기존에 외부 인제스트 매치로 오염된 ranking row도 0으로 재계산되도록
    // 현재 랭킹 테이블 사용자와 내전 참여자를 모두 대상으로 삼는다.
    const [customParticipants, existingRankings] = await Promise.all([
      this.prisma.matchParticipant.findMany({
        where: {
          userId: { not: null },
          match: {
            isInternal: true,
          },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
      this.prisma.nexusRanking.findMany({
        select: { userId: true },
      }),
    ]);

    const userIds = Array.from(
      new Set(
        [...customParticipants, ...existingRankings]
          .map(({ userId }) => userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    this.logger.log(`Recalculating rankings for ${userIds.length} users...`);

    let processed = 0;
    for (const userId of userIds) {
      await this.updateRanking(userId);
      processed++;
    }

    // Update global rank numbers
    await this.updateGlobalRankNumbers();

    this.logger.log(
      `Recalculation complete: ${processed} users processed, ${purgedBotRows} bot rows purged`,
    );
    return { processed, purgedBotRows };
  }

  /**
   * 테스트 봇이 남긴 랭킹·라인기록·클랜랭킹 행을 지운다.
   *
   * 셋 다 봇 자신의 집계값이라 보존할 이력이 아니다. 봇 계정 자체와 봇이 참여한
   * 경기 기록(로스터 스냅샷 등)은 건드리지 않는다 — 내전 테스트 재현에 쓰인다.
   * 이 뒤에 existingRankings 를 읽으므로 반드시 먼저 실행해야 한다.
   */
  private async purgeTestBotRankings(): Promise<number> {
    const where = { user: TEST_BOT_USER_WHERE };
    const [rankings, roleRecords, clanRankings] = await Promise.all([
      this.prisma.nexusRanking.deleteMany({ where }),
      this.prisma.nexusRoleRecord.deleteMany({ where }),
      this.prisma.clanRanking.deleteMany({ where }),
    ]);
    const total = rankings.count + roleRecords.count + clanRankings.count;

    if (total > 0) {
      this.logger.log(
        `Purged test bot rows: ranking=${rankings.count} role=${roleRecords.count} clan=${clanRankings.count}`,
      );
    }
    return total;
  }

  /**
   * Update globalRank numbers for all eligible users
   */
  private async updateGlobalRankNumbers(): Promise<void> {
    const rankings = await this.prisma.nexusRanking.findMany({
      where: {
        totalGames: { gte: RankingService.MIN_GAMES_FOR_RANK },
        user: NOT_BOT_USER,
      },
      orderBy: RANKING_ORDER,
      select: { id: true },
    });

    // Batch update rank numbers
    for (let i = 0; i < rankings.length; i++) {
      await this.prisma.nexusRanking.update({
        where: { id: rankings[i].id },
        data: { globalRank: i + 1 },
      });
    }

    // Set null for users below minimum games
    await this.prisma.nexusRanking.updateMany({
      where: {
        totalGames: { lt: RankingService.MIN_GAMES_FOR_RANK },
      },
      data: { globalRank: null },
    });
  }
}
