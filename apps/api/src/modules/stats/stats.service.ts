import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { MatchDto, RiotMatchService } from "../riot/riot-match.service";
import { RiotService } from "../riot/riot.service";
import { getChampionKoreanName } from "@nexus/types";
import {
  aggregateCustomMatchStats,
  CustomMatchAggregateRow,
} from "./utils/custom-match-aggregator";

export type QueueGroup = "ranked" | "normal" | "aram" | "custom" | "all";

export interface ChampionStats {
  championId: number;
  championName: string;
  /** 챔피언 한글명 (예: "아리") — 프론트 한글 표시용 */
  championNameKorean: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
}

export interface RankedChampStat {
  championId: number;
  championName: string;
  /** 챔피언 한글명 (예: "아리") — 프론트 한글 표시용 */
  championNameKorean: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface ChampionStatsCacheResponse {
  queueGroup: QueueGroup;
  matchCount: number;
  isPartial: boolean;
  computedAt: string;
  stats: RankedChampStat[];
}

export interface RecentGamesSnapshot {
  last20: {
    wins: number;
    games: number;
    avgKda: number;
    avgDamageShare: number;
  };
  lastPlayedAt: string | null;
}

interface AggregatedParticipantRow {
  championId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

interface CacheParticipantRow extends AggregatedParticipantRow {
  playedAt: Date;
  damageShare: number;
}

export interface PositionStats {
  position: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface AuctionTitle {
  key: string;
  label: string;
  description: string;
}

export interface AuctionStats {
  captainCount: number;
  totalAuctions: number;
  totalSold: number;
  yuchalCount: number;
  avgSoldPrice: number;
  maxSoldPrice: number;
  titles: AuctionTitle[];
}

/**
 * 배경 백필 작업의 우선순위.
 * 사람이 기다리는 조회(0 이상)보다 항상 뒤로 밀리도록 음수를 쓴다.
 */
export const SCAN_BACKFILL_PRIORITY = -10;

/**
 * 동시에 진행할 수 있는 스캔 수.
 *
 * Riot 전역 예산이 하나뿐이라 여러 건을 같이 돌려도 총 처리량은 그대로다.
 * 오히려 각자 예산을 기다리며 늘어져 stall 판정(15분)에 걸리기만 한다.
 */
const MAX_CONCURRENT_SCANS = 2;

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly riotMatchService: RiotMatchService,
    private readonly riotService: RiotService,
    private readonly configService: ConfigService,
  ) {}

  private readonly queueGroupToQueueIds: Record<
    Exclude<QueueGroup, "custom" | "all">,
    number[]
  > = {
    ranked: [420, 440],
    normal: [400, 430],
    aram: [450],
  };

  // 시즌 라벨 — 캐시/집계 키로 사용. env 미설정 시 현재 연도(기존 동작 유지).
  // 예: RIOT_SEASON_LABEL="2026-S1"
  private getCurrentSeason(): string {
    const label = this.configService.get<string>("RIOT_SEASON_LABEL");
    if (label && label.trim()) return label.trim();
    return String(new Date().getUTCFullYear());
  }

  // 시즌(스플릿) 시작일 — 이 시점 이후 매치만 집계. env로 실제 스플릿 시작일 지정.
  // 미설정 시 현재 연도 1월 1일(기존 동작 유지). 예: RIOT_SEASON_START="2026-01-08"
  private getSeasonStartDate(): Date {
    const raw = this.configService.get<string>("RIOT_SEASON_START");
    if (raw && raw.trim()) {
      const parsed = new Date(raw.trim());
      if (!Number.isNaN(parsed.getTime())) return parsed;
      this.logger.warn(
        `Invalid RIOT_SEASON_START=${raw}, falling back to Jan 1`,
      );
    }
    return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  }

  private getChampionStatsCacheKey(
    userId: string,
    queueGroup: QueueGroup,
  ): string {
    return `stats:champ:${queueGroup}:${userId}`;
  }

  private async invalidateChampionStatsCaches(
    userId: string,
    queueGroup: QueueGroup,
  ): Promise<void> {
    const targetQueueGroups: QueueGroup[] =
      queueGroup === "all"
        ? ["ranked", "normal", "aram", "custom", "all"]
        : [queueGroup];

    await Promise.all(
      targetQueueGroups.map(async (targetQueueGroup) => {
        await this.redis.del(
          this.getChampionStatsCacheKey(userId, targetQueueGroup),
        );
        await this.prisma.matchStatsCache
          .delete({
            where: {
              userId_queueGroup_season: {
                userId,
                queueGroup: targetQueueGroup,
                season: this.getCurrentSeason(),
              },
            },
          })
          .catch(() => undefined);
      }),
    );
  }

  private async bumpKnownPuuidPriority(
    userId: string,
    queueGroup: QueueGroup,
  ): Promise<void> {
    if (queueGroup === "custom") {
      return;
    }

    const linkedAccounts = await this.getLinkedAccounts(userId);
    const puuids = linkedAccounts.map((account) => account.puuid);

    if (puuids.length === 0) {
      return;
    }

    await this.prisma.knownPuuid.updateMany({
      where: {
        puuid: { in: puuids },
        priority: { lt: 20 },
      },
      data: {
        priority: 20,
      },
    });
  }

  private toRankedChampStatArray(stats: unknown): RankedChampStat[] {
    if (!Array.isArray(stats)) return [];
    return stats as RankedChampStat[];
  }

  private aggregateParticipantRows(
    rows: AggregatedParticipantRow[],
  ): RankedChampStat[] {
    const statsMap = new Map<number, RankedChampStat>();

    for (const row of rows) {
      const existing = statsMap.get(row.championId);
      if (existing) {
        existing.games++;
        if (row.win) existing.wins++;
        else existing.losses++;
        existing.kills += row.kills;
        existing.deaths += row.deaths;
        existing.assists += row.assists;
        continue;
      }

      statsMap.set(row.championId, {
        championId: row.championId,
        championName: row.championName,
        championNameKorean: getChampionKoreanName(row.championName),
        games: 1,
        wins: row.win ? 1 : 0,
        losses: row.win ? 0 : 1,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
      });
    }

    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  }

  private roundMetric(value: number, digits = 4): number {
    return Number(value.toFixed(digits));
  }

  private toRankedStatsFromCustomAggregate(
    rows: CustomMatchAggregateRow[],
  ): RankedChampStat[] {
    return rows.map((row) => ({
      championId: row.championId,
      championName: row.championName ?? String(row.championId),
      championNameKorean: getChampionKoreanName(
        row.championName ?? String(row.championId),
      ),
      games: row.games,
      wins: row.wins,
      losses: row.games - row.wins,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
    }));
  }

