import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { LabStatsService } from "./lab-stats.service";
import { StatsService } from "./stats.service";

type Period = "30d" | "90d" | "all";

@Controller("stats/lab")
@UseGuards(JwtAuthGuard)
export class LabController {
  constructor(
    private readonly labStatsService: LabStatsService,
    private readonly statsService: StatsService,
  ) {}

  /**
   * Task 9: 메타 레이더 개요
   * 트렌딩 챔피언 TOP 5, 포지션별 티어 분류, 데이터 현황
   */
  @Get("meta/radar")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getMetaRadar(@Query("period") period: Period = "30d") {
    return this.labStatsService.getMetaRadar(period);
  }

  /**
   * Task 10: 패치 임팩트
   * 이전/이후 패치 챔피언 승률 비교
   */
  @Get("meta/patch-impact")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getPatchImpact() {
    return this.labStatsService.getPatchImpact();
  }

  /**
   * Task 11: 밴률 통계
   * 챔피언별 밴률 + 밴 시 팀 승률 연관성
   */
  @Get("meta/ban-rates")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getBanRates(@Query("period") period: Period = "30d") {
    return this.labStatsService.getBanRates(period);
  }

  /**
   * Task 12: 챔피언 목록 통계
   * 필터: period(30d/90d/all), position(TOP/JUNGLE/MID/ADC/SUPPORT)
   */
  @Get("champions")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getChampions(
    @Query("period") period: Period = "30d",
    @Query("position") position?: string,
  ) {
    return this.labStatsService.getChampions(period, position);
  }

  /**
   * Task 22: 콜드스타트 유저 프로필 fallback
   * 내전 10판 미만일 때 ranked MatchStatsCache를 참고 데이터로 반환
   */
  @Get("user-profile/:userId/fallback")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getUserProfileFallback(
    @CurrentUser("sub") requesterId: string,
    @Param("userId") userId: string,
  ) {
    return this.statsService.getLabUserProfileFallback(userId, requesterId);
  }

  /**
   * Ranked vs custom 비교 프로필
   * 랭크 기준선과 내전 성과의 괴리를 한 응답으로 제공
   */
  @Get("user-profile/:userId/compare")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getUserProfileCompare(
    @CurrentUser("sub") requesterId: string,
    @Param("userId") userId: string,
  ) {
    return this.statsService.getLabUserProfileComparison(userId, requesterId);
  }
}
