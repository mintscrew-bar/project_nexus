import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import type { MatchDto, ParticipantDto } from "../riot/riot-match.service";
import { normalizeRiotPosition } from "./position-normalizer";

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

    // 동일 매치 내 puuid 중복 처리.
    // 캐시 payload의 participants 배열에 같은 puuid가 두 번 이상 들어있으면
    // (matchId, puuid) 유니크 제약에 걸려 트랜잭션이 통째로 롤백된다.
    // 롤백되면 matches 행이 안 생기고 → ingestPending의 LEFT JOIN이 같은 캐시 행을
    // 다음 크론에서 또 집어와 5분마다 무한 재시도하는 독약 행이 된다.
    //
    // 중복분은 puuid를 null로 저장한다. Postgres에서 NULL은 유니크 제약에 걸리지
    // 않으므로 참가자 행 자체는 보존된다(매핑 안 되는 puuid는 userId도 null).
    //
    // 단, 배열이 통째로 중복된 경우(= 캐시 적재 버그)까지 null로 삼켜버리면
    // 유령 참가자 행이 조용히 쌓여 통계가 오염된다. 그래서 아래에서 중복 양상을
    // 구분해 후자는 예외로 던진다.
    const puuidCounts = new Map<string, number>();
    for (const p of data.info.participants) {
      if (p.puuid) {
        puuidCounts.set(p.puuid, (puuidCounts.get(p.puuid) ?? 0) + 1);
      }
    }
    const duplicated = [...puuidCounts.entries()].filter(([, n]) => n > 1);

    // 모든 puuid가 똑같은 횟수로 반복 = participants 배열이 통째로 복제된 것.
    // 데이터 자체가 깨졌으므로 저장하지 않고 실패로 남겨 원인(캐시 적재)을 추적한다.
    if (duplicated.length > 0 && duplicated.length === puuidCounts.size) {
      const repeat = duplicated[0][1];
      if (duplicated.every(([, n]) => n === repeat)) {
        throw new Error(
          `${matchId}: participants 배열이 ${repeat}배로 복제됨 ` +
            `(고유 puuid ${puuidCounts.size}개 × ${repeat} = ${data.info.participants.length}개) ` +
            `— riot_match_cache 적재 경로 확인 필요`,
        );
      }
    }

    const seenPuuids = new Set<string>();
    let dedupedCount = 0;

    const participantRows = data.info.participants.map((p: ParticipantDto) => {
      let puuid: string | null = p.puuid ?? null;
      if (puuid !== null) {
        if (seenPuuids.has(puuid)) {
          puuid = null;
          dedupedCount++;
        } else {
          seenPuuids.add(puuid);
        }
      }

      return {
        matchId: "", // 트랜잭션 안에서 생성된 match.id로 채운다
        userId: (p.puuid ? puuidToUser.get(p.puuid) : null) ?? null,
        teamId: null,
        puuid,
        riotTeamId: p.teamId,
        championId: p.championId,
        championName: p.championName,
        position: normalizeRiotPosition(p),
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
      };
    });

    // 중복 원인을 로그만 보고 특정할 수 있도록 어떤 puuid가 몇 번 나왔는지 남긴다.
    if (dedupedCount > 0) {
      const detail = duplicated.map(([puuid, n]) => `${puuid}×${n}`).join(", ");
      this.logger.warn(
        `${matchId}: puuid 중복 ${dedupedCount}건을 null로 저장 ` +
          `(queueId=${cache.queueId}, 참가자 ${data.info.participants.length}명, 중복: ${detail})`,
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // 외부 매치 — roomId/teamAId/teamBId 없음
        // queueId는 stats 서비스가 큐 그룹(랭크/일반/ARAM) 필터에 사용한다.
        const match = await tx.match.create({
          data: {
            riotMatchId: matchId,
            status: "COMPLETED",
            gameDuration: data.info.gameDuration ?? null,
            patchVersion,
            queueId: cache.queueId,
            completedAt,
            dataCollected: true,
          },
        });

        await tx.matchParticipant.createMany({
          data: participantRows.map((row) => ({ ...row, matchId: match.id })),
        });
      });

      return { created: true };
    } catch (err: any) {
      if (err?.code === "P2002") {
        const rawTarget = err?.meta?.target;
        const target: string[] = Array.isArray(rawTarget)
          ? rawTarget
          : typeof rawTarget === "string"
            ? [rawTarget]
            : [];

        // matches.riotMatchId 충돌 = 다른 워커가 먼저 ingest를 끝낸 정상 경합.
        if (target.some((t) => t.includes("riotMatchId"))) {
          return { created: false, skipped: "race: already ingested" };
        }

        // 그 외 유니크 충돌은 데이터 문제다. skipped로 삼키면 matches 행이 없는 채로
        // 남아 크론이 5분마다 같은 행을 영원히 재시도하므로, 실패로 올려 로그를 남긴다.
        throw new Error(
          `유니크 제약 위반 (${target.join(", ") || "unknown"}) — 캐시 데이터 확인 필요`,
        );
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