  private buildRecentGamesSnapshot(
    rows: CacheParticipantRow[],
  ): RecentGamesSnapshot {
    const recentRows = [...rows]
      .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
      .slice(0, 20);

    if (recentRows.length === 0) {
      return {
        last20: {
          wins: 0,
          games: 0,
          avgKda: 0,
          avgDamageShare: 0,
        },
        lastPlayedAt: null,
      };
    }

    const wins = recentRows.filter((row) => row.win).length;
    const avgKda =
      recentRows.reduce(
        (sum, row) => sum + (row.kills + row.assists) / Math.max(row.deaths, 1),
        0,
      ) / recentRows.length;
    const avgDamageShare =
      recentRows.reduce((sum, row) => sum + row.damageShare, 0) /
      recentRows.length;

    return {
      last20: {
        wins,
        games: recentRows.length,
        avgKda: this.roundMetric(avgKda, 2),
        avgDamageShare: this.roundMetric(avgDamageShare, 4),
      },
      lastPlayedAt: recentRows[0].playedAt.toISOString(),
    };
  }

  private async persistChampionStatsCache(
    userId: string,
    queueGroup: QueueGroup,
    season: string,
    payload: {
      stats: RankedChampStat[];
      matchCount: number;
      isPartial: boolean;
      recentGames: RecentGamesSnapshot;
    },
  ): Promise<void> {
    const computedAt = new Date();

    await this.prisma.matchStatsCache.upsert({
      where: {
        userId_queueGroup_season: {
          userId,
          queueGroup,
          season,
        },
      },
      create: {
        userId,
        queueGroup,
        season,
        stats: payload.stats as unknown as Prisma.JsonArray,
        recentGames: payload.recentGames as unknown as Prisma.JsonObject,
        matchCount: payload.matchCount,
        isPartial: payload.isPartial,
      },
      update: {
        stats: payload.stats as unknown as Prisma.JsonArray,
        recentGames: payload.recentGames as unknown as Prisma.JsonObject,
        matchCount: payload.matchCount,
        isPartial: payload.isPartial,
        computedAt,
      },
    });

    await this.redis.set(
      this.getChampionStatsCacheKey(userId, queueGroup),
      JSON.stringify({
        queueGroup,
        matchCount: payload.matchCount,
        isPartial: payload.isPartial,
        computedAt: computedAt.toISOString(),
        stats: payload.stats,
      } satisfies ChampionStatsCacheResponse),
      3600,
    );
  }

  /**
   * 외부 ranked-cache에서 정규화된 MatchParticipant 행을 통계 행으로 변환.
   * — 내부 매치는 normalizeCustomParticipantRows 사용. 외부는 teamId가 NULL이므로
   *   riotTeamId(100/200)로 같은 팀 데미지를 계산한다.
   */
  private normalizeRankedParticipantRows(
    rows: Array<{
      championId: number;
      championName: string;
      kills: number;
      deaths: number;
      assists: number;
      win: boolean;
      riotTeamId: number | null;
      totalDamageDealtToChampions: number;
      match: {
        completedAt: Date | null;
        createdAt: Date;
        participants: Array<{
          riotTeamId: number | null;
          totalDamageDealtToChampions: number;
        }>;
      };
    }>,
  ): CacheParticipantRow[] {
    return rows.map((row) => {
      const teamDamage = row.match.participants
        .filter((p) => p.riotTeamId === row.riotTeamId)
        .reduce(
          (sum, participant) => sum + participant.totalDamageDealtToChampions,
          0,
        );

      return {
        championId: row.championId,
        championName: row.championName,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        win: row.win,
        // 외부 매치는 completedAt(=gameEnd)이 항상 설정됨. 안전을 위해 createdAt 폴백.
        playedAt: row.match.completedAt ?? row.match.createdAt,
        damageShare:
          teamDamage > 0
            ? this.roundMetric(row.totalDamageDealtToChampions / teamDamage)
            : 0,
      };
    });
  }

  private normalizeCustomParticipantRows(
    rows: Array<{
      championId: number;
      championName: string;
      kills: number;
      deaths: number;
      assists: number;
      win: boolean;
      teamId: string | null;
      teamIdSnapshot: string | null;
      totalDamageDealtToChampions: number;
      match: {
        createdAt: Date;
        participants: Array<{
          teamId: string | null;
          teamIdSnapshot: string | null;
          totalDamageDealtToChampions: number;
        }>;
      };
    }>,
  ): CacheParticipantRow[] {
    return rows.map((row) => {
      const teamId = row.teamId ?? row.teamIdSnapshot;
      const teamDamage = row.match.participants
        .filter(
          (participant) =>
            (participant.teamId ?? participant.teamIdSnapshot) === teamId,
        )
        .reduce(
          (sum, participant) => sum + participant.totalDamageDealtToChampions,
          0,
        );

      return {
        championId: row.championId,
        championName: row.championName,
        kills: row.kills,
        deaths: row.deaths,
        assists: row.assists,
        win: row.win,
        playedAt: row.match.createdAt,
        damageShare:
          teamDamage > 0
            ? this.roundMetric(row.totalDamageDealtToChampions / teamDamage)
            : 0,
      };
    });
  }

  private async getLinkedAccounts(userId: string) {
    return this.prisma.riotAccount.findMany({
      where: { userId },
      select: {
        puuid: true,
      },
    });
  }

