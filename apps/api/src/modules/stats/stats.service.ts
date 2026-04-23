import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { RiotMatchService } from "../riot/riot-match.service";
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

export interface LabUserProfileFallbackChampion {
  championId: number;
  championName: string;
  championNameKorean: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  avgKda: number;
}

export interface LabUserProfileFallbackResponse {
  userId: string;
  customGames: number;
  threshold: number;
  message: string;
  summary: {
    rankedGames: number;
    wins: number;
    losses: number;
    winRate: number;
    avgKda: number;
  };
  champions: LabUserProfileFallbackChampion[];
}

export interface LabUserProfileCompareEntry {
  championId: number;
  championName: string;
  championNameKorean: string;
  ranked: {
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    avgKda: number;
  };
  custom: {
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    avgKda: number;
  };
  delta: {
    games: number;
    winRate: number;
    avgKda: number;
  };
  signal: "ranked-favored" | "scrim-favored" | "aligned" | "insufficient-data";
}

export interface LabUserProfileCompareResponse {
  userId: string;
  summary: {
    rankedGames: number;
    customGames: number;
    rankedWinRate: number;
    customWinRate: number;
    rankedAvgKda: number;
    customAvgKda: number;
    winRateDelta: number;
    avgKdaDelta: number;
  };
  champions: LabUserProfileCompareEntry[];
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

export interface LabSampleOverview {
  matchesWithStats: number;
  participantRows: number;
  playersInDataset: number;
  championsInDataset: number;
  itemSelections: number;
  recentMatches30d: number;
}

export interface LabLaneProfile {
  position: string;
  games: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamage: number;
  avgGold: number;
}

export interface LabChampionSignal {
  championId: number;
  championName: string;
  championNameKorean: string;
  games: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
}

export interface LabItemTrend {
  itemId: number;
  picks: number;
  uniqueUsers: number;
}

export interface LabMasteryLeader {
  userId: string;
  username: string;
  avatar: string | null;
  championId: number;
  championName: string;
  championNameKorean: string;
  games: number;
  winRate: number;
  avgKda: number;
  masteryScore: number;
}

export interface LabSeededChampionLeader {
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  championId: number;
  championName: string;
  championNameKorean: string;
  games: number;
  winRate: number;
  avgKda: number;
  lastGameAt: string;
}

export interface LabOverview {
  sample: LabSampleOverview;
  laneProfiles: LabLaneProfile[];
  championSignals: LabChampionSignal[];
  itemTrends: LabItemTrend[];
  masteryLeaders: LabMasteryLeader[];
  seededChampionLeaders: LabSeededChampionLeader[];
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly riotMatchService: RiotMatchService,
    private readonly riotService: RiotService,
  ) {}

  private readonly queueGroupToQueueIds: Record<
    Exclude<QueueGroup, "custom" | "all">,
    number[]
  > = {
    ranked: [420, 440],
    normal: [400, 430],
    aram: [450],
  };

  private getCurrentSeason(): string {
    return String(new Date().getUTCFullYear());
  }

