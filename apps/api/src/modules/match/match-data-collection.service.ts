import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RiotMatchService, MatchDto } from "../riot/riot-match.service";
import { normalizeRiotPosition } from "./position-normalizer";

type CrossrefExpectedMember = {
  puuid: string;
  userId: string;
  teamId: string;
};

type CrossrefCandidateScore = {
  matchId: string;
  matchData: MatchDto;
  score: number;
  valid: boolean;
  sampleHits: number;
  matchedPuuidCount: number;
  expectedPuuidCount: number;
  teamAlignedCount: number;
  timeDeltaMs: number | null;
  reasons: string[];
};

/** 복구 큐에서 이 횟수만큼 실패하면 대상에서 제외한다. */
const MAX_COLLECT_ATTEMPTS = 10;
/**
 * 한 사이클에서 실제로 처리할 매치 수.
 *
 * 백그라운드 Riot 요청은 8초 간격(RIOT_MATCH_BACKGROUND_REQUEST_DELAY_MS)이라,
 * 실패하는 매치 하나가 최대 6명 × (목록 1회 + 상세 5회) = 36회 ≈ 5분까지 걸린다.
 * 배치가 크면 한 사이클이 크론 주기와 락 TTL을 모두 넘겨 다음 실행과 겹친다.
 * 최악(5 × 5분 = 25분)이 락 TTL(30분) 안에 들어오도록 잡는다.
 * 15분마다 5건이면 시간당 20건으로 처리량도 충분하다.
 */
const COLLECT_BATCH_SIZE = 5;
/** 백오프로 걸러질 것을 감안해 넉넉히 조회한 뒤 배치 크기만큼 자른다. */
const COLLECT_CANDIDATE_POOL = 60;
/** 첫 재시도 대기 시간. 실패할수록 2배씩 늘어난다. */
const COLLECT_BASE_BACKOFF_MS = 15 * 60 * 1000; // 15분
/** 백오프 상한 */
const COLLECT_MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24시간

export function isRiotCustomGame(matchData: MatchDto): boolean {
  return (
    matchData.info.queueId === 0 ||
    matchData.info.gameType?.toUpperCase() === "CUSTOM_GAME"
  );
}

