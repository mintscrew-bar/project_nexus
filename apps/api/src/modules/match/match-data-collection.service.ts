import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RiotMatchService, MatchDto } from "../riot/riot-match.service";

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
              championId: participant.championId,
              championName: participant.championName,
              position: participant.teamPosition || "UNKNOWN",
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
              ...(participant.item7 != null ? { item7: participant.item7 } : {}),
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

        for (const team of matchData.info.teams) {
          const teamId = team.teamId === 100 ? match.teamAId : match.teamBId;
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
   * Collect data for all completed matches that don't have data yet
   */
  async collectPendingMatches(): Promise<void> {
    try {
      const matches = await this.prisma.match.findMany({
        where: {
          status: "COMPLETED",
          riotMatchId: null,
          tournamentCode: { not: null },
        },
        select: {
          id: true,
        },
      });

      this.logger.log(
        `Found ${matches.length} matches pending data collection`,
      );

      for (const match of matches) {
        await this.collectMatchData(match.id);
        // Add delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
