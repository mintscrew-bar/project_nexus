import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RiotMatchService, MatchDto } from "../riot/riot-match.service";

@Injectable()
export class MatchDataCollectionService {
  private readonly logger = new Logger(MatchDataCollectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riotMatchService: RiotMatchService,
  ) {}

  /**
   * Collect and save match data from Riot API
   */
  async collectMatchData(matchId: string): Promise<void> {
    try {
      this.logger.log(`Starting data collection for match ${matchId}`);

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
        return;
      }

      if (!match.tournamentCode) {
        this.logger.warn(`Match ${matchId} has no tournament code`);
        return;
      }

      // Get match IDs from tournament code
      const riotMatchIds = await this.riotMatchService.getMatchIdsByTournamentCode(
        match.tournamentCode
      );

      if (riotMatchIds.length === 0) {
        this.logger.warn(`No Riot match IDs found for tournament code ${match.tournamentCode}`);
        // Wait and retry - match might not be available yet
        await this.scheduleRetry(matchId, 1);
        return;
      }

      // Usually there should be only one match per tournament code
      const riotMatchId = riotMatchIds[0];

      this.logger.log(`Found Riot match ID: ${riotMatchId}`);

      // Fetch match data
      const matchData = await this.riotMatchService.getMatchById(riotMatchId);

      if (!matchData) {
        this.logger.error(`Failed to fetch match data for ${riotMatchId}`);
        await this.scheduleRetry(matchId, 1);
        return;
      }

      // Update match with Riot match ID
      await this.prisma.match.update({
        where: { id: matchId },
        data: { riotMatchId },
      });

      // Save match data
      await this.saveMatchData(matchId, match, matchData);

      this.logger.log(`Successfully collected data for match ${matchId}`);
    } catch (error) {
      this.logger.error(`Error collecting data for match ${matchId}:`, error);
      throw error;
    }
  }

  /**
   * Save match data to database
   */
  private async saveMatchData(
    matchId: string,
    match: any,
    matchData: MatchDto
  ): Promise<void> {
    try {
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

      // Save participants
      for (const participant of matchData.info.participants) {
        const userMapping = puuidToUser.get(participant.puuid);

        if (!userMapping) {
          this.logger.warn(
            `PUUID ${participant.puuid} not found in user mapping, skipping`
          );
          continue;
        }

        await this.prisma.matchParticipant.create({
          data: {
            matchId,
            userId: userMapping.userId,
            teamId: userMapping.teamId,

            // Champion & Position
            championId: participant.championId,
            championName: participant.championName,
            position: participant.teamPosition || "UNKNOWN",

            // Summoner Spells
            summoner1Id: participant.summoner1Id,
            summoner2Id: participant.summoner2Id,

            // KDA
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,

            // Farm & Gold
            totalMinionsKilled: participant.totalMinionsKilled,
            neutralMinionsKilled: participant.neutralMinionsKilled,
            goldEarned: participant.goldEarned,
            goldSpent: participant.goldSpent,

            // Damage
            totalDamageDealt: participant.totalDamageDealt,
            totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
            totalDamageTaken: participant.totalDamageTaken,
            totalHeal: participant.totalHeal,
            damageSelfMitigated: participant.damageSelfMitigated,

            // Vision
            visionScore: participant.visionScore,
            wardsPlaced: participant.wardsPlaced,
            wardsKilled: participant.wardsKilled,
            detectorWardsPlaced: participant.detectorWardsPlaced,

            // Items
            item0: participant.item0,
            item1: participant.item1,
            item2: participant.item2,
            item3: participant.item3,
            item4: participant.item4,
            item5: participant.item5,
            item6: participant.item6,

            // Perks (stored as JSON)
            perks: participant.perks,

            // Stats
            champLevel: participant.champLevel,
            largestKillingSpree: participant.largestKillingSpree,
            largestMultiKill: participant.largestMultiKill,
            longestTimeSpentLiving: participant.longestTimeSpentLiving,
            totalTimeSpentDead: participant.totalTimeSpentDead,

            // Objectives
            turretKills: participant.turretKills || 0,
            inhibitorKills: participant.inhibitorKills || 0,
            dragonKills: participant.dragonKills || 0,
            baronKills: participant.baronKills || 0,

            // Performance
            doubleKills: participant.doubleKills,
            tripleKills: participant.tripleKills,
            quadraKills: participant.quadraKills,
            pentaKills: participant.pentaKills,
            firstBloodKill: participant.firstBloodKill,
            firstTowerKill: participant.firstTowerKill,

            // Result
            win: participant.win,
          },
        });
      }

      // Save team stats
      for (const team of matchData.info.teams) {
        const teamId = team.teamId === 100 ? match.teamAId : match.teamBId;

        await this.prisma.matchTeamStats.create({
          data: {
            matchId,
            teamId,
            win: team.win,

            // Objectives
            towerKills: team.objectives.tower.kills,
            inhibitorKills: team.objectives.inhibitor.kills,
            baronKills: team.objectives.baron.kills,
            dragonKills: team.objectives.dragon.kills,
            riftHeraldKills: team.objectives.riftHerald.kills,

            // Bans
            bans: team.bans,
          },
        });
      }

      this.logger.log(`Saved match data for match ${matchId}`);
    } catch (error) {
      this.logger.error(`Error saving match data for match ${matchId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule a retry for data collection
   */
  private async scheduleRetry(matchId: string, attemptNumber: number): Promise<void> {
    const maxAttempts = 5;
    const delayMs = 60000; // 1 minute

    if (attemptNumber >= maxAttempts) {
      this.logger.error(
        `Max retry attempts (${maxAttempts}) reached for match ${matchId}`
      );
      return;
    }

    this.logger.log(
      `Scheduling retry ${attemptNumber + 1}/${maxAttempts} for match ${matchId} in ${delayMs}ms`
    );

    setTimeout(async () => {
      try {
        await this.collectMatchData(matchId);
      } catch (error) {
        this.logger.error(`Retry ${attemptNumber + 1} failed for match ${matchId}`);
        await this.scheduleRetry(matchId, attemptNumber + 1);
      }
    }, delayMs);
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

      this.logger.log(`Found ${matches.length} matches pending data collection`);

      for (const match of matches) {
        await this.collectMatchData(match.id);
        // Add delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      this.logger.error("Error collecting pending matches:", error);
    }
  }
}
