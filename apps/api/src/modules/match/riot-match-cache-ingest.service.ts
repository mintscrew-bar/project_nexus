import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import type { MatchDto, ParticipantDto } from "../riot/riot-match.service";

/**
 * riot_match_cache → matches/match_participants 정규화 인제스트.
 *
 * - 이벤트 트리거: RiotMatchService가 새 캐시를 저장한 직후 emit하는 "riot.match.cached"
 * - Cron 트리거: 5분마다 누락된 캐시 행 일괄 처리 (이벤트 누락/재시작 대비)
 * - 멱등성: matches.riotMatchId 기준으로 중복 처리 방지
 *
 * Lab 대시보드와 head-to-head/play-patterns가 match_participants를 직접 쿼리하므로
 * 외부(랭크) 데이터를 정규화 테이블에 채워야 통계가 잡힌다.
 */
@Injectable()
export class RiotMatchCacheIngestService {
  private readonly logger = new Logger(RiotMatchCacheIngestService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** info.gameVersion ("14.8.612.5544") → "14.8" */
  private parsePatchVersion(gameVersion?: string | null): string | null {
    if (!gameVersion) return null;
    const parts = gameVersion.split(".");
    if (parts.length < 2) return null;
    return `${parts[0]}.${parts[1]}`;
  }

  /**
   * 단일 캐시 매치를 정규화 테이블로 변환 — 멱등.
   * 이미 ingested된 매치는 skip.
   */
  async ingestOne(
    matchId: string,
  ): Promise<{ created: boolean; skipped?: string }> {
    const cache = await this.prisma.riotMatchCache.findUnique({
      where: { matchId },
    });
    if (!cache) return { created: false, skipped: "not in cache" };

    // 멱등: 이미 정규화된 매치는 다시 처리하지 않음
    const existing = await this.prisma.match.findFirst({
      where: { riotMatchId: matchId },
      select: { id: true },
    });
    if (existing) return { created: false, skipped: "already ingested" };

    const data = cache.data as unknown as MatchDto;
    if (!data?.info?.participants?.length) {
      return { created: false, skipped: "invalid match data" };
    }

    // 참가자 puuid → Nexus userId 매핑 (없으면 null로 저장)
    const puuids = data.info.participants.map((p) => p.puuid);
    const accounts = await this.prisma.riotAccount.findMany({
      where: { puuid: { in: puuids } },
      select: { puuid: true, userId: true },
    });
    const puuidToUser = new Map(accounts.map((a) => [a.puuid, a.userId]));

    const patchVersion =
      cache.patchVersion ?? this.parsePatchVersion(data.info.gameVersion);
    const completedAt = new Date(
      data.info.gameEndTimestamp ?? cache.gameEnd.getTime(),
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        // 외부 매치 — roomId/teamAId/teamBId 없음
        const match = await tx.match.create({
          data: {
            riotMatchId: matchId,
            status: "COMPLETED",
            gameDuration: data.info.gameDuration ?? null,
            patchVersion,
            completedAt,
            dataCollected: true,
          },
        });

        await tx.matchParticipant.createMany({
          data: data.info.participants.map((p: ParticipantDto) => ({
            matchId: match.id,
            userId: puuidToUser.get(p.puuid) ?? null,
            teamId: null,
            puuid: p.puuid,
            riotTeamId: p.teamId,
            championId: p.championId,
            championName: p.championName,
            position: p.teamPosition || "UNKNOWN",
            summoner1Id: p.summoner1Id,
            summoner2Id: p.summoner2Id,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            totalMinionsKilled: p.totalMinionsKilled,
            neutralMinionsKilled: p.neutralMinionsKilled,
            goldEarned: p.goldEarned,
            goldSpent: p.goldSpent,
            totalDamageDealt: p.totalDamageDealt,
            totalDamageDealtToChampions: p.totalDamageDealtToChampions,
            totalDamageTaken: p.totalDamageTaken,
            totalHeal: p.totalHeal,
            damageSelfMitigated: p.damageSelfMitigated,
            visionScore: p.visionScore,
            wardsPlaced: p.wardsPlaced,
            wardsKilled: p.wardsKilled,
            detectorWardsPlaced: p.detectorWardsPlaced,
            item0: p.item0,
            item1: p.item1,
            item2: p.item2,
            item3: p.item3,
            item4: p.item4,
            item5: p.item5,
            item6: p.item6,
            ...(p.item7 != null ? { item7: p.item7 } : {}),
            perks: p.perks as any,
            champLevel: p.champLevel,
            largestKillingSpree: p.largestKillingSpree,
            largestMultiKill: p.largestMultiKill,
            longestTimeSpentLiving: p.longestTimeSpentLiving,
            totalTimeSpentDead: p.totalTimeSpentDead,
            turretKills: p.turretKills || 0,
            inhibitorKills: p.inhibitorKills || 0,
            dragonKills: p.dragonKills || 0,
            baronKills: p.baronKills || 0,
            doubleKills: p.doubleKills,
            tripleKills: p.tripleKills,
            quadraKills: p.quadraKills,
            pentaKills: p.pentaKills,
            firstBloodKill: p.firstBloodKill,
            firstTowerKill: p.firstTowerKill,
            win: p.win,
          })),
        });
      });

      return { created: true };
    } catch (err: any) {
      // 동시 ingest 경합으로 unique 위반 — 다른 워커가 이미 처리한 것이므로 정상
      if (err?.code === "P2002") {
        return { created: false, skipped: "race: already ingested" };
      }
      throw err;
    }
  }

  /**
   * 미처리 캐시 행을 일괄 처리. matches.riotMatchId가 없는 캐시 row를 찾아 ingest.
   */
  async ingestPending(
    limit = 100,
  ): Promise<{ processed: number; failed: number; skipped: number }> {
    const pending = await this.prisma.$queryRaw<{ matchId: string }[]>`
      SELECT rmc."matchId"
      FROM "riot_match_cache" rmc
      LEFT JOIN "matches" m ON m."riotMatchId" = rmc."matchId"
      WHERE m."id" IS NULL
      ORDER BY rmc."gameEnd" DESC
      LIMIT ${limit}
    `;

    let processed = 0;
    let failed = 0;
    let skipped = 0;
    for (const row of pending) {
      try {
        const result = await this.ingestOne(row.matchId);
        if (result.created) processed++;
        else skipped++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Ingest failed for ${row.matchId}: ${(err as Error).message}`,
        );
      }
    }
    return { processed, failed, skipped };
  }

  /** 이벤트 트리거 — RiotMatchService가 캐시 저장 직후 emit */
  @OnEvent("riot.match.cached")
  async onRiotMatchCached(payload: { matchId: string }): Promise<void> {
    if (!payload?.matchId) return;
    try {
      const result = await this.ingestOne(payload.matchId);
      if (result.created) {
        this.logger.log(`Ingested ${payload.matchId} (event)`);
      } else {
        this.logger.log(
          `Event ingest skipped ${payload.matchId}: ${result.skipped}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Event-driven ingest failed for ${payload.matchId}: ${(err as Error).message}`,
      );
    }
  }

  /** Cron catch-up — 5분마다 누락 row 처리 */
  @Cron("*/5 * * * *")
  async cronIngestPending(): Promise<void> {
    const result = await this.ingestPending(200);
    if (result.processed > 0 || result.failed > 0) {
      this.logger.log(
        `Cron ingest: processed=${result.processed}, skipped=${result.skipped}, failed=${result.failed}`,
      );
    }
  }
}