  private async computeQueueGroupStats(
    userId: string,
    queueGroup: QueueGroup,
  ): Promise<{
    stats: RankedChampStat[];
    matchCount: number;
    isPartial: boolean;
    recentGames: RecentGamesSnapshot;
  }> {
    const season = this.getCurrentSeason();
    const seasonStart = this.getSeasonStartDate();
    let result: {
      stats: RankedChampStat[];
      matchCount: number;
      isPartial: boolean;
      recentGames: RecentGamesSnapshot;
    };

    if (queueGroup === "custom") {
      const aggregatedRows = await aggregateCustomMatchStats(this.prisma, {
        userId,
        fromDate: seasonStart,
        groupBy: "champion",
        dateField: "createdAt",
        source: "custom",
      });
      const rows = await this.prisma.matchParticipant.findMany({
        where: {
          userId,
          match: {
            isInternal: true,
            createdAt: {
              gte: seasonStart,
            },
          },
        },
        select: {
          championId: true,
          championName: true,
          kills: true,
          deaths: true,
          assists: true,
          teamId: true,
          teamIdSnapshot: true,
          totalDamageDealtToChampions: true,
          win: true,
          match: {
            select: {
              createdAt: true,
              participants: {
                select: {
                  teamId: true,
                  teamIdSnapshot: true,
                  totalDamageDealtToChampions: true,
                },
              },
            },
          },
        },
        orderBy: {
          match: {
            createdAt: "desc",
          },
        },
      });
      const participantRows = this.normalizeCustomParticipantRows(rows);

      result = {
        stats: this.toRankedStatsFromCustomAggregate(aggregatedRows),
        matchCount: participantRows.length,
        isPartial: false,
        recentGames: this.buildRecentGamesSnapshot(participantRows),
      };
    } else if (queueGroup === "all") {
      // 'all' = 내부 토너먼트 + 외부 ranked/normal/aram 합산.
      // 두 경로 모두 MatchParticipant 정형 테이블에서 직접 조회 (raw cache 풀스캔 제거).
      const linkedAccounts = await this.getLinkedAccounts(userId);
      const puuidSet = new Set(linkedAccounts.map((account) => account.puuid));

      const customRows = await this.prisma.matchParticipant.findMany({
        where: {
          userId,
          match: {
            isInternal: true,
            createdAt: {
              gte: seasonStart,
            },
          },
        },
        select: {
          championId: true,
          championName: true,
          kills: true,
          deaths: true,
          assists: true,
          teamId: true,
          teamIdSnapshot: true,
          totalDamageDealtToChampions: true,
          win: true,
          match: {
            select: {
              createdAt: true,
              participants: {
                select: {
                  teamId: true,
                  teamIdSnapshot: true,
                  totalDamageDealtToChampions: true,
                },
              },
            },
          },
        },
        orderBy: {
          match: {
            createdAt: "desc",
          },
        },
      });

      // 외부 매치 — Match.queueId가 5개 큐 중 하나인 행. userId 인덱스로 즉시 조회됨.
      const rankedRows = puuidSet.size
        ? await this.prisma.matchParticipant.findMany({
            where: {
              userId,
              match: {
                isInternal: false,
                queueId: { in: [420, 440, 400, 430, 450] },
                completedAt: { gte: seasonStart },
              },
            },
            select: {
              championId: true,
              championName: true,
              kills: true,
              deaths: true,
              assists: true,
              riotTeamId: true,
              totalDamageDealtToChampions: true,
              win: true,
              match: {
                select: {
                  completedAt: true,
                  createdAt: true,
                  participants: {
                    select: {
                      riotTeamId: true,
                      totalDamageDealtToChampions: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              match: {
                completedAt: "desc",
              },
            },
          })
        : [];

      const customParticipantRows =
        this.normalizeCustomParticipantRows(customRows);
      const rankedParticipantRows =
        this.normalizeRankedParticipantRows(rankedRows);
      const mergedRows = [...rankedParticipantRows, ...customParticipantRows];

      const knownPuuidRows = puuidSet.size
        ? await this.prisma.knownPuuid.findMany({
            where: {
              puuid: { in: Array.from(puuidSet) },
            },
            select: {
              rankedFetchedAt: true,
              normalFetchedAt: true,
              aramFetchedAt: true,
            },
          })
        : [];

      result = {
        stats: this.aggregateParticipantRows(mergedRows),
        matchCount: mergedRows.length,
        isPartial: knownPuuidRows.some(
          (row) =>
            row.rankedFetchedAt == null ||
            row.normalFetchedAt == null ||
            row.aramFetchedAt == null,
        ),
        recentGames: this.buildRecentGamesSnapshot(mergedRows),
      };
    } else {
      // ranked / normal / aram — 외부 인제스트 매치만 대상.
      const linkedAccounts = await this.getLinkedAccounts(userId);
      const puuidSet = new Set(linkedAccounts.map((account) => account.puuid));

      if (puuidSet.size === 0) {
        result = {
          stats: [],
          matchCount: 0,
          isPartial: false,
          recentGames: this.buildRecentGamesSnapshot([]),
        };
      } else {
        const queueIds = this.queueGroupToQueueIds[queueGroup];

        // 정형 테이블 직접 조회. (userId, match.queueId, completedAt) 모두 인덱스 적용.
        const rows = await this.prisma.matchParticipant.findMany({
          where: {
            userId,
            match: {
              isInternal: false,
              queueId: { in: queueIds },
              completedAt: { gte: seasonStart },
            },
          },
          select: {
            championId: true,
            championName: true,
            kills: true,
            deaths: true,
            assists: true,
            riotTeamId: true,
            totalDamageDealtToChampions: true,
            win: true,
            match: {
              select: {
                completedAt: true,
                createdAt: true,
                participants: {
                  select: {
                    riotTeamId: true,
                    totalDamageDealtToChampions: true,
                  },
                },
              },
            },
          },
          orderBy: {
            match: {
              completedAt: "desc",
            },
          },
        });

        const participantRows = this.normalizeRankedParticipantRows(rows);

        const knownPuuidRows = await this.prisma.knownPuuid.findMany({
          where: {
            puuid: { in: Array.from(puuidSet) },
          },
          select: {
            rankedFetchedAt: true,
            normalFetchedAt: true,
            aramFetchedAt: true,
          },
        });

        const fetchedField =
          queueGroup === "ranked"
            ? "rankedFetchedAt"
            : queueGroup === "normal"
              ? "normalFetchedAt"
              : "aramFetchedAt";

        result = {
          stats: this.aggregateParticipantRows(participantRows),
          matchCount: participantRows.length,
          isPartial: knownPuuidRows.some((row) => row[fetchedField] == null),
          recentGames: this.buildRecentGamesSnapshot(participantRows),
        };
      }
    }

    await this.persistChampionStatsCache(userId, queueGroup, season, result);

    return result;
  }

  async recomputeChampionStatsForUser(userId: string): Promise<void> {
    const queueGroups: QueueGroup[] = [
      "ranked",
      "normal",
      "aram",
      "custom",
      "all",
    ];
    for (const queueGroup of queueGroups) {
      await this.computeQueueGroupStats(userId, queueGroup);
    }

    await this.prisma.statsRecomputeQueue
      .delete({
        where: { userId },
      })
      .catch(() => undefined);
  }

  async getChampionStatsCacheByUserId(
    userId: string,
    queueGroup: QueueGroup = "ranked",
  ): Promise<ChampionStatsCacheResponse> {
    const cacheKey = this.getChampionStatsCacheKey(userId, queueGroup);
    const redisCached = await this.redis.get(cacheKey);
    if (redisCached) {
      return JSON.parse(redisCached);
    }

    const dbCached = await this.prisma.matchStatsCache.findUnique({
      where: {
        userId_queueGroup_season: {
          userId,
          queueGroup,
          season: this.getCurrentSeason(),
        },
      },
    });

    if (dbCached) {
      const response: ChampionStatsCacheResponse = {
        queueGroup: queueGroup,
        matchCount: dbCached.matchCount,
        isPartial: dbCached.isPartial,
        computedAt: dbCached.computedAt.toISOString(),
        stats: this.toRankedChampStatArray(dbCached.stats),
      };
      await this.redis.set(cacheKey, JSON.stringify(response), 3600);
      return response;
    }

    const computed = await this.computeQueueGroupStats(userId, queueGroup);
    return {
      queueGroup,
      matchCount: computed.matchCount,
      isPartial: computed.isPartial,
      computedAt: new Date().toISOString(),
      stats: computed.stats,
    };
  }

  async getChampionStatsCacheByRiotId(
    gameName: string,
    tagLine: string,
    queueGroup: QueueGroup = "ranked",
  ): Promise<ChampionStatsCacheResponse> {
    const found = await this.findUserByRiotAccount(gameName, tagLine);
    if (!found) {
      throw new NotFoundException("Summoner not found");
    }

    return this.getChampionStatsCacheByUserId(found.userId, queueGroup);
  }

  async enqueueStatsRefresh(
    userId: string,
    queueGroup: QueueGroup = "ranked",
  ): Promise<void> {
    const existingQueue = await this.prisma.statsRecomputeQueue.findUnique({
      where: { userId },
      select: {
        queuedAt: true,
      },
    });

    if (
      existingQueue?.queuedAt &&
      Date.now() - existingQueue.queuedAt.getTime() < 30 * 60 * 1000
    ) {
      throw new HttpException(
        "Stats refresh can only be requested once every 30 minutes",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.bumpKnownPuuidPriority(userId, queueGroup);
    await this.invalidateChampionStatsCaches(userId, queueGroup);

    await this.prisma.statsRecomputeQueue.upsert({
      where: { userId },
      create: {
        userId,
        reason: `manual-refresh:${queueGroup}`,
        queuedAt: new Date(),
      },
      update: {
        reason: `manual-refresh:${queueGroup}`,
        queuedAt: new Date(),
      },
    });
  }

  async getFetchStatus(userId: string) {
    const [user, knownPuuids, caches, queued] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          riotAccounts: {
            select: {
              puuid: true,
              gameName: true,
              tagLine: true,
              isPrimary: true,
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
          },
        },
      }),
      this.prisma.user
        .findUnique({
          where: { id: userId },
          select: {
            riotAccounts: {
              select: { puuid: true },
            },
          },
        })
        .then(async (user) => {
          const puuids =
            user?.riotAccounts.map((account) => account.puuid) ?? [];
          if (puuids.length === 0) return [];
          return this.prisma.knownPuuid.findMany({
            where: { puuid: { in: puuids } },
          });
        }),
      this.prisma.matchStatsCache.findMany({
        where: {
          userId,
          season: this.getCurrentSeason(),
        },
        select: {
          queueGroup: true,
          matchCount: true,
          isPartial: true,
          computedAt: true,
        },
      }),
      this.prisma.statsRecomputeQueue.findUnique({
        where: { userId },
      }),
    ]);

    if (!user) throw new NotFoundException("User not found");

    const latestFetchedAt = {
      ranked: knownPuuids.reduce<Date | null>(
        (acc, row) =>
          !acc || (row.rankedFetchedAt && row.rankedFetchedAt > acc)
            ? row.rankedFetchedAt
            : acc,
        null,
      ),
      normal: knownPuuids.reduce<Date | null>(
        (acc, row) =>
          !acc || (row.normalFetchedAt && row.normalFetchedAt > acc)
            ? row.normalFetchedAt
            : acc,
        null,
      ),
      aram: knownPuuids.reduce<Date | null>(
        (acc, row) =>
          !acc || (row.aramFetchedAt && row.aramFetchedAt > acc)
            ? row.aramFetchedAt
            : acc,
        null,
      ),
      custom: knownPuuids.reduce<Date | null>(
        (acc, row) =>
          !acc || (row.customFetchedAt && row.customFetchedAt > acc)
            ? row.customFetchedAt
            : acc,
        null,
      ),
    };

    return {
      userId,
      queuedAt: queued?.queuedAt?.toISOString() ?? null,
      accounts: user.riotAccounts,
      queueGroups: ["ranked", "normal", "aram", "custom", "all"].map(
        (queueGroup) => {
          const cache = caches.find((entry) => entry.queueGroup === queueGroup);
          return {
            queueGroup,
            fetchedAt:
              queueGroup === "all"
                ? null
                : (latestFetchedAt[
                    queueGroup as Exclude<QueueGroup, "all">
                  ]?.toISOString() ?? null),
            matchCount: cache?.matchCount ?? 0,
            isPartial: cache?.isPartial ?? false,
            computedAt: cache?.computedAt.toISOString() ?? null,
          };
        },
      ),
    };
  }

  /**
   * 유저와 프라이버시 설정을 한 번에 조회 — checkPrivacy + user.findUnique 통합
   * 기존: checkPrivacy(DB) + user.findUnique(DB) = 2회
   * 개선: user include settings = 1회
   */
  private async getUserWithSettings(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: {
          select: {
            showChampionStats: true,
            showRiotAccounts: true,
          },
        },
      },
    });
  }