  private getSeasonStartDate(): Date {
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

  private computeStatWinRate(stat: RankedChampStat): number {
    return stat.games > 0 ? stat.wins / stat.games : 0;
  }

  private computeStatAvgKda(stat: RankedChampStat): number {
    return stat.games > 0
      ? (stat.kills + stat.assists) / Math.max(stat.deaths, 1)
      : 0;
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

  private extractStatsFromRiotMatchCacheRows(
    rows: Array<{ data: Prisma.JsonValue; gameEnd: Date }>,
    puuidSet: Set<string>,
  ): {
    stats: RankedChampStat[];
    matchCount: number;
    recentGames: RecentGamesSnapshot;
  } {
    const participantRows = this.extractParticipantRowsFromRiotMatchCacheRows(
      rows,
      puuidSet,
    );
    return {
      stats: this.aggregateParticipantRows(participantRows),
      matchCount: participantRows.length,
      recentGames: this.buildRecentGamesSnapshot(participantRows),
    };
  }

  private extractParticipantRowsFromRiotMatchCacheRows(
    rows: Array<{ data: Prisma.JsonValue; gameEnd: Date }>,
    puuidSet: Set<string>,
  ): CacheParticipantRow[] {
    const participantRows: CacheParticipantRow[] = [];

    for (const row of rows) {
      const match = row.data as any;
      const participants = match?.info?.participants;
      if (!Array.isArray(participants)) continue;

      const participant = participants.find((p: any) => puuidSet.has(p.puuid));
      if (!participant) continue;
      const teamDamage = participants
        .filter((p: any) => p.teamId === participant.teamId)
        .reduce(
          (sum: number, p: any) => sum + (p.totalDamageDealtToChampions ?? 0),
          0,
        );

      participantRows.push({
        championId: participant.championId,
        championName: participant.championName,
        kills: participant.kills ?? 0,
        deaths: participant.deaths ?? 0,
        assists: participant.assists ?? 0,
        win: Boolean(participant.win),
        playedAt: row.gameEnd,
        damageShare:
          teamDamage > 0
            ? this.roundMetric(
                (participant.totalDamageDealtToChampions ?? 0) / teamDamage,
              )
            : 0,
      });
    }

    return participantRows;
  }

  private normalizeCustomParticipantRows(
    rows: Array<{
      championId: number;
      championName: string;
      kills: number;
      deaths: number;
      assists: number;
      win: boolean;
      // 외부 인제스트 매치는 teamId NULL — 팀 데미지 집계 시 같은 팀(NULL=NULL) 매칭은 제외된다.
      teamId: string | null;
      totalDamageDealtToChampions: number;
      match: {
        createdAt: Date;
        participants: Array<{
          teamId: string | null;
          totalDamageDealtToChampions: number;
        }>;
      };
    }>,
  ): CacheParticipantRow[] {
    return rows.map((row) => {
      const teamDamage = row.match.participants
        .filter((participant) => participant.teamId === row.teamId)
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
      });
      const rows = await this.prisma.matchParticipant.findMany({
        where: {
          userId,
          match: {
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
          totalDamageDealtToChampions: true,
          win: true,
          match: {
            select: {
              createdAt: true,
              participants: {
                select: {
                  teamId: true,
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
      const linkedAccounts = await this.getLinkedAccounts(userId);
      const puuidSet = new Set(linkedAccounts.map((account) => account.puuid));

      const riotRows = puuidSet.size
        ? await this.prisma.riotMatchCache.findMany({
            where: {
              queueId: { in: [420, 440, 400, 430, 450] },
              gameEnd: { gte: seasonStart },
            },
            select: { data: true, gameEnd: true },
            orderBy: { gameEnd: "desc" },
          })
        : [];

      const customRows = await this.prisma.matchParticipant.findMany({
        where: {
          userId,
          match: {
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
          totalDamageDealtToChampions: true,
          win: true,
          match: {
            select: {
              createdAt: true,
              participants: {
                select: {
                  teamId: true,
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

      const riotParticipantRows =
        this.extractParticipantRowsFromRiotMatchCacheRows(riotRows, puuidSet);
      const customParticipantRows =
        this.normalizeCustomParticipantRows(customRows);
      const mergedRows = [...riotParticipantRows, ...customParticipantRows];

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
        const rows = await this.prisma.riotMatchCache.findMany({
          where: {
            queueId: { in: queueIds },
            gameEnd: { gte: seasonStart },
          },
          select: {
            data: true,
            gameEnd: true,
          },
          orderBy: {
            gameEnd: "desc",
          },
        });

        const riotResult = this.extractStatsFromRiotMatchCacheRows(
          rows,
          puuidSet,
        );

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
          stats: riotResult.stats,
          matchCount: riotResult.matchCount,
          isPartial: knownPuuidRows.some((row) => row[fetchedField] == null),
          recentGames: riotResult.recentGames,
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

  async getLabUserProfileFallback(
    userId: string,
    requesterId?: string,
  ): Promise<LabUserProfileFallbackResponse> {
    const user = await this.getUserWithSettings(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (
      requesterId &&
      !this.isPrivacyAllowed(
        user.settings,
        requesterId,
        userId,
        "showChampionStats",
      )
    ) {
      throw new ForbiddenException("Champion stats are private");
    }

    const [customCache, rankedCache] = await Promise.all([
      this.getChampionStatsCacheByUserId(userId, "custom"),
      this.getChampionStatsCacheByUserId(userId, "ranked"),
    ]);

    if (customCache.matchCount >= 10) {
      throw new NotFoundException(
        "Lab fallback is only available for users with fewer than 10 custom games",
      );
    }

    const champions = rankedCache.stats.map((stat) => {
      const avgKda =
        stat.games > 0
          ? (stat.kills + stat.assists) / Math.max(stat.deaths, 1)
          : 0;
      const winRate = stat.games > 0 ? stat.wins / stat.games : 0;

      return {
        championId: stat.championId,
        championName: stat.championName,
        championNameKorean: stat.championNameKorean,
        games: stat.games,
        wins: stat.wins,
        losses: stat.losses,
        winRate: this.roundMetric(winRate, 4),
        avgKda: this.roundMetric(avgKda, 2),
      };
    });

    const rankedGames = champions.reduce(
      (sum, champion) => sum + champion.games,
      0,
    );
    const wins = champions.reduce((sum, champion) => sum + champion.wins, 0);
    const losses = champions.reduce(
      (sum, champion) => sum + champion.losses,
      0,
    );
    const totalKills = rankedCache.stats.reduce(
      (sum, champion) => sum + champion.kills,
      0,
    );
    const totalDeaths = rankedCache.stats.reduce(
      (sum, champion) => sum + champion.deaths,
      0,
    );
    const totalAssists = rankedCache.stats.reduce(
      (sum, champion) => sum + champion.assists,
      0,
    );

    return {
      userId,
      customGames: customCache.matchCount,
      threshold: 10,
      message:
        "랭크 전적 기반 성향 참고 데이터입니다. 내전 데이터와는 별도로 해석해야 합니다.",
      summary: {
        rankedGames,
        wins,
        losses,
        winRate: rankedGames > 0 ? this.roundMetric(wins / rankedGames, 4) : 0,
        avgKda:
          rankedGames > 0
            ? this.roundMetric(
                (totalKills + totalAssists) / Math.max(totalDeaths, 1),
                2,
              )
            : 0,
      },
      champions,
    };
  }

  async getLabUserProfileComparison(
    userId: string,
    requesterId?: string,
  ): Promise<LabUserProfileCompareResponse> {
    const user = await this.getUserWithSettings(userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (
      requesterId &&
      !this.isPrivacyAllowed(
        user.settings,
        requesterId,
        userId,
        "showChampionStats",
      )
    ) {
      throw new ForbiddenException("Champion stats are private");
    }

    const [rankedCache, customCache] = await Promise.all([
      this.getChampionStatsCacheByUserId(userId, "ranked"),
      this.getChampionStatsCacheByUserId(userId, "custom"),
    ]);

    const rankedMap = new Map(
      rankedCache.stats.map((stat) => [stat.championId, stat] as const),
    );
    const customMap = new Map(
      customCache.stats.map((stat) => [stat.championId, stat] as const),
    );
    const championIds = Array.from(
      new Set([...rankedMap.keys(), ...customMap.keys()]),
    );

    const champions = championIds
      .map((championId): LabUserProfileCompareEntry => {
        const rankedStat =
          rankedMap.get(championId) ??
          ({
            championId,
            championName:
              customMap.get(championId)?.championName ?? String(championId),
            championNameKorean:
              customMap.get(championId)?.championNameKorean ??
              String(championId),
            games: 0,
            wins: 0,
            losses: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
          } satisfies RankedChampStat);
        const customStat =
          customMap.get(championId) ??
          ({
            championId,
            championName:
              rankedMap.get(championId)?.championName ?? String(championId),
            championNameKorean:
              rankedMap.get(championId)?.championNameKorean ??
              String(championId),
            games: 0,
            wins: 0,
            losses: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
          } satisfies RankedChampStat);

        const rankedWinRate = this.computeStatWinRate(rankedStat);
        const customWinRate = this.computeStatWinRate(customStat);
        const rankedAvgKda = this.computeStatAvgKda(rankedStat);
        const customAvgKda = this.computeStatAvgKda(customStat);
        const winRateDelta = customWinRate - rankedWinRate;
        const avgKdaDelta = customAvgKda - rankedAvgKda;

        let signal: LabUserProfileCompareEntry["signal"] = "aligned";
        if (rankedStat.games < 3 || customStat.games < 3) {
          signal = "insufficient-data";
        } else if (winRateDelta >= 0.15 || avgKdaDelta >= 1) {
          signal = "scrim-favored";
        } else if (winRateDelta <= -0.15 || avgKdaDelta <= -1) {
          signal = "ranked-favored";
        }

        return {
          championId,
          championName: rankedStat.championName || customStat.championName,
          championNameKorean:
            rankedStat.championNameKorean || customStat.championNameKorean,
          ranked: {
            games: rankedStat.games,
            wins: rankedStat.wins,
            losses: rankedStat.losses,
            winRate: this.roundMetric(rankedWinRate, 4),
            avgKda: this.roundMetric(rankedAvgKda, 2),
          },
          custom: {
            games: customStat.games,
            wins: customStat.wins,
            losses: customStat.losses,
            winRate: this.roundMetric(customWinRate, 4),
            avgKda: this.roundMetric(customAvgKda, 2),
          },
          delta: {
            games: customStat.games - rankedStat.games,
            winRate: this.roundMetric(winRateDelta, 4),
            avgKda: this.roundMetric(avgKdaDelta, 2),
          },
          signal,
        };
      })
      .sort((a, b) => {
        const gameDelta =
          b.ranked.games + b.custom.games - (a.ranked.games + a.custom.games);
        if (gameDelta !== 0) return gameDelta;
        return Math.abs(b.delta.winRate) - Math.abs(a.delta.winRate);
      });

    const totalRankedKills = rankedCache.stats.reduce(
      (sum, stat) => sum + stat.kills,
      0,
    );
    const totalRankedDeaths = rankedCache.stats.reduce(
      (sum, stat) => sum + stat.deaths,
      0,
    );
    const totalRankedAssists = rankedCache.stats.reduce(
      (sum, stat) => sum + stat.assists,
      0,
    );
    const totalCustomKills = customCache.stats.reduce(
      (sum, stat) => sum + stat.kills,
      0,
    );
    const totalCustomDeaths = customCache.stats.reduce(
      (sum, stat) => sum + stat.deaths,
      0,
    );
    const totalCustomAssists = customCache.stats.reduce(
      (sum, stat) => sum + stat.assists,
      0,
    );
    const rankedWins = rankedCache.stats.reduce(
      (sum, stat) => sum + stat.wins,
      0,
    );
    const customWins = customCache.stats.reduce(
      (sum, stat) => sum + stat.wins,
      0,
    );

    const rankedWinRate =
      rankedCache.matchCount > 0 ? rankedWins / rankedCache.matchCount : 0;
    const customWinRate =
      customCache.matchCount > 0 ? customWins / customCache.matchCount : 0;
    const rankedAvgKda =
      rankedCache.matchCount > 0
        ? (totalRankedKills + totalRankedAssists) /
          Math.max(totalRankedDeaths, 1)
        : 0;
    const customAvgKda =
      customCache.matchCount > 0
        ? (totalCustomKills + totalCustomAssists) /
          Math.max(totalCustomDeaths, 1)
        : 0;

    return {
      userId,
      summary: {
        rankedGames: rankedCache.matchCount,
        customGames: customCache.matchCount,
        rankedWinRate: this.roundMetric(rankedWinRate, 4),
        customWinRate: this.roundMetric(customWinRate, 4),
        rankedAvgKda: this.roundMetric(rankedAvgKda, 2),
        customAvgKda: this.roundMetric(customAvgKda, 2),
        winRateDelta: this.roundMetric(customWinRate - rankedWinRate, 4),
        avgKdaDelta: this.roundMetric(customAvgKda - rankedAvgKda, 2),
      },
      champions,
    };
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
            showMatchHistory: true,
            showChampionStats: true,
            showRiotAccounts: true,
          },
        },
      },
    });
  }

  async getLabOverview(): Promise<LabOverview> {
    const [
      matchesWithStats,
      participantRows,
      playersInDatasetRows,
      championsInDatasetRows,
      itemSelectionsRows,
      recentMatchesRows,
      laneProfileRows,
      championSignalRows,
      itemTrendRows,
      masteryLeaderRows,
      seededChampionLeaderRows,
    ] = await Promise.all([
      this.prisma.matchParticipant.groupBy({
        by: ["matchId"],
      }),
      this.prisma.matchParticipant.count(),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT "userId")::bigint AS count
        FROM "match_participants"
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT "championId")::bigint AS count
        FROM "match_participants"
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM (
          SELECT unnest(ARRAY["item0", "item1", "item2", "item3", "item4", "item5", "item6"]) AS item_id
          FROM "match_participants"
        ) items
        WHERE item_id > 0
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT mp."matchId")::bigint AS count
        FROM "match_participants" mp
        INNER JOIN "matches" m ON m."id" = mp."matchId"
        WHERE COALESCE(m."completedAt", m."createdAt") >= NOW() - INTERVAL '30 days'
      `),
      this.prisma.$queryRaw<
        {
          position: string;
          games: bigint;
          winRate: number;
          avgKills: number;
          avgDeaths: number;
          avgAssists: number;
          avgDamage: number;
          avgGold: number;
        }[]
      >(Prisma.sql`
        SELECT
          "position",
          COUNT(*)::bigint AS games,
          ROUND(AVG(CASE WHEN "win" THEN 1.0 ELSE 0.0 END) * 100, 1)::float AS "winRate",
          ROUND(AVG("kills"), 1)::float AS "avgKills",
          ROUND(AVG("deaths"), 1)::float AS "avgDeaths",
          ROUND(AVG("assists"), 1)::float AS "avgAssists",
          ROUND(AVG("totalDamageDealtToChampions"), 0)::float AS "avgDamage",
          ROUND(AVG("goldEarned"), 0)::float AS "avgGold"
        FROM "match_participants"
        WHERE "position" IS NOT NULL
          AND "position" <> ''
          AND "position" <> 'UNKNOWN'
        GROUP BY "position"
        ORDER BY COUNT(*) DESC
      `),
      this.prisma.$queryRaw<
        {
          championId: number;
          championName: string;
          games: bigint;
          winRate: number;
          avgKills: number;
          avgDeaths: number;
          avgAssists: number;
        }[]
      >(Prisma.sql`
        SELECT
          "championId",
          "championName",
          COUNT(*)::bigint AS games,
          ROUND(AVG(CASE WHEN "win" THEN 1.0 ELSE 0.0 END) * 100, 1)::float AS "winRate",
          ROUND(AVG("kills"), 1)::float AS "avgKills",
          ROUND(AVG("deaths"), 1)::float AS "avgDeaths",
          ROUND(AVG("assists"), 1)::float AS "avgAssists"
        FROM "match_participants"
        GROUP BY "championId", "championName"
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC, "winRate" DESC
        LIMIT 12
      `),
      this.prisma.$queryRaw<
        {
          itemId: number;
          picks: bigint;
          uniqueUsers: bigint;
        }[]
      >(Prisma.sql`
        SELECT
          item_id AS "itemId",
          COUNT(*)::bigint AS picks,
          COUNT(DISTINCT "userId")::bigint AS "uniqueUsers"
        FROM (
          SELECT
            "userId",
            unnest(ARRAY["item0", "item1", "item2", "item3", "item4", "item5", "item6"]) AS item_id
          FROM "match_participants"
        ) items
        WHERE item_id > 0
        GROUP BY item_id
        ORDER BY COUNT(*) DESC
        LIMIT 12
      `),
      this.prisma.$queryRaw<
        {
          userId: string;
          username: string;
          avatar: string | null;
          championId: number;
          championName: string;
          games: bigint;
          winRate: number;
          avgKda: number;
          masteryScore: number;
        }[]
      >(Prisma.sql`
        WITH champion_user AS (
          SELECT
            mp."userId",
            u."username",
            u."avatar",
            mp."championId",
            mp."championName",
            COUNT(*)::bigint AS games,
            AVG(CASE WHEN mp."win" THEN 1.0 ELSE 0.0 END) * 100 AS "winRate",
            AVG((mp."kills" + mp."assists")::float / GREATEST(mp."deaths", 1)) AS "avgKda"
          FROM "match_participants" mp
          INNER JOIN "users" u ON u."id" = mp."userId"
          GROUP BY mp."userId", u."username", u."avatar", mp."championId", mp."championName"
          HAVING COUNT(*) >= 4
        ),
        ranked AS (
          SELECT
            *,
            ROUND(((games * 4) + ("winRate" * 0.45) + ("avgKda" * 8))::numeric, 1) AS "masteryScore",
            ROW_NUMBER() OVER (
              PARTITION BY "userId"
              ORDER BY ((games * 4) + ("winRate" * 0.45) + ("avgKda" * 8)) DESC, games DESC
            ) AS rn
          FROM champion_user
        )
        SELECT
          "userId",
          "username",
          "avatar",
          "championId",
          "championName",
          games,
          ROUND("winRate"::numeric, 1)::float AS "winRate",
          ROUND("avgKda"::numeric, 2)::float AS "avgKda",
          "masteryScore"
        FROM ranked
        WHERE rn = 1
        ORDER BY "masteryScore" DESC
        LIMIT 10
      `),
      this.prisma.$queryRaw<
        {
          puuid: string;
          gameName: string | null;
          tagLine: string | null;
          championId: number;
          championName: string;
          games: bigint;
          winRate: number;
          avgKda: number;
          lastGameAt: Date;
        }[]
      >(Prisma.sql`
        WITH seeded AS (
          SELECT
            kp."puuid",
            kp."gameName",
            kp."tagLine"
          FROM "known_puuids" kp
          WHERE kp."priority" = 7
        ),
        seeded_participants AS (
          SELECT
            s."puuid",
            s."gameName",
            s."tagLine",
            (participant->>'championId')::int AS "championId",
            participant->>'championName' AS "championName",
            CASE WHEN (participant->>'win')::boolean THEN 1 ELSE 0 END AS win,
            ((participant->>'kills')::float + (participant->>'assists')::float)
              / GREATEST((participant->>'deaths')::float, 1) AS kda,
            rmc."gameEnd" AS "gameEnd"
          FROM "riot_match_cache" rmc
          INNER JOIN LATERAL jsonb_array_elements((rmc."data"::jsonb->'info'->'participants')) participant ON TRUE
          INNER JOIN seeded s ON s."puuid" = participant->>'puuid'
          WHERE rmc."queueId" IN (420, 440)
            AND rmc."gameEnd" >= NOW() - INTERVAL '90 days'
        ),
        per_champion AS (
          SELECT
            "puuid",
            "gameName",
            "tagLine",
            "championId",
            "championName",
            COUNT(*)::bigint AS games,
            ROUND((AVG(win) * 100)::numeric, 1)::float AS "winRate",
            ROUND(AVG(kda)::numeric, 2)::float AS "avgKda",
            MAX("gameEnd") AS "lastGameAt"
          FROM seeded_participants
          GROUP BY "puuid", "gameName", "tagLine", "championId", "championName"
          HAVING COUNT(*) >= 8
        ),
        ranked AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              PARTITION BY "puuid"
              ORDER BY games DESC, "avgKda" DESC, "winRate" DESC
            ) AS rn
          FROM per_champion
        )
        SELECT
          "puuid",
          "gameName",
          "tagLine",
          "championId",
          "championName",
          games,
          "winRate",
          "avgKda",
          "lastGameAt"
        FROM ranked
        WHERE rn = 1
        ORDER BY games DESC, "avgKda" DESC
        LIMIT 12
      `),
    ]);

    return {
      sample: {
        matchesWithStats: matchesWithStats.length,
        participantRows,
        playersInDataset: Number(playersInDatasetRows[0]?.count ?? 0),
        championsInDataset: Number(championsInDatasetRows[0]?.count ?? 0),
        itemSelections: Number(itemSelectionsRows[0]?.count ?? 0),
        recentMatches30d: Number(recentMatchesRows[0]?.count ?? 0),
      },
      laneProfiles: laneProfileRows.map((row) => ({
        position: row.position,
        games: Number(row.games),
        winRate: Number(row.winRate),
        avgKills: Number(row.avgKills),
        avgDeaths: Number(row.avgDeaths),
        avgAssists: Number(row.avgAssists),
        avgDamage: Number(row.avgDamage),
        avgGold: Number(row.avgGold),
      })),
      championSignals: championSignalRows.map((row) => ({
        championId: row.championId,
        championName: row.championName,
        championNameKorean: getChampionKoreanName(row.championName),
        games: Number(row.games),
        winRate: Number(row.winRate),
        avgKills: Number(row.avgKills),
        avgDeaths: Number(row.avgDeaths),
        avgAssists: Number(row.avgAssists),
      })),
      itemTrends: itemTrendRows.map((row) => ({
        itemId: row.itemId,
        picks: Number(row.picks),
        uniqueUsers: Number(row.uniqueUsers),
      })),
      masteryLeaders: masteryLeaderRows.map((row) => ({
        userId: row.userId,
        username: row.username,
        avatar: row.avatar,
        championId: row.championId,
        championName: row.championName,
        championNameKorean: getChampionKoreanName(row.championName),
        games: Number(row.games),
        winRate: Number(row.winRate),
        avgKda: Number(row.avgKda),
        masteryScore: Number(row.masteryScore),
      })),
      seededChampionLeaders: seededChampionLeaderRows.map((row) => ({
        puuid: row.puuid,
        gameName: row.gameName,
        tagLine: row.tagLine,
        championId: row.championId,
        championName: row.championName,
        championNameKorean: getChampionKoreanName(row.championName),
        games: Number(row.games),
        winRate: Number(row.winRate),
        avgKda: Number(row.avgKda),
        lastGameAt: row.lastGameAt.toISOString(),
      })),
    };
  }

  private isPrivacyAllowed(
    settings: {
      showMatchHistory?: boolean;
      showChampionStats?: boolean;
      showRiotAccounts?: boolean;
    } | null,
    requesterId: string,
    userId: string,
    setting: "showMatchHistory" | "showChampionStats" | "showRiotAccounts",
  ): boolean {
    if (requesterId === userId) return true;
    return !settings || settings[setting] !== false;
  }

  /**
   * Get auction statistics for a user (captain count, sold prices, titles)
   */
  async getUserAuctionStats(
    userId: string,
    requesterId?: string,
  ): Promise<AuctionStats> {
    const user = await this.getUserWithSettings(userId);
    if (!user) throw new NotFoundException("User not found");
    if (
      requesterId &&
      !this.isPrivacyAllowed(
        user.settings,
        requesterId,
        userId,
        "showMatchHistory",
      )
    ) {
      return {
        captainCount: 0,
        totalAuctions: 0,
        totalSold: 0,
        yuchalCount: 0,
        avgSoldPrice: 0,
        maxSoldPrice: 0,
        titles: [],
      };
    }

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

    // Get all match participants for this user
    const participants = await this.prisma.matchParticipant.findMany({
      where: { userId },
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
    requesterId?: string,
  ): Promise<PositionStats[]> {
    const user = await this.getUserWithSettings(userId);
    if (!user) throw new NotFoundException("User not found");
    if (
      requesterId &&
      !this.isPrivacyAllowed(
        user.settings,
        requesterId,
        userId,
        "showMatchHistory",
      )
    )
      return [];

    // Get all match participants for this user
    const participants = await this.prisma.matchParticipant.findMany({
      where: { userId },
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
            puuid: true,
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
    return this.riotMatchService.getMatchTimeline(matchId);
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
}
