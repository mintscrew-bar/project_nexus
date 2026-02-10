import { Controller, Get, Param, Query } from "@nestjs/common";
import { StatsService } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  /**
   * Get champion statistics for a user
   */
  @Get("user/:userId/champion-stats")
  async getUserChampionStats(@Param("userId") userId: string) {
    return this.statsService.getUserChampionStats(userId);
  }

  /**
   * Get position statistics for a user
   */
  @Get("user/:userId/position-stats")
  async getUserPositionStats(@Param("userId") userId: string) {
    return this.statsService.getUserPositionStats(userId);
  }

  /**
   * Get user's Riot accounts
   */
  @Get("user/:userId/riot-accounts")
  async getUserRiotAccounts(@Param("userId") userId: string) {
    return this.statsService.getUserRiotAccounts(userId);
  }

  /**
   * Find user by Riot account (gameName + tagLine)
   */
  @Get("summoner")
  async findUserByRiotAccount(
    @Query("gameName") gameName: string,
    @Query("tagLine") tagLine: string
  ) {
    if (!gameName || !tagLine) {
      return { found: false, message: "gameName and tagLine are required" };
    }

    const result = await this.statsService.findUserByRiotAccount(
      gameName,
      tagLine
    );

    if (!result) {
      return { found: false, message: "No user found with this Riot account" };
    }

    return {
      found: true,
      userId: result.userId,
      riotAccount: result.riotAccount,
    };
  }

  /**
   * Search users by username
   */
  @Get("users/search")
  async searchUsers(
    @Query("q") query: string,
    @Query("limit") limit?: string
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.statsService.searchUsers(query, limitNum);
  }

  /**
   * Get match timeline (item purchases, gold/CS/XP per minute)
   */
  @Get("match/:matchId/timeline")
  async getMatchTimeline(@Param("matchId") matchId: string) {
    return this.statsService.getMatchTimeline(matchId);
  }

  /**
   * Get Riot match history for a summoner (by gameName + tagLine)
   */
  @Get("summoner/:gameName/:tagLine/matches")
  async getSummonerMatchHistory(
    @Param("gameName") gameName: string,
    @Param("tagLine") tagLine: string,
    @Query("count") count?: string,
    @Query("queueId") queueId?: string,
    @Query("start") start?: string
  ) {
    const countNum = count ? parseInt(count, 10) : 20;
    const queueIdNum = queueId ? parseInt(queueId, 10) : undefined;
    const startNum = start ? parseInt(start, 10) : 0;
    return this.statsService.getRiotMatchHistory(
      gameName,
      tagLine,
      countNum,
      queueIdNum,
      startNum
    );
  }

  /**
   * Get Riot match history for a user (uses primary Riot account)
   */
  @Get("user/:userId/riot-matches")
  async getUserRiotMatchHistory(
    @Param("userId") userId: string,
    @Query("count") count?: string,
    @Query("queueId") queueId?: string
  ) {
    const countNum = count ? parseInt(count, 10) : 20;
    const queueIdNum = queueId ? parseInt(queueId, 10) : undefined;
    return this.statsService.getUserRiotMatchHistory(
      userId,
      countNum,
      queueIdNum
    );
  }
}