  private isPrivacyAllowed(
    settings: {
      showChampionStats?: boolean;
      showRiotAccounts?: boolean;
    } | null,
    requesterId: string,
    userId: string,
    setting: "showChampionStats" | "showRiotAccounts",
  ): boolean {
    if (requesterId === userId) return true;
    return !settings || settings[setting] !== false;
  }

  /**
   * Get auction statistics for a user (captain count, sold prices, titles)
   */
  async getUserAuctionStats(
    userId: string,
    _requesterId?: string,
  ): Promise<AuctionStats> {
    const user = await this.getUserWithSettings(userId);
    if (!user) throw new NotFoundException("User not found");

    // 팀장 횟수
    const captainCount = await this.prisma.team.count({
      where: { captainId: userId },
    });

    // 경매 낙찰 기록 (soldPrice != null → 경매 대상으로 올라온 적 있음)
    const soldRecords = await this.prisma.teamMember.findMany({
      where: { userId, soldPrice: { not: null } },
      select: { soldPrice: true },
    });

    const totalAuctions = soldRecords.length;
    const soldPrices = soldRecords
      .map((r: (typeof soldRecords)[number]) => r.soldPrice!)
      .filter((p: number) => p > 0);
    const totalSold = soldPrices.length;
    const yuchalCount = totalAuctions - totalSold;
    const avgSoldPrice =
      totalSold > 0
        ? Math.round(
            soldPrices.reduce((s: number, p: number) => s + p, 0) / totalSold,
          )
        : 0;
    const maxSoldPrice = totalSold > 0 ? Math.max(...soldPrices) : 0;

    // 칭호 계산
    const titles: AuctionTitle[] = [];

    // 팀장 칭호
    if (captainCount >= 20) {
      titles.push({
        key: "born_leader",
        label: "타고난 리더",
        description: "20회 이상 팀장을 맡은 진정한 리더",
      });
    } else if (captainCount >= 10) {
      titles.push({
        key: "captain_master",
        label: "팀장 장인",
        description: "10회 이상 팀장을 역임한 베테랑",
      });
    } else if (captainCount >= 5) {
      titles.push({
        key: "regular_captain",
        label: "단골 팀장",
        description: "5회 이상 팀장을 맡은 경험자",
      });
    }

    // 평균 낙찰가 칭호
    if (avgSoldPrice >= 600) {
      titles.push({
        key: "superstar",
        label: "슈퍼스타",
        description: "평균 낙찰가 600 이상의 최고 몸값",
      });
    } else if (avgSoldPrice >= 400) {
      titles.push({
        key: "blue_chip",
        label: "블루칩",
        description: "평균 낙찰가 400 이상의 고가 선수",
      });
    } else if (avgSoldPrice >= 200) {
      titles.push({
        key: "high_value",
        label: "고가 용병",
        description: "평균 낙찰가 200 이상의 인기 선수",
      });
    }

    // 최고 낙찰가 칭호
    if (maxSoldPrice >= 800) {
      titles.push({
        key: "ace",
        label: "팀의 에이스",
        description: "최고 800 이상에 낙찰된 전설",
      });
    }

    // 경험 칭호
    if (totalAuctions >= 20) {
      titles.push({
        key: "veteran",
        label: "베테랑",
        description: "20회 이상 경매에 오른 고참 선수",
      });
    }

    return {
      captainCount,
      totalAuctions,
      totalSold,
      yuchalCount,
      avgSoldPrice,
      maxSoldPrice,
      titles,
    };
  }

