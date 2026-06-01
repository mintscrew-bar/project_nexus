import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { StatsService } from "./stats.service";
import { DataDragonService } from "../riot/data-dragon.service";
import {
  FindSummonerQueryDto,
  MatchHistoryQueryDto,
  RefreshStatsQueryDto,
  SearchUsersQueryDto,
  UserMatchHistoryQueryDto,
} from "./dto/stats-query.dto";
import { UserRole } from "@nexus/database";
import { QueueGroup } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(
    private readonly statsService: StatsService,
    private readonly dataDragon: DataDragonService,
  ) {}

  /**
   * DDragon 최신 버전 반환 — 프론트엔드 프로필 아이콘 URL 생성에 사용
   * Redis 캐시(1시간) 우선 반환, 없으면 DDragon API 조회
   */
  @Get("ddragon-version")
  async getDdragonVersion(): Promise<{ version: string }> {
    const version = await this.dataDragon.getLatestVersion();
    return { version };
  }

  /**
   * Get auction statistics for a user
   */
  @Get("user/:userId/auction-stats")
  @UseGuards(JwtAuthGuard)
  async getUserAuctionStats(
    @CurrentUser("sub") requesterId: string,
    @Param("userId") userId: string,
  ) {
    return this.statsService.getUserAuctionStats(userId, requesterId);
  }

  /**
   * Admin-only lab overview for experimental research dashboard
   */
  @Get("lab/overview")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getLabOverview() {
    return this.statsService.getLabOverview();
  }

  /**
   * Get champion statistics for a user
   */
  @Get("user/:userId/champion-stats")
  @UseGuards(JwtAuthGuard)
  async getUserChampionStats(
    @CurrentUser("sub") requesterId: string,
    @Param("userId") userId: string,
  ) {
    return this.statsService.getUserChampionStats(userId, requesterId);
  }

  /**
   * Get position statistics for a user
   */
  @Get("user/:userId/position-stats")
  @UseGuards(JwtAuthGuard)
  async getUserPositionStats(
    @CurrentUser("sub") requesterId: string,
    @Param("userId") userId: string,
  ) {
    return this.statsService.getUserPositionStats(userId, requesterId);
  }

  /**
   * Get user's Riot accounts
   */
  @Get("user/:userId/riot-accounts")
  @UseGuards(JwtAuthGuard)
  async getUserRiotAccounts(
    @CurrentUser("sub") requesterId: string,
    @Param("userId") userId: string,
  ) {
    return this.statsService.getUserRiotAccounts(userId, requesterId);
  }

  /**
   * Find user by Riot account (gameName + tagLine)
   */
  @Get("summoner")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async findUserByRiotAccount(@Query() query: FindSummonerQueryDto) {
    const result = await this.statsService.findUserByRiotAccount(
      query.gameName,
      query.tagLine,
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
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async searchUsers(@Query() query: SearchUsersQueryDto) {
    return this.statsService.searchUsers(query.q, query.limit);
  }

  /**
   * Get match timeline (item purchases, gold/CS/XP per minute)
   */
  @Get("match/:matchId/timeline")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getMatchTimeline(@Param("matchId") matchId: string) {
    return this.statsService.getMatchTimeline(matchId);
  }

  /**
   * 랭크 게임 챔피언별 시즌 전체 통계 (솔로+자유 전부 집계, DB 캐시 활용)
   * 최초 요청 시: 전체 매치 페이징 → DB 저장 → 집계 반환
   * 재요청 시: DB에서 즉시 반환 (Riot API 호출 없음)
   */
  @Get("summoner/:gameName/:tagLine/ranked-champion-stats")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async getRankedChampionStats(
    @Param("gameName") gameName: string,
    @Param("tagLine") tagLine: string,
  ) {
    return this.statsService.getRankedChampionStats(gameName, tagLine);
  }

  @Get("champion-stats")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getChampionStats(
    @Query("gameName") gameName: string,
    @Query("tagLine") tagLine: string,
    @Query("queueGroup") queueGroup: QueueGroup = "ranked",
  ) {
    return this.statsService.getChampionStatsCacheByRiotId(
      gameName,
      tagLine,
      queueGroup,
    );
  }

  // 챔피언 시즌 누적 통계 (등록 무관, puuid 기준). 오래됐으면 background 스캔 큐잉.
  @Get("summoner/:gameName/:tagLine/champion-season")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getChampionSeasonStats(
    @Param("gameName") gameName: string,
    @Param("tagLine") tagLine: string,
  ) {
    return this.statsService.getChampionSeasonStats(
      gameName,
      tagLine,
      "ranked",
    );
  }

  @Get("fetch-status/:userId")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getFetchStatus(@Param("userId") userId: string) {
    return this.statsService.getFetchStatus(userId);
  }

  @Post("refresh/:userId")
  @UseGuards(JwtAuthGuard)
  async enqueueRefresh(
    @CurrentUser("sub") requesterId: string,
    @Param("userId") userId: string,
    @Query() query: RefreshStatsQueryDto,
  ) {
    if (requesterId !== userId) {
      throw new ForbiddenException("Cannot refresh another user's stats");
    }

    const queueGroup = query.queueGroup ?? "ranked";
    await this.statsService.enqueueStatsRefresh(userId, queueGroup);
    return { queued: true, queueGroup };
  }

  /**
   * Get Riot match history for a summoner (by gameName + tagLine)
   */
  @Get("summoner/:gameName/:tagLine/matches")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getSummonerMatchHistory(
    @Param("gameName") gameName: string,
    @Param("tagLine") tagLine: string,
    @Query() query: MatchHistoryQueryDto,
  ) {
    return this.statsService.getRiotMatchHistory(
      gameName,
      tagLine,
      query.count,
      query.queueId,
      query.start,
    );
  }

  /**
   * Get Riot match history for a user (uses primary Riot account)
   */
  @Get("user/:userId/riot-matches")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getUserRiotMatchHistory(
    @Param("userId") userId: string,
    @Query() query: UserMatchHistoryQueryDto,
  ) {
    return this.statsService.getUserRiotMatchHistory(
      userId,
      query.count,
      query.queueId,
    );
  }
}