@Injectable()
export class MatchDataCollectionService {
  private readonly logger = new Logger(MatchDataCollectionService.name);
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly riotMatchService: RiotMatchService,
  ) {}

  private buildExpectedMembers(match: any): CrossrefExpectedMember[] {
    const expectedMembers: CrossrefExpectedMember[] = [];
    const seenPuuids = new Set<string>();

    const collect = (members: any[] = [], teamId?: string | null) => {
      if (!teamId) return;

      for (const member of members) {
        const puuid = member.user?.riotAccounts?.[0]?.puuid;
        if (!puuid || seenPuuids.has(puuid)) continue;

        seenPuuids.add(puuid);
        expectedMembers.push({
          puuid,
          userId: member.userId,
          teamId,
        });
      }
    };

    collect(match.teamA?.members, match.teamAId ?? match.teamA?.id);
    collect(match.teamB?.members, match.teamBId ?? match.teamB?.id);

    return expectedMembers;
  }

  private selectCrossrefSampleMembers(
    members: CrossrefExpectedMember[],
    maxSamples = 6,
  ): CrossrefExpectedMember[] {
    const byTeam = new Map<string, CrossrefExpectedMember[]>();
    for (const member of members) {
      const teamMembers = byTeam.get(member.teamId) ?? [];
      teamMembers.push(member);
      byTeam.set(member.teamId, teamMembers);
    }

    const selected: CrossrefExpectedMember[] = [];
    let index = 0;
    while (selected.length < Math.min(maxSamples, members.length)) {
      let added = false;
      for (const teamMembers of byTeam.values()) {
        const member = teamMembers[index];
        if (!member) continue;

        selected.push(member);
        added = true;
        if (selected.length >= maxSamples) break;
      }

      if (!added) break;
      index++;
    }

    return selected;
  }

  private getRiotMatchEndMs(matchData: MatchDto): number | null {
    if (matchData.info.gameEndTimestamp) {
      return matchData.info.gameEndTimestamp;
    }

    if (matchData.info.gameStartTimestamp && matchData.info.gameDuration) {
      return (
        matchData.info.gameStartTimestamp + matchData.info.gameDuration * 1000
      );
    }

    return null;
  }

  private scoreCrossrefCandidate(
    matchId: string,
    sampleHits: number,
    sampleSize: number,
    match: any,
    expectedMembers: CrossrefExpectedMember[],
    matchData: MatchDto,
    completedAt: Date,
  ): CrossrefCandidateScore {
    const expectedByPuuid = new Map(
      expectedMembers.map((member) => [member.puuid, member]),
    );
    const teamAId = match.teamAId ?? match.teamA?.id;
    const teamBId = match.teamBId ?? match.teamB?.id;

    let matchedPuuidCount = 0;
    let blueToA = 0;
    let blueToB = 0;
    let redToA = 0;
    let redToB = 0;

    for (const participant of matchData.info.participants) {
      const expected = expectedByPuuid.get(participant.puuid);
      if (!expected) continue;

      matchedPuuidCount++;
      if (participant.teamId === 100) {
        if (expected.teamId === teamAId) blueToA++;
        if (expected.teamId === teamBId) blueToB++;
      }
      if (participant.teamId === 200) {
        if (expected.teamId === teamAId) redToA++;
        if (expected.teamId === teamBId) redToB++;
      }
    }

    const expectedPuuidCount = expectedMembers.length;
    const requiredMatchedCount =
      expectedPuuidCount <= 2
        ? expectedPuuidCount
        : Math.max(3, Math.ceil(expectedPuuidCount * 0.7));
    const teamAlignedCount = Math.max(blueToA + redToB, blueToB + redToA);
    const teamAlignmentRatio =
      matchedPuuidCount > 0 ? teamAlignedCount / matchedPuuidCount : 0;
    const matchedRatio =
      expectedPuuidCount > 0 ? matchedPuuidCount / expectedPuuidCount : 0;
    const queueId = matchData.info.queueId;
    const customGameOk = isRiotCustomGame(matchData);
    const endMs = this.getRiotMatchEndMs(matchData);
    const timeDeltaMs = endMs ? Math.abs(endMs - completedAt.getTime()) : null;
    const timeOk = timeDeltaMs === null || timeDeltaMs <= 2 * 60 * 60 * 1000;
    const teamOk = matchedPuuidCount < 4 || teamAlignmentRatio >= 0.75;

    const reasons: string[] = [];
    if (!customGameOk) {
      reasons.push(
        `notCustomGame(queueId=${queueId},gameType=${matchData.info.gameType})`,
      );
    }
    if (matchedPuuidCount < requiredMatchedCount) {
      reasons.push(`matched=${matchedPuuidCount}/${expectedPuuidCount}`);
    }
    if (!teamOk) {
      reasons.push(
        `teamAligned=${teamAlignedCount}/${Math.max(matchedPuuidCount, 1)}`,
      );
    }
    if (!timeOk && timeDeltaMs !== null) {
      reasons.push(`timeDeltaMin=${Math.round(timeDeltaMs / 60000)}`);
    }

    const timeScore =
      timeDeltaMs === null
        ? 0
        : Math.max(0, 20 - Math.floor(timeDeltaMs / (10 * 60 * 1000)) * 2);
    const score =
      matchedRatio * 100 +
      teamAlignmentRatio * 45 +
      (sampleHits / Math.max(sampleSize, 1)) * 25 +
      (customGameOk ? 25 : 0) +
      timeScore;

    return {
      matchId,
      matchData,
      score,
      valid:
        customGameOk &&
        matchedPuuidCount >= requiredMatchedCount &&
        teamOk &&
        timeOk,
      sampleHits,
      matchedPuuidCount,
      expectedPuuidCount,
      teamAlignedCount,
      timeDeltaMs,
      reasons,
    };
  }

  private formatCrossrefCandidate(candidate: CrossrefCandidateScore): string {
    const timeDelta =
      candidate.timeDeltaMs === null
        ? "unknown"
        : `${Math.round(candidate.timeDeltaMs / 60000)}m`;
    const reason =
      candidate.reasons.length > 0 ? ` ${candidate.reasons.join(",")}` : "";

    return `${candidate.matchId} score=${candidate.score.toFixed(
      1,
    )} hits=${candidate.sampleHits} matched=${candidate.matchedPuuidCount}/${
      candidate.expectedPuuidCount
    } team=${candidate.teamAlignedCount}/${Math.max(
      candidate.matchedPuuidCount,
      1,
    )} delta=${timeDelta}${reason}`;
  }

  /**
   * Collect and save match data from Riot API
   */
  async collectMatchData(matchId: string, attemptNumber = 1): Promise<void> {
    try {
      this.logger.log(
        `Starting data collection for match ${matchId} (attempt ${attemptNumber})`,
      );

      // Get match from database
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: {
          room: {
            include: {
              participants: {
                include: {
                  user: {
                    include: {
                      riotAccounts: {
                        where: { isPrimary: true },
                      },
                    },
                  },
                },
              },
            },
          },
          teamA: {
            include: {
              members: {
                include: {
                  user: {
                    include: {
                      riotAccounts: {
                        where: { isPrimary: true },
                      },
                    },
                  },
                },
              },
            },
          },
          teamB: {
            include: {
              members: {
                include: {
                  user: {
                    include: {
                      riotAccounts: {
                        where: { isPrimary: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!match) {
        this.logger.error(`Match ${matchId} not found in database`);
        this.clearRetryTimer(matchId);
        return;
      }

      if (!match.tournamentCode) {
        this.logger.warn(`Match ${matchId} has no tournament code`);
        this.clearRetryTimer(matchId);
        return;
      }

      // Get match IDs from tournament code
      const riotMatchIds =
        await this.riotMatchService.getMatchIdsByTournamentCode(
          match.tournamentCode,
        );

      if (riotMatchIds.length === 0) {
        this.logger.warn(
          `No Riot match IDs found for tournament code ${match.tournamentCode}`,
        );
        // Wait and retry - match might not be available yet
        await this.scheduleRetry(matchId, attemptNumber);
        return;
      }

      // Usually there should be only one match per tournament code
      const riotMatchId = riotMatchIds[0];

      this.logger.log(`Found Riot match ID: ${riotMatchId}`);

      // Fetch match data
      const matchData = await this.riotMatchService.getMatchById(
        riotMatchId,
        3,
        "foreground",
        {
          emitCacheEvent: false,
          propagateKnownPuuids: false,
        },
      );

      if (!matchData) {
        this.logger.error(`Failed to fetch match data for ${riotMatchId}`);
        await this.scheduleRetry(matchId, attemptNumber);
        return;
      }

      // Update match with Riot match ID and game duration
      await this.prisma.match.update({
        where: { id: matchId },
        data: {
          riotMatchId,
          gameDuration: matchData.info.gameDuration ?? null,
        },
      });

      // Save match data
      await this.saveMatchData(matchId, match, matchData);

      this.clearRetryTimer(matchId);
      this.logger.log(`Successfully collected data for match ${matchId}`);
    } catch (error) {
      this.logger.error(`Error collecting data for match ${matchId}:`, error);
      await this.scheduleRetry(matchId, attemptNumber);
    }
  }

  /**
   * Save match data to database
   */
  private async saveMatchData(
    matchId: string,
    match: any,
    matchData: MatchDto,
  ): Promise<void> {
    try {
      if (!match.teamAId || !match.teamBId || !match.teamA || !match.teamB) {
        this.logger.warn(
          `Match ${matchId} has incomplete team assignment, skipping data save`,
        );
        return;
      }

      // Build PUUID to User mapping
      const puuidToUser = new Map<string, { userId: string; teamId: string }>();

      // Map TeamA members
      for (const member of match.teamA.members) {
        const riotAccount = member.user.riotAccounts[0];
        if (riotAccount?.puuid) {
          puuidToUser.set(riotAccount.puuid, {
            userId: member.userId,
            teamId: match.teamAId,
          });
        }
      }

      // Map TeamB members
      for (const member of match.teamB.members) {
        const riotAccount = member.user.riotAccounts[0];
        if (riotAccount?.puuid) {
          puuidToUser.set(riotAccount.puuid, {
            userId: member.userId,
            teamId: match.teamBId,
          });
        }
      }

      // Riot 응답에 우리가 기대한 참가자가 전원 들어있는지 먼저 확인한다.
      // 일부만 매핑된 채로 저장하면 7명짜리 불완전 전적이 dataCollected=true로
      // 확정되어 재수집 대상에서 영구히 빠진다. 그럴 바엔 저장하지 않고 재시도한다.
      // (Riot 참가자 중 Nexus 계정이 없는 사람은 애초에 기대 대상이 아니므로 무시)
      const expectedPuuids = new Set(puuidToUser.keys());
      const matchedPuuids = new Set(
        matchData.info.participants
          .map((p) => p.puuid)
          .filter((puuid) => expectedPuuids.has(puuid)),
      );

      // 라이엇 계정이 연동된 멤버가 한 명도 없으면 저장할 전적이 존재하지 않는다.
      // 이때 아래 불완전 검사는 0 < 0 이라 통과해버려서, 참가자 0명짜리 매치가
      // dataCollected=true로 확정된다. 그 전에 막는다.
      if (expectedPuuids.size === 0) {
        throw new Error(
          `기대 참가자가 없다 (라이엇 계정 연동 멤버 0명) — 전적을 저장하지 않는다`,
        );
      }

      if (matchedPuuids.size < expectedPuuids.size) {
        const missing = [...expectedPuuids].filter(
          (puuid) => !matchedPuuids.has(puuid),
        );
        throw new Error(
          `참가자 매핑 불완전: ${matchedPuuids.size}/${expectedPuuids.size} ` +
            `(누락 PUUID: ${missing.join(", ")}) — 부분 저장을 막기 위해 중단`,
        );
      }

      // 멱등성 보장:
      // 기존 전적을 트랜잭션 내에서 교체(replace)해 중복/부분 저장을 방지한다.
      await this.prisma.$transaction(async (tx) => {
        await tx.matchParticipant.deleteMany({ where: { matchId } });
        await tx.matchTeamStats.deleteMany({ where: { matchId } });

        for (const participant of matchData.info.participants) {
          const userMapping = puuidToUser.get(participant.puuid);

          // Nexus 계정이 연결되지 않은 외부 참가자 — 저장 대상이 아니다.
          if (!userMapping) {
            continue;
          }

          await tx.matchParticipant.create({
            data: {
              matchId,
              userId: userMapping.userId,
              teamId: userMapping.teamId,
              puuid: participant.puuid,
              riotTeamId: participant.teamId,
              championId: participant.championId,
              championName: participant.championName,
              position: normalizeRiotPosition(participant),
              summoner1Id: participant.summoner1Id,
              summoner2Id: participant.summoner2Id,
              kills: participant.kills,
              deaths: participant.deaths,
              assists: participant.assists,
              totalMinionsKilled: participant.totalMinionsKilled,
              neutralMinionsKilled: participant.neutralMinionsKilled,
              goldEarned: participant.goldEarned,
              goldSpent: participant.goldSpent,
              totalDamageDealt: participant.totalDamageDealt,
              totalDamageDealtToChampions:
                participant.totalDamageDealtToChampions,
              totalDamageTaken: participant.totalDamageTaken,
              totalHeal: participant.totalHeal,
              damageSelfMitigated: participant.damageSelfMitigated,
              visionScore: participant.visionScore,
              wardsPlaced: participant.wardsPlaced,
              wardsKilled: participant.wardsKilled,
              detectorWardsPlaced: participant.detectorWardsPlaced,
              item0: participant.item0,
              item1: participant.item1,
              item2: participant.item2,
              item3: participant.item3,
              item4: participant.item4,
              item5: participant.item5,
              item6: participant.item6,
              ...(participant.item7 != null
                ? { item7: participant.item7 }
                : {}),
              perks: participant.perks,
              champLevel: participant.champLevel,
              largestKillingSpree: participant.largestKillingSpree,
              largestMultiKill: participant.largestMultiKill,
              longestTimeSpentLiving: participant.longestTimeSpentLiving,
              totalTimeSpentDead: participant.totalTimeSpentDead,
              turretKills: participant.turretKills || 0,
              inhibitorKills: participant.inhibitorKills || 0,
              dragonKills: participant.dragonKills || 0,
              baronKills: participant.baronKills || 0,
              doubleKills: participant.doubleKills,
              tripleKills: participant.tripleKills,
              quadraKills: participant.quadraKills,
              pentaKills: participant.pentaKills,
              firstBloodKill: participant.firstBloodKill,
              firstTowerKill: participant.firstTowerKill,
              win: participant.win,
            },
          });
        }

        // 참가자 PUUID로 Riot 팀 ID(100/200) → Nexus 팀 ID 매핑을 역산한다.
        // 토너먼트 코드로 만든 방이어도 블루/레드 사이드는 랜덤이므로
        // teamA === 100 이라고 가정하면 안 된다.
        const riotTeamToNexusTeam = new Map<number, string>();
        for (const participant of matchData.info.participants) {
          const userMapping = puuidToUser.get(participant.puuid);
          if (userMapping && !riotTeamToNexusTeam.has(participant.teamId)) {
            riotTeamToNexusTeam.set(participant.teamId, userMapping.teamId);
          }
        }

        for (const team of matchData.info.teams) {
          const teamId =
            riotTeamToNexusTeam.get(team.teamId) ??
            (team.teamId === 100 ? match.teamAId : match.teamBId); // 폴백
          await tx.matchTeamStats.create({
            data: {
              matchId,
              teamId,
              win: team.win,
              towerKills: team.objectives.tower.kills,
              inhibitorKills: team.objectives.inhibitor.kills,
              baronKills: team.objectives.baron.kills,
              dragonKills: team.objectives.dragon.kills,
              riftHeraldKills: team.objectives.riftHerald.kills,
              firstBlood: team.objectives.champion?.first ?? false,
              firstTower: team.objectives.tower?.first ?? false,
              firstBaron: team.objectives.baron?.first ?? false,
              firstDragon: team.objectives.dragon?.first ?? false,
              bans: team.bans,
            },
          });
        }

        await tx.match.update({
          where: { id: matchId },
          data: { dataCollected: true },
        });
      });

      await Promise.all(
        Array.from(
          new Set(Array.from(puuidToUser.values()).map(({ userId }) => userId)),
        ).map((userId) =>
          this.prisma.statsRecomputeQueue.upsert({
            where: { userId },
            create: {
              userId,
              reason: "custom-match-added",
              queuedAt: new Date(),
            },
            update: {
              reason: "custom-match-added",
              queuedAt: new Date(),
            },
          }),
        ),
      );

      this.logger.log(`Saved match data for match ${matchId}`);
    } catch (error) {
      this.logger.error(`Error saving match data for match ${matchId}:`, error);
      throw error;
    }
  }

  /**
   * Tournament API 없이 PUUID 교집합으로 커스텀 게임 매치 ID를 찾아 전적을 수집한다.
   * 흐름: 참가자 PUUID 3명 → 각자 최근 커스텀 게임 목록(queue=0) → 교집합 matchId 확인 → ingest
   */
  async collectMatchDataByPuuidCrossref(
    matchId: string,
    attemptNumber = 1,
  ): Promise<void> {
    try {
      this.logger.log(
        `[PuuidCrossref] 커스텀 전적 수집 시작 matchId=${matchId} (시도 ${attemptNumber})`,
      );

      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: {
          teamA: {
            include: {
              members: {
                include: {
                  user: {
                    include: {
                      riotAccounts: { where: { isPrimary: true }, take: 1 },
                    },
                  },
                },
              },
            },
          },
          teamB: {
            include: {
              members: {
                include: {
                  user: {
                    include: {
                      riotAccounts: { where: { isPrimary: true }, take: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!match) {
        this.logger.error(`[PuuidCrossref] 매치 없음: ${matchId}`);
        return;
      }

      if (!match.teamA || !match.teamB) {
        this.logger.warn(`[PuuidCrossref] 팀 미배정: ${matchId}`);
        return;
      }

      // A previous attempt can persist the Riot ID before participant storage
      // fails. Reuse that ID instead of trying to discover the same match again.
      if (match.riotMatchId) {
        const knownMatchData = await this.riotMatchService.getMatchById(
          match.riotMatchId,
          3,
          "background",
          {
            emitCacheEvent: false,
            propagateKnownPuuids: false,
          },
        );

        if (!knownMatchData) {
          this.logger.warn(
            `[PuuidCrossref] 저장된 Riot 매치 재조회 실패: ${match.riotMatchId}`,
          );
          await this.schedulePuuidCrossrefRetry(matchId, attemptNumber);
          return;
        }

        await this.saveMatchData(matchId, match, knownMatchData);
        this.clearRetryTimer(`crossref:${matchId}`);
        this.logger.log(
          `[PuuidCrossref] 저장된 Riot 매치로 전적 복구 완료 matchId=${matchId} riotMatchId=${match.riotMatchId}`,
        );
        return;
      }

      // 참가자 PUUID 수집 (teamA + teamB)
      const expectedMembers = this.buildExpectedMembers(match);

      if (expectedMembers.length < 2) {
        this.logger.warn(
          `[PuuidCrossref] Riot 계정 연동 유저 부족 (${expectedMembers.length}명), 수집 불가 matchId=${matchId}`,
        );
        return;
      }

      // 탐색 시간 범위: 게임 시작 5분 전 ~ 종료 20분 후 (Riot API 처리 지연 고려)
      // startedAt이 없으면 completedAt 기준 90분 전으로 fallback
      const completedAt = match.completedAt ?? new Date();
      const startAnchor = (match as any).startedAt
        ? new Date((match as any).startedAt)
        : new Date(completedAt.getTime() - 90 * 60 * 1000);
      const startTime = Math.floor(
        (startAnchor.getTime() - 5 * 60 * 1000) / 1000,
      );
      const endTime = Math.floor(
        (completedAt.getTime() + 20 * 60 * 1000) / 1000,
      );

      // 크로스레퍼런스: 멤버를 한 명씩 순회하며 후보를 찾는다.
      //
      // 같은 매치를 치른 사람들이므로 한 명의 매치 목록만 있어도 후보는 나온다.
      // 실제 검증(참가자 70% 일치 / 팀 배치 정합 / 커스텀 여부 / 종료 시각)은
      // 어차피 매치 상세로 하기 때문에, 여러 명의 목록을 교집합낼 필요가 없다.
      //
      // 이전에는 샘플 3명 목록에 모두 나타나야(minCandidateHits=3) 후보로 인정했는데,
      // Riot 인덱싱 지연으로 한 명에게만 아직 안 보여도 후보가 0이 되어 통째로
      // 재시도로 빠졌다. 순차 탐색은 API 호출도 줄고(대개 목록 1회) 한 명이 실패해도
      // 다음 멤버로 넘어가므로 더 견고하다.
      const sampleMembers = this.selectCrossrefSampleMembers(expectedMembers);
      const evaluatedCandidates: CrossrefCandidateScore[] = [];
      const inspectedMatchIds = new Set<string>();
      // 한 멤버의 목록에서 상세 조회할 후보 수 상한 (API 호출 폭주 방지)
      const MAX_DETAIL_LOOKUPS_PER_MEMBER = 5;

      const hasValidCandidate = () =>
        evaluatedCandidates.some((candidate) => candidate.valid);

      for (let i = 0; i < sampleMembers.length && !hasValidCandidate(); i++) {
        const ids = await this.riotMatchService.getMatchIdsByPuuid(
          sampleMembers[i].puuid,
          0,
          20, // 최근 20개로 늘려 누락 방지 (기존 10개에서 증가)
          undefined, // 수동 사설방은 queueId가 0이 아닐 수 있어 상세 데이터로 검증
          undefined,
          3,
          startTime,
          endTime,
          "background",
        );

        this.logger.debug(
          `[PuuidCrossref] puuid[${i}] 시간창 내 매치 ${ids.length}개`,
        );

        let lookups = 0;
        for (const candidateMatchId of new Set(ids)) {
          // 앞선 멤버에서 이미 검증에 실패한 매치는 다시 볼 필요가 없다.
          if (inspectedMatchIds.has(candidateMatchId)) continue;
          if (lookups >= MAX_DETAIL_LOOKUPS_PER_MEMBER) break;
          inspectedMatchIds.add(candidateMatchId);
          lookups++;

          const candidateData = await this.riotMatchService.getMatchById(
            candidateMatchId,
            3,
            "background",
            {
              emitCacheEvent: false,
              propagateKnownPuuids: false,
            },
          );

          if (!candidateData) {
            this.logger.warn(
              `[PuuidCrossref] 후보 매치 상세 조회 실패: ${candidateMatchId}`,
            );
            continue;
          }

          const scored = this.scoreCrossrefCandidate(
            candidateMatchId,
            1, // 순차 탐색에서는 목록 교집합 히트 수를 쓰지 않는다
            1,
            match,
            expectedMembers,
            candidateData,
            completedAt,
          );
          evaluatedCandidates.push(scored);
        }

        // 이 멤버의 목록에서 유효 후보가 나왔으면 다른 멤버는 볼 필요가 없다.
        // (같은 매치이므로 다른 멤버의 목록에서도 같은 후보만 나온다)
        // 단, 이 멤버의 후보들은 끝까지 평가한다 — 연속 내전처럼 유효 후보가
        // 여러 개일 수 있어 그중 최적값을 골라야 하기 때문이다.
      }

      // 같은 팀이 연달아 여러 판을 하면 모든 판이 "유효"하다(같은 10명 / 커스텀 /
      // 시간 허용치 ±2시간). 그래서 먼저 찾은 후보를 그냥 쓰면 뒤 경기를 앞 대진에
      // 연결할 수 있다. 점수 → 종료 시각 근접 순으로 정렬해 최적 후보를 고른다.
      const bestCandidate =
        evaluatedCandidates
          .filter((candidate) => candidate.valid)
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (
              (a.timeDeltaMs ?? Number.MAX_SAFE_INTEGER) -
              (b.timeDeltaMs ?? Number.MAX_SAFE_INTEGER)
            );
          })[0] ?? null;

      if (!bestCandidate) {
        const summary =
          evaluatedCandidates.length > 0
            ? evaluatedCandidates
                .map((candidate) => this.formatCrossrefCandidate(candidate))
                .join(" | ")
            : "no detailed candidates";
        this.logger.warn(
          `[PuuidCrossref] 검증 통과 후보 없음 matchId=${matchId}: ${summary}`,
        );
        await this.schedulePuuidCrossrefRetry(matchId, attemptNumber);
        return;
      }
      const riotMatchId = bestCandidate.matchId;
      const matchData = bestCandidate.matchData;

      this.logger.log(
        `[PuuidCrossref] Riot matchId 확정: ${this.formatCrossrefCandidate(
          bestCandidate,
        )}`,
      );

      // riotMatchId 저장 후 기존 saveMatchData 재사용
      await this.prisma.match.update({
        where: { id: matchId },
        data: {
          riotMatchId,
          gameDuration: matchData.info.gameDuration ?? null,
        },
      });

      await this.saveMatchData(matchId, match, matchData);

      this.clearRetryTimer(`crossref:${matchId}`);
      this.logger.log(
        `[PuuidCrossref] 전적 수집 완료 matchId=${matchId} riotMatchId=${riotMatchId}`,
      );
    } catch (error) {
      this.logger.error(
        `[PuuidCrossref] 전적 수집 오류 matchId=${matchId}:`,
        error,
      );
      await this.schedulePuuidCrossrefRetry(matchId, attemptNumber);
    }
  }

  /**
   * PUUID 크로스레퍼런스 재시도 스케줄러 (최대 5회, 2분 간격)
   */
  private async schedulePuuidCrossrefRetry(
    matchId: string,
    attemptNumber: number,
  ): Promise<void> {
    const maxAttempts = 5;
    const delayMs = 2 * 60 * 1000; // 2분
    const timerKey = `crossref:${matchId}`;

    if (attemptNumber >= maxAttempts) {
      this.logger.error(
        `[PuuidCrossref] 최대 재시도(${maxAttempts}회) 초과 matchId=${matchId}`,
      );
      this.clearRetryTimer(timerKey);
      return;
    }

    if (this.retryTimers.has(timerKey)) {
      return;
    }

    const nextAttempt = attemptNumber + 1;
    this.logger.log(
      `[PuuidCrossref] 재시도 예약 ${nextAttempt}/${maxAttempts} matchId=${matchId} (${delayMs / 1000}초 후)`,
    );

    const timer = setTimeout(async () => {
      this.retryTimers.delete(timerKey);
      await this.collectMatchDataByPuuidCrossref(matchId, nextAttempt);
    }, delayMs);
    this.retryTimers.set(timerKey, timer);
  }

  /**
   * Schedule a retry for data collection
   */
  private async scheduleRetry(
    matchId: string,
    attemptNumber: number,
  ): Promise<void> {
    const maxAttempts = 5;
    const delayMs = 60000; // 1 minute

    if (attemptNumber >= maxAttempts) {
      this.logger.error(
        `Max retry attempts (${maxAttempts}) reached for match ${matchId}`,
      );
      this.clearRetryTimer(matchId);
      return;
    }

    if (this.retryTimers.has(matchId)) {
      this.logger.debug(
        `Retry already scheduled for match ${matchId}, skipping duplicate`,
      );
      return;
    }

    const nextAttempt = attemptNumber + 1;

    this.logger.log(
      `Scheduling retry ${nextAttempt}/${maxAttempts} for match ${matchId} in ${delayMs}ms`,
    );

    const timer = setTimeout(async () => {
      this.retryTimers.delete(matchId);
      try {
        await this.collectMatchData(matchId, nextAttempt);
      } catch (error) {
        this.logger.error(
          `Retry ${nextAttempt} failed for match ${matchId}`,
          error,
        );
        await this.scheduleRetry(matchId, nextAttempt);
      }
    }, delayMs);
    this.retryTimers.set(matchId, timer);
  }

  /**
   * 전적 미수집 완료 매치를 일괄 재처리한다.
   * - tournamentCode 있음 → Tournament API 경로
   * - tournamentCode 없음 → PUUID 크로스레퍼런스 경로
   */
  async collectPendingMatches(): Promise<void> {
    try {
      const now = Date.now();

      // 백오프가 끝난 매치만 대상으로 삼는다.
      // 계속 실패하는 최신 매치가 매 사이클 20개 슬롯을 독점하면 이전 미수집
      // 경기가 영영 처리되지 못하므로, 실패할수록 뒤로 미루고 상한을 넘기면 제외한다.
      const candidates = await this.prisma.match.findMany({
        where: {
          status: "COMPLETED",
          dataCollected: false,
          // roomId가 있는 내전 매치만 대상 (외부 인제스트 랭크 매치 제외)
          roomId: { not: null },
          collectAttempts: { lt: MAX_COLLECT_ATTEMPTS },
        },
        select: {
          id: true,
          tournamentCode: true,
          riotMatchId: true,
          collectAttempts: true,
          lastCollectAttemptAt: true,
        },
        // 1순위: 시도 횟수가 적은 것 — 한 번도 시도하지 않은 매치가 항상 먼저 처리된다.
        // 2순위: 같은 시도 횟수라면 최근 경기부터 (사용자가 기다리는 건 방금 끝난 판이다).
        orderBy: [{ collectAttempts: "asc" }, { completedAt: "desc" }],
        take: COLLECT_CANDIDATE_POOL,
      });

      const matches = candidates
        .filter((match) => this.isCollectBackoffElapsed(match, now))
        .slice(0, COLLECT_BATCH_SIZE);

      this.logger.log(
        `Found ${matches.length} matches pending data collection ` +
          `(백오프 대기 중 ${candidates.length - matches.length}건)`,
      );

      for (const match of matches) {
        // 시도 횟수를 먼저 기록한다. 수집이 성공하면 dataCollected=true가 되어
        // 어차피 대상에서 빠지고, 실패하면 이 값이 다음 백오프 간격을 늘린다.
        await this.prisma.match.update({
          where: { id: match.id },
          data: {
            collectAttempts: { increment: 1 },
            lastCollectAttemptAt: new Date(),
          },
        });

        if (match.tournamentCode && !match.riotMatchId) {
          await this.collectMatchData(match.id);
        } else {
          await this.collectMatchDataByPuuidCrossref(match.id);
        }
        // 연속 요청으로 rate limit 초과 방지
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (error) {
      this.logger.error("Error collecting pending matches:", error);
    }
  }

  /** 실패 횟수에 따른 지수 백오프가 지났는지 판단한다. */
  private isCollectBackoffElapsed(
    match: { collectAttempts: number; lastCollectAttemptAt: Date | null },
    now: number,
  ): boolean {
    if (match.collectAttempts === 0 || !match.lastCollectAttemptAt) return true;

    // 15분 → 30분 → 1시간 → 2시간 … (상한 24시간)
    const backoffMs = Math.min(
      COLLECT_BASE_BACKOFF_MS * 2 ** (match.collectAttempts - 1),
      COLLECT_MAX_BACKOFF_MS,
    );

    return now - match.lastCollectAttemptAt.getTime() >= backoffMs;
  }

  private clearRetryTimer(matchId: string): void {
    const timer = this.retryTimers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(matchId);
    }
  }
}