  /**
   * Get champion statistics for a user
   */
  async getUserChampionStats(
    userId: string,
    requesterId?: string,
  ): Promise<ChampionStats[]> {
    const user = await this.getUserWithSettings(userId);
    if (!user) throw new NotFoundException("User not found");
    if (
      requesterId &&
      !this.isPrivacyAllowed(
        user.settings,
        requesterId,
        userId,
        "showChampionStats",
      )
    )
      return [];

    // Nexus 내전 통계만 집계한다. 외부 Riot 인제스트 매치는 같은 테이블에
    // userId가 매핑될 수 있으므로 반드시 roomId로 분리해야 한다.
    const participants = await this.prisma.matchParticipant.findMany({
      where: {
        userId,
        match: {
          isInternal: true,
        },
      },
      select: {
        championId: true,
        championName: true,
        kills: true,
        deaths: true,
        assists: true,
        totalMinionsKilled: true,
        neutralMinionsKilled: true,
        goldEarned: true,
        totalDamageDealtToChampions: true,
        win: true,
      },
    });

    // Aggregate stats by champion
    const statsMap = new Map<number, ChampionStats>();

    participants.forEach((p: (typeof participants)[number]) => {
      const existing = statsMap.get(p.championId);
      if (existing) {
        existing.games++;
        if (p.win) existing.wins++;
        else existing.losses++;
        existing.kills += p.kills;
        existing.deaths += p.deaths;
        existing.assists += p.assists;
        existing.totalMinionsKilled += p.totalMinionsKilled;
        existing.neutralMinionsKilled += p.neutralMinionsKilled;
        existing.goldEarned += p.goldEarned;
        existing.totalDamageDealtToChampions += p.totalDamageDealtToChampions;
      } else {
        statsMap.set(p.championId, {
          championId: p.championId,
          championName: p.championName,
          // 영문 챔피언명을 한글로 변환하여 추가 (기존 영문 필드는 유지)
          championNameKorean: getChampionKoreanName(p.championName),
          games: 1,
          wins: p.win ? 1 : 0,
          losses: p.win ? 0 : 1,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          totalMinionsKilled: p.totalMinionsKilled,
          neutralMinionsKilled: p.neutralMinionsKilled,
          goldEarned: p.goldEarned,
          totalDamageDealtToChampions: p.totalDamageDealtToChampions,
        });
      }
    });

    // Convert to array and sort by games played
    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  }

  /**
   * Get position statistics for a user
   */
  async getUserPositionStats(
    userId: string,
    _requesterId?: string,
  ): Promise<PositionStats[]> {
    const user = await this.getUserWithSettings(userId);
    if (!user) throw new NotFoundException("User not found");

    // Nexus 내전 통계만 집계한다. 외부 Riot 인제스트 매치는 같은 테이블에
    // userId가 매핑될 수 있으므로 반드시 roomId로 분리해야 한다.
    const participants = await this.prisma.matchParticipant.findMany({
      where: {
        userId,
        match: {
          isInternal: true,
        },
      },
      select: {
        position: true,
        kills: true,
        deaths: true,
        assists: true,
        win: true,
      },
    });

    // Aggregate stats by position
    const statsMap = new Map<string, PositionStats>();

    participants.forEach((p: (typeof participants)[number]) => {
      const position = p.position || "UNKNOWN";
      const existing = statsMap.get(position);
      if (existing) {
        existing.games++;
        if (p.win) existing.wins++;
        else existing.losses++;
        existing.kills += p.kills;
        existing.deaths += p.deaths;
        existing.assists += p.assists;
      } else {
        statsMap.set(position, {
          position,
          games: 1,
          wins: p.win ? 1 : 0,
          losses: p.win ? 0 : 1,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
        });
      }
    });

    // Convert to array and sort by games played
    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  }

