import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RiotMatchService, MatchDto } from "../riot/riot-match.service";
import { normalizeRiotPosition } from "./position-normalizer";

@Injectable()
export class MatchDataCollectionService {
  private readonly logger = new Logger(MatchDataCollectionService.name);
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly riotMatchService: RiotMatchService,
  ) {}

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
      const matchData = await this.riotMatchService.getMatchById(riotMatchId);

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

      // 멱등성 보장:
      // 기존 전적을 트랜잭션 내에서 교체(replace)해 중복/부분 저장을 방지한다.
      await this.prisma.$transaction(async (tx) => {
        await tx.matchParticipant.deleteMany({ where: { matchId } });
        await tx.matchTeamStats.deleteMany({ where: { matchId } });

        for (const participant of matchData.info.participants) {
          const userMapping = puuidToUser.get(participant.puuid);

          if (!userMapping) {
            this.logger.warn(
              `PUUID ${participant.puuid} not found in user mapping, skipping`,
            );
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

      // 참가자 PUUID 수집 (teamA + teamB)
      const allMembers = [
        ...match.teamA.members,
        ...match.teamB.members,
      ];
      const puuidList = allMembers
        .map((m) => m.user.riotAccounts[0]?.puuid)
        .filter((p): p is string => Boolean(p));

      if (puuidList.length < 2) {
        this.logger.warn(
          `[PuuidCrossref] Riot 계정 연동 유저 부족 (${puuidList.length}명), 수집 불가 matchId=${matchId}`,
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

      // 크로스레퍼런스: 최대 3명 PUUID로 커스텀 게임 목록 조회 후 교집합
      const CROSSREF_SAMPLE = Math.min(3, puuidList.length);
      const matchIdSets: Set<string>[] = [];

      for (let i = 0; i < CROSSREF_SAMPLE; i++) {
        const ids = await this.riotMatchService.getMatchIdsByPuuid(
          puuidList[i],
          0,
          20, // 최근 20개로 늘려 누락 방지 (기존 10개에서 증가)
          0, // queue=0: Custom Game
          undefined,
          3,
          startTime,
          endTime,
          "background",
        );
        matchIdSets.push(new Set(ids));
        this.logger.debug(
          `[PuuidCrossref] puuid[${i}] 커스텀 게임 ${ids.length}개`,
        );
      }

      // 교집합 계산
      const [first, ...rest] = matchIdSets;
      const intersection = Array.from(first).filter((id) =>
        rest.every((s) => s.has(id)),
      );

      if (intersection.length === 0) {
        this.logger.warn(
          `[PuuidCrossref] 교집합 없음 (Riot 처리 중일 수 있음), 재시도 예약 matchId=${matchId}`,
        );
        await this.schedulePuuidCrossrefRetry(matchId, attemptNumber);
        return;
      }

      // 교집합이 여러 개면 종료 시각 가장 가까운 것 선택 (실제로는 거의 1개)
      const riotMatchId = intersection[0];
      this.logger.log(
        `[PuuidCrossref] Riot matchId 확인: ${riotMatchId} (교집합 ${intersection.length}개)`,
      );

      const matchData = await this.riotMatchService.getMatchById(
        riotMatchId,
        3,
        "background",
      );

      if (!matchData) {
        this.logger.error(
          `[PuuidCrossref] 매치 데이터 조회 실패: ${riotMatchId}`,
        );
        await this.schedulePuuidCrossrefRetry(matchId, attemptNumber);
        return;
      }

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
      const matches = await this.prisma.match.findMany({
        where: {
          status: "COMPLETED",
          riotMatchId: null,
          // roomId가 있는 내전 매치만 대상 (외부 인제스트 랭크 매치 제외)
          roomId: { not: null },
        },
        select: {
          id: true,
          tournamentCode: true,
        },
      });

      this.logger.log(
        `Found ${matches.length} matches pending data collection`,
      );

      for (const match of matches) {
        if (match.tournamentCode) {
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

  private clearRetryTimer(matchId: string): void {
    const timer = this.retryTimers.get(matchId);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(matchId);
    }
  }
}