  /**
   * Find user by Riot account (gameName + tagLine)
   */
  async findUserByRiotAccount(
    gameName: string,
    tagLine: string,
  ): Promise<{ userId: string; riotAccount: any } | null> {
    const riotAccount = await this.prisma.riotAccount.findFirst({
      where: {
        gameName: {
          equals: gameName,
          mode: "insensitive",
        },
        tagLine: {
          equals: tagLine,
          mode: "insensitive",
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    if (!riotAccount) {
      return null;
    }

    return {
      userId: riotAccount.userId,
      riotAccount: {
        id: riotAccount.id,
        gameName: riotAccount.gameName,
        tagLine: riotAccount.tagLine,
        puuid: riotAccount.puuid,
        tier: riotAccount.tier,
        rank: riotAccount.rank,
        lp: riotAccount.lp, // Changed from leaguePoints
        isPrimary: riotAccount.isPrimary,
        user: riotAccount.user,
      },
    };
  }

  /**
   * Get user's Riot accounts
   */
  async getUserRiotAccounts(userId: string, requesterId?: string) {
    // settings 포함 조회 후 프라이버시 체크 (기존 checkPrivacy + user.findUnique 2회 → 1회)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: { select: { showRiotAccounts: true } },
        riotAccounts: {
          select: {
            id: true,
            gameName: true,
            tagLine: true,
            tier: true,
            rank: true,
            lp: true,
            isPrimary: true,
            mainRole: true,
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!user) throw new NotFoundException("User not found");
    if (
      requesterId &&
      !this.isPrivacyAllowed(
        user.settings,
        requesterId,
        userId,
        "showRiotAccounts",
      )
    )
      return [];

    return user.riotAccounts;
  }

  /**
   * Search users by username
   */
  async searchUsers(query: string, limit: number = 10) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        username: {
          contains: query.trim(),
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        createdAt: true,
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
      take: limit,
      orderBy: {
        username: "asc",
      },
    });

    return users.map((user: (typeof users)[number]) => ({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      createdAt: user.createdAt,
      primaryRiotAccount: user.riotAccounts[0] || null,
    }));
  }

  /**
   * Get Riot match history for a summoner by gameName + tagLine
   */
  async getRiotMatchHistory(
    gameName: string,
    tagLine: string,
    count: number = 20,
    queueId?: number,
    start: number = 0,
  ) {
    // First, get the summoner info to get PUUID
    const summonerInfo = await this.riotService.getSummonerByRiotId(
      gameName,
      tagLine,
    );

    if (!summonerInfo) {
      throw new NotFoundException("Summoner not found");
    }

    // Fetch match history using PUUID
    const matches = await this.riotMatchService.getMatchHistoryByPuuid(
      summonerInfo.puuid,
      count,
      queueId,
      start,
    );

    return matches;
  }

  /**
   * Get match timeline (item purchases, gold/CS/XP per minute)
   */
  async getMatchTimeline(matchId: string) {
    const timeline = await this.riotMatchService.getMatchTimeline(matchId);
    await this.persistMatchTimelineSummary(matchId, timeline);
    return timeline;
  }

  private extractTimelineParticipantSummaries(timeline: any): Map<
    string,
    {
      itemPurchaseOrder: Array<{
        itemId: number;
        minute: number;
        timestamp: number;
      }>;
      skillOrder: Array<{
        skillSlot: number;
        levelUpType?: string;
        minute: number;
        timestamp: number;
      }>;
    }
  > {
    const participantPuuids: unknown = timeline?.metadata?.participants;
    if (!Array.isArray(participantPuuids)) return new Map();

    const byParticipantId = new Map<
      number,
      {
        puuid: string;
        itemPurchaseOrder: Array<{
          itemId: number;
          minute: number;
          timestamp: number;
        }>;
        skillOrder: Array<{
          skillSlot: number;
          levelUpType?: string;
          minute: number;
          timestamp: number;
        }>;
      }
    >();

    participantPuuids.forEach((puuid, index) => {
      if (typeof puuid === "string" && puuid.length > 0) {
        byParticipantId.set(index + 1, {
          puuid,
          itemPurchaseOrder: [],
          skillOrder: [],
        });
      }
    });

    const frames: unknown = timeline?.info?.frames;
    if (!Array.isArray(frames)) return new Map();

    for (const frame of frames) {
      const events: unknown = frame?.events;
      if (!Array.isArray(events)) continue;

      for (const event of events) {
        const participantId = Number(event?.participantId);
        const summary = byParticipantId.get(participantId);
        if (!summary) continue;

        const timestamp = Number(event?.timestamp ?? 0);
        const minute = Math.max(0, Math.floor(timestamp / 60000));

        if (event?.type === "ITEM_PURCHASED") {
          const itemId = Number(event?.itemId);
          if (Number.isInteger(itemId) && itemId > 0) {
            summary.itemPurchaseOrder.push({ itemId, minute, timestamp });
          }
        }

        if (event?.type === "SKILL_LEVEL_UP") {
          const skillSlot = Number(event?.skillSlot);
          if (Number.isInteger(skillSlot) && skillSlot > 0) {
            summary.skillOrder.push({
              skillSlot,
              levelUpType:
                typeof event?.levelUpType === "string"
                  ? event.levelUpType
                  : undefined,
              minute,
              timestamp,
            });
          }
        }
      }
    }

    return new Map(
      Array.from(byParticipantId.values()).map((summary) => [
        summary.puuid,
        {
          itemPurchaseOrder: summary.itemPurchaseOrder,
          skillOrder: summary.skillOrder,
        },
      ]),
    );
  }

  private async persistMatchTimelineSummary(
    requestedMatchId: string,
    timeline: any,
  ): Promise<void> {
    if (!timeline) return;

    const riotMatchId =
      typeof timeline?.metadata?.matchId === "string"
        ? timeline.metadata.matchId
        : requestedMatchId;
    const summaries = this.extractTimelineParticipantSummaries(timeline);
    if (summaries.size === 0) return;

    const match = await this.prisma.match.findFirst({
      where: { riotMatchId },
      select: {
        id: true,
        participants: {
          select: {
            id: true,
            puuid: true,
          },
        },
      },
    });

    if (!match) return;

    const extractedAt = new Date();
    const updates = match.participants
      .map((participant) => {
        if (!participant.puuid) return null;
        const summary = summaries.get(participant.puuid);
        if (!summary) return null;

        return this.prisma.matchParticipant.update({
          where: { id: participant.id },
          data: {
            itemPurchaseOrder:
              summary.itemPurchaseOrder as unknown as Prisma.JsonArray,
            skillOrder: summary.skillOrder as unknown as Prisma.JsonArray,
            timelineExtractedAt: extractedAt,
          },
        });
      })
      .filter(
        (update): update is NonNullable<typeof update> => update !== null,
      );

    if (updates.length === 0) return;

    try {
      await this.prisma.$transaction(updates);
    } catch (error) {
      this.logger.warn(
        `Failed to persist timeline summary for ${riotMatchId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Get Riot match history for a user (uses primary Riot account)
   */
  async getUserRiotMatchHistory(
    userId: string,
    count: number = 20,
    queueId?: number,
  ) {
    // Get user's primary Riot account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        riotAccounts: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.riotAccounts.length === 0) {
      throw new NotFoundException("User has no linked Riot account");
    }

    const primaryAccount = user.riotAccounts[0];

    // Fetch match history using PUUID
    const matches = await this.riotMatchService.getMatchHistoryByPuuid(
      primaryAccount.puuid,
      count,
      queueId,
    );

    return matches;
  }

  /**
   * 랭크 게임 챔피언별 시즌 전체 통계
   * - Redis 캐시 (10분) → 즉시 반환
   * - 솔로(420) + 자유(440) 랭크 매치 ID를 100개씩 전부 페이징
   * - 각 매치는 DB 캐시 우선 조회 → 없으면 Riot API 호출 후 DB에 저장
   * - 매치 상세는 5개씩 배치 순차 처리 (rate limit 보호)
   */
  async getRankedChampionStats(gameName: string, tagLine: string) {
    const response = await this.getChampionStatsCacheByRiotId(
      gameName,
      tagLine,
      "ranked",
    );
    return response.stats;
  }

  private computeChampionStatsFromMatches(
    matches: MatchDto[],
    puuid: string,
  ): Array<{
    championId: number;
    championName: string;
    games: number;
    wins: number;
    losses: number;
    kills: number;
    deaths: number;
    assists: number;
  }> {
    const map = new Map<
      number,
      {
        championId: number;
        championName: string;
        games: number;
        wins: number;
        losses: number;
        kills: number;
        deaths: number;
        assists: number;
      }
    >();

    for (const match of matches) {
      const p = match.info.participants.find((x) => x.puuid === puuid);
      if (!p) continue;

      const existing = map.get(p.championId);
      if (existing) {
        existing.games++;
        if (p.win) existing.wins++;
        else existing.losses++;
        existing.kills += p.kills;
        existing.deaths += p.deaths;
        existing.assists += p.assists;
      } else {
        map.set(p.championId, {
          championId: p.championId,
          championName: p.championName,
          games: 1,
          wins: p.win ? 1 : 0,
          losses: p.win ? 0 : 1,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.games - a.games);
  }

  // ========================================
  // 챔피언 시즌 통계 — 증분 누적 (match-v5 스캔)
  // ========================================

  private readonly MAX_SEASON_SCAN = 100; // puuid당 최대 스캔 깊이
  private readonly SEASON_RESCAN_THROTTLE_MS = 30 * 60 * 1000; // 재스캔 최소 간격
  // 한 건 스캔은 매치 최대 100건 조회라 레이트리밋에 걸려도 수 분 안에 끝난다.
  // 그보다 오래 "scanning" 이면 워커가 죽은 것으로 본다.
  private readonly SCAN_STALL_TIMEOUT_MS = 15 * 60 * 1000;

  // 누적된 챔피언 시즌 통계를 반환하고, 오래됐으면 background 스캔을 큐에 넣는다.
  // 현재 ranked 그룹만 지원(type="ranked" = 솔로+자유).
  async getChampionSeasonStats(
    gameName: string,
    tagLine: string,
    queueGroup: "ranked" = "ranked",
    options?: { priority?: number },
  ) {
    const summoner = await this.riotService.getSummonerByRiotId(
      gameName,
      tagLine,
    );
    const puuid: string = summoner.puuid;
    const season = this.getCurrentSeason();

    const [rows, state] = await Promise.all([
      this.prisma.championSeasonStat.findMany({
        where: { puuid, season, queueGroup },
        orderBy: { games: "desc" },
      }),
      this.prisma.championScanState.findUnique({
        where: {
          puuid_season_queueGroup: { puuid, season, queueGroup },
        },
      }),
    ]);

    const now = Date.now();
    const isIdleStatus =
      !state ||
      state.status === "idle" ||
      state.status === "done" ||
      state.status === "error";
    const throttleElapsed =
      !state?.lastScanAt ||
      now - state.lastScanAt.getTime() > this.SEASON_RESCAN_THROTTLE_MS;
    const shouldEnqueue = isIdleStatus && throttleElapsed;

    if (shouldEnqueue) {
      await this.enqueueChampionScan(
        puuid,
        season,
        queueGroup,
        options?.priority ?? 0,
      );
    }

    const stats = rows.map((r) => ({
      championId: r.championId,
      championName: r.championName,
      championNameKorean: getChampionKoreanName(r.championName),
      games: r.games,
      wins: r.wins,
      losses: r.games - r.wins,
      kills: r.kills,
      deaths: r.deaths,
      assists: r.assists,
    }));

    return {
      queueGroup,
      season,
      stats,
      // 큐에 넣었으면 즉시 queued로 보고(프론트 "수집 중" 표시)
      status: shouldEnqueue ? "queued" : (state?.status ?? "queued"),
      scannedCount: state?.scannedCount ?? 0,
      lastScanAt: state?.lastScanAt ?? null,
    };
  }

  /**
   * 여러 puuid 를 한 번에 스캔 큐에 넣는다 (방 입장 등에서 미리 채워두는 용도).
   *
   * 이미 진행 중이거나 최근에 스캔한 건은 건드리지 않는다 — 방을 드나들 때마다
   * 같은 사람을 다시 큐에 넣으면 배경 예산을 그 사람에게만 쓰게 된다.
   *
   * @returns 실제로 큐에 넣은 수
   */
  async enqueueChampionScanForPuuids(
    puuids: string[],
    priority = 0,
  ): Promise<number> {
    const unique = [...new Set(puuids.filter((puuid) => !!puuid))];
    if (unique.length === 0) return 0;

    const season = this.getCurrentSeason();
    const queueGroup = "ranked";
    const existing = await this.prisma.championScanState.findMany({
      where: { puuid: { in: unique }, season, queueGroup },
      select: { puuid: true, status: true, lastScanAt: true },
    });
    const stateByPuuid = new Map(existing.map((row) => [row.puuid, row]));

    const now = Date.now();
    let enqueued = 0;
    for (const puuid of unique) {
      const state = stateByPuuid.get(puuid);
      if (state) {
        const busy = state.status === "queued" || state.status === "scanning";
        const recentlyScanned =
          !!state.lastScanAt &&
          now - state.lastScanAt.getTime() <= this.SEASON_RESCAN_THROTTLE_MS;
        if (busy || recentlyScanned) continue;
      }

      try {
        await this.enqueueChampionScan(puuid, season, queueGroup, priority);
        enqueued++;
      } catch (error) {
        this.logger.warn(`스캔 큐잉 실패 (${puuid}): ${error}`);
      }
    }
    return enqueued;
  }

  /**
   * 아직 한 번도 스캔된 적 없는 우리 유저 계정을 배경 백필 큐에 넣는다.
   *
   * 매치 수집은 지금까지 "누군가 그 사람의 전적 화면을 열었을 때"만 일어나서,
   * 라이엇 연동 계정 대부분이 라인별 전적 없이 남아 있었다. 서버가 한가할 때만
   * 조금씩 채운다.
   *
   * @returns 실제로 큐에 넣은 수
   */
  async enqueueChampionScanBackfill(limit = 4): Promise<number> {
    const season = this.getCurrentSeason();
    const queueGroup = "ranked";

    // 큐가 이미 밀려 있으면 더 쌓지 않는다 — 워커는 틱당 몇 건만 소화한다.
    const pending = await this.prisma.championScanState.count({
      where: { season, queueGroup, status: { in: ["queued", "scanning"] } },
    });
    if (pending >= limit) return 0;

    const rows = await this.prisma.$queryRaw<{ puuid: string }[]>`
      SELECT r.puuid
      FROM riot_accounts r
      WHERE r.puuid IS NOT NULL
        AND r.puuid <> ''
        AND NOT EXISTS (
          SELECT 1 FROM champion_scan_states c
          WHERE c.puuid = r.puuid
            AND c.season = ${season}
            AND c."queueGroup" = ${queueGroup}
            -- 실패로 끝난 계정은 한동안 쉬었다가 다시 시도한다. 이 조건이
            -- 없으면 한 번 실패한 계정은 상태 행이 남아 영영 백필에서 빠진다.
            AND (
              c.status <> 'error'
              OR c."lastScanAt" IS NULL
              OR c."lastScanAt" > NOW() - INTERVAL '6 hours'
            )
        )
      ORDER BY r."isPrimary" DESC, r."createdAt" ASC
      LIMIT ${limit - pending}
    `;
    if (rows.length === 0) return 0;

    // 사람이 기다리는 요청(priority >= 0)보다 항상 뒤로 밀리게 둔다.
    return this.enqueueChampionScanForPuuids(
      rows.map((row) => row.puuid),
      SCAN_BACKFILL_PRIORITY,
    );
  }

  private async enqueueChampionScan(
    puuid: string,
    season: string,
    queueGroup: string,
    priority: number,
  ): Promise<void> {
    await this.prisma.championScanState.upsert({
      where: { puuid_season_queueGroup: { puuid, season, queueGroup } },
      create: {
        puuid,
        season,
        queueGroup,
        status: "queued",
        priority,
        requestedAt: new Date(),
      },
      update: {
        status: "queued",
        // 더 높은 우선순위 요청이 오면 승격
        priority: { set: priority },
        requestedAt: new Date(),
      },
    });
  }

  /**
   * 워커가 스캔 도중 죽으면 그 항목은 status="scanning" 으로 남는다.
   * 큐 처리는 "queued" 만 집고, 재큐잉 조건(idle/done/error)에도 "scanning" 은
   * 없어서 한번 이렇게 되면 영원히 복구되지 않는다. 실제로 운영에서 4건이
   * 이 상태로 묶여 있었다. 오래 묵은 항목을 큐로 되돌린다.
   */
  async requeueStalledChampionScans(): Promise<number> {
    const stalledBefore = new Date(Date.now() - this.SCAN_STALL_TIMEOUT_MS);
    const { count } = await this.prisma.championScanState.updateMany({
      where: {
        status: "scanning",
        // requestedAt 은 큐에 넣을 때 항상 갱신되므로 이 값이 오래됐다는 건
        // 집어간 뒤로 끝내지 못했다는 뜻이다.
        requestedAt: { lt: stalledBefore },
      },
      data: { status: "queued" },
    });

    if (count > 0) {
      this.logger.warn(
        `중단된 챔피언 시즌 스캔 ${count}건을 큐로 되돌렸습니다.`,
      );
    }
    return count;
  }

  // background 워커가 호출: 큐에 쌓인 스캔을 우선순위/요청순으로 처리.
  async processChampionScanQueue(
    limit = 2,
    minPriority?: number,
  ): Promise<number> {
    // 죽은 작업을 먼저 회수해야 큐가 막히지 않는다.
    await this.requeueStalledChampionScans();

    // 한 건이 매치 100개라 Riot 예산(95/2분) 안에 못 끝난다. 진행 중인 게
    // 남아 있는데 새로 집으면 서로 예산을 뺏어 전부 느려지고, 사람이 기다리는
    // 전적 검색까지 밀린다.
    const running = await this.prisma.championScanState.count({
      where: { status: "scanning" },
    });
    if (running >= MAX_CONCURRENT_SCANS) return 0;

    const queued = await this.prisma.championScanState.findMany({
      where: {
        status: "queued",
        // 서버가 붐빌 때는 배경 백필(낮은 우선순위)을 건너뛰고 사람이
        // 기다리는 요청만 처리한다. Riot 예산이 하나뿐이라 둘이 경쟁한다.
        ...(minPriority !== undefined
          ? { priority: { gte: minPriority } }
          : {}),
      },
      orderBy: [{ priority: "desc" }, { requestedAt: "asc" }],
      take: Math.max(0, Math.min(limit, MAX_CONCURRENT_SCANS - running)),
    });

    let processed = 0;
    for (const job of queued) {
      try {
        await this.prisma.championScanState.update({
          where: { id: job.id },
          // 큐에서 오래 기다린 정상 작업을 stalled 작업으로 오인하지 않도록
          // 실제 스캔 시작 시각을 다시 기록한다.
          data: { status: "scanning", requestedAt: new Date() },
        });
        await this.scanChampionSeasonForPuuid(
          job.puuid,
          job.season,
          job.queueGroup,
        );
        processed++;
      } catch (error) {
        this.logger.warn(
          `챔피언 시즌 스캔 실패 (${job.puuid}/${job.queueGroup}): ${error}`,
        );
        await this.prisma.championScanState
          .update({
            where: { id: job.id },
            data: { status: "error", lastScanAt: new Date() },
          })
          .catch(() => undefined);
      }
    }
    return processed;
  }

  // 한 puuid의 ranked 시즌 매치(최대 MAX_SEASON_SCAN)를 스캔해 챔피언 통계를 전체 교체.
  // 매치는 DB 캐시 우선이라 재스캔 시 신규분만 Riot API 예산을 소모한다.
  private async scanChampionSeasonForPuuid(
    puuid: string,
    season: string,
    queueGroup: string,
  ): Promise<void> {
    const seasonStartSec = Math.floor(
      this.getSeasonStartDate().getTime() / 1000,
    );

    // ranked = 솔로+자유 (type="ranked"). 시즌 시작 이후 최신 매치 ID.
    const matchIds = await this.riotMatchService.getMatchIdsByPuuid(
      puuid,
      0,
      this.MAX_SEASON_SCAN,
      undefined,
      "ranked",
      3,
      seasonStartSec,
      undefined,
      "background",
      { throwOnFailure: true },
    );

    const agg = new Map<
      number,
      {
        championId: number;
        championName: string;
        games: number;
        wins: number;
        kills: number;
        deaths: number;
        assists: number;
      }
    >();

    for (const matchId of matchIds) {
      const match = await this.riotMatchService.getMatchById(
        matchId,
        3,
        "background",
      );
      // 한 경기라도 상세 조회에 실패한 상태로 전체 교체하면 기존 승패가
      // 부분 집계로 줄어든다. 이번 스캔을 실패 처리해 이전 통계를 보존한다.
      if (!match) {
        throw new Error(
          `Incomplete champion scan: match ${matchId} unavailable`,
        );
      }
      // 방어적 큐 필터 (솔로 420 / 자유 440)
      if (![420, 440].includes(match.info?.queueId ?? 0)) continue;

      const p = match.info.participants.find((x) => x.puuid === puuid);
      if (!p) continue;

      const cur = agg.get(p.championId) ?? {
        championId: p.championId,
        championName: p.championName,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
      };
      cur.games++;
      if (p.win) cur.wins++;
      cur.kills += p.kills;
      cur.deaths += p.deaths;
      cur.assists += p.assists;
      agg.set(p.championId, cur);
    }

    const rows = Array.from(agg.values());

    // 전체 교체(멱등): 기존 행 삭제 후 일괄 삽입 + 상태 갱신
    await this.prisma.$transaction([
      this.prisma.championSeasonStat.deleteMany({
        where: { puuid, season, queueGroup },
      }),
      ...(rows.length > 0
        ? [
            this.prisma.championSeasonStat.createMany({
              data: rows.map((r) => ({
                puuid,
                season,
                queueGroup,
                championId: r.championId,
                championName: r.championName,
                games: r.games,
                wins: r.wins,
                kills: r.kills,
                deaths: r.deaths,
                assists: r.assists,
              })),
            }),
          ]
        : []),
      this.prisma.championScanState.update({
        where: { puuid_season_queueGroup: { puuid, season, queueGroup } },
        data: {
          status: "done",
          scannedCount: matchIds.length,
          lastScanAt: new Date(),
        },
      }),
    ]);
  }
}
