import {
  Body,
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  LAB_STATS_DATA_SOURCES,
  LabStatsService,
  type LabStatsDataSource,
} from "./lab-stats.service";
import { StatsService } from "./stats.service";

type Period = "30d" | "90d" | "all";

function parseLabSource(source?: string): LabStatsDataSource {
  const normalized = (source ?? "custom").trim();
  if (LAB_STATS_DATA_SOURCES.includes(normalized as LabStatsDataSource)) {
    return normalized as LabStatsDataSource;
  }
  throw new BadRequestException(
    "source must be one of custom, ranked-community, ranked-meta",
  );
}

// 랩 대시보드: 등록(인증) 유저 누구나 조회 가능.
// 운영 작업(스냅샷 강제 재계산 등)은 admin.controller에서 별도 ADMIN 가드.
@Controller("stats/lab")
@UseGuards(JwtAuthGuard)
export class LabController {
  constructor(
    private readonly labStatsService: LabStatsService,
    private readonly statsService: StatsService,
  ) {}

  /**
   * 랩 데이터 단계 조회
   * 단계 0~4, 총 매치 수, 다음 단계까지 남은 게임 수, 마지막 스냅샷 시각.
   * 등록 유저 누구나 호출 가능 (단계 해금 표시용).
   */
  @Get("data-phase")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getDataPhase() {
    return this.labStatsService.getDataPhase();
  }

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
    @Query("includeLowSample") includeLowSample?: string,
    @Query("source") source?: string,
  ) {
    const includeLow = ["1", "true", "yes", "on"].includes(
      (includeLowSample ?? "").toLowerCase(),
    );
    return this.labStatsService.getChampions(
      period,
      position,
      includeLow,
      parseLabSource(source),
    );
  }

  /**
   * Task 13: 챔피언 상세 통계
   * 기간별 승률 추이, 포지션 분포, 아이템/룬 조합 TOP
   */
  @Get("champions/:championId")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getChampionDetail(
    @Param("championId") championIdParam: string,
    @Query("period") period: Period = "30d",
    @Query("source") source?: string,
  ) {
    const championId = Number(championIdParam);
    if (!Number.isInteger(championId) || championId <= 0) {
      throw new BadRequestException("championId must be a positive integer");
    }

    const detail = await this.labStatsService.getChampionDetail(
      championId,
      period,
      parseLabSource(source),
    );
    if (!detail) {
      throw new NotFoundException("Champion detail not found for this period");
    }

    return detail;
  }

  /**
   * Task 14: 챔피언 장인 통계
   * 티어/표본/승률 게이트 + 동적 완화 + masteryScore
   */
  @Get("champions/:championId/mastery")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getChampionMastery(
    @Param("championId") championIdParam: string,
    @Query("source") source?: string,
  ) {
    const championId = Number(championIdParam);
    if (!Number.isInteger(championId) || championId <= 0) {
      throw new BadRequestException("championId must be a positive integer");
    }

    return this.labStatsService.getChampionMastery(
      championId,
      parseLabSource(source),
    );
  }

  /**
   * Task 15: 시너지 조합 통계
   * period + 특정 챔피언 기준 파트너 필터 지원
   */
  @Get("synergy")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getSynergy(
    @Query("period") period: Period = "30d",
    @Query("championId") championIdParam?: string,
    @Query("limit") limitParam?: string,
  ) {
    let championId: number | undefined;
    if (championIdParam !== undefined) {
      championId = Number(championIdParam);
      if (!Number.isInteger(championId) || championId <= 0) {
        throw new BadRequestException("championId must be a positive integer");
      }
    }

    let limit: number | undefined;
    if (limitParam !== undefined) {
      limit = Number(limitParam);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new BadRequestException("limit must be a positive integer");
      }
    }

    return this.labStatsService.getSynergy(period, championId, limit);
  }

  /**
   * Task 16: 카운터 상성 통계
   * period/champion/vsChampion/position 필터 지원
   */
  @Get("counter")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getCounter(
    @Query("period") period: Period = "30d",
    @Query("championId") championIdParam?: string,
    @Query("vsChampionId") vsChampionIdParam?: string,
    @Query("position") position?: string,
    @Query("limit") limitParam?: string,
  ) {
    let championId: number | undefined;
    if (championIdParam !== undefined) {
      championId = Number(championIdParam);
      if (!Number.isInteger(championId) || championId <= 0) {
        throw new BadRequestException("championId must be a positive integer");
      }
    }

    let vsChampionId: number | undefined;
    if (vsChampionIdParam !== undefined) {
      vsChampionId = Number(vsChampionIdParam);
      if (!Number.isInteger(vsChampionId) || vsChampionId <= 0) {
        throw new BadRequestException(
          "vsChampionId must be a positive integer",
        );
      }
    }

    let limit: number | undefined;
    if (limitParam !== undefined) {
      limit = Number(limitParam);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new BadRequestException("limit must be a positive integer");
      }
    }

    return this.labStatsService.getCounter(
      period,
      championId,
      vsChampionId,
      position,
      limit,
    );
  }

  /**
   * Task 17: 팀 구성 유형 분석 통계
   * 태그 기반 근사 분류 (한타/스플릿/포킹/속공/탱커라인)
   */
  @Get("compositions")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async getCompositions(@Query("period") period: Period = "30d") {
    return this.labStatsService.getCompositions(period);
  }

  /**
   * Task 18: 경매 효율 분석 통계
   * AUCTION 모드 낙찰가 대비 성과 잔차 기반 가성비 분석
   */
  @Get("oracle/auction-efficiency")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getAuctionEfficiency(@Query("period") period: Period = "30d") {
    return this.labStatsService.getAuctionEfficiency(period);
  }

  /**
   * Task 19: 팀 밸런스 예측
   * 요청 팀 구성(teamA/teamB) 기준 예상 승률과 신뢰도 반환
   */
  @Post("oracle/balance-score")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getBalanceScore(@Body() body: { teamA?: string[]; teamB?: string[] }) {
    const teamA = Array.isArray(body?.teamA) ? body.teamA.filter(Boolean) : [];
    const teamB = Array.isArray(body?.teamB) ? body.teamB.filter(Boolean) : [];

    if (teamA.length === 0 || teamB.length === 0) {
      throw new BadRequestException("teamA and teamB must be non-empty arrays");
    }

    const overlap = teamA.filter((id) => teamB.includes(id));
    if (overlap.length > 0) {
      throw new BadRequestException("same user cannot be in both teams");
    }

    return this.labStatsService.getBalanceScore(teamA, teamB);
  }

  /**
   * Task 20: 밴픽 추천
   * global(userIds) 또는 byTeam(teamAUserIds/teamBUserIds) 모드 지원
   */
  @Get("oracle/ban-recommend")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getBanRecommend(
    @Query("period") period: Period = "30d",
    @Query("userIds") userIdsQuery?: string,
    @Query("teamAUserIds") teamAUserIdsQuery?: string,
    @Query("teamBUserIds") teamBUserIdsQuery?: string,
  ) {
    const parseCsv = (value?: string): string[] =>
      (value ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);

    const userIds = parseCsv(userIdsQuery);
    const teamAUserIds = parseCsv(teamAUserIdsQuery);
    const teamBUserIds = parseCsv(teamBUserIdsQuery);

    const byTeamMode = teamAUserIds.length > 0 || teamBUserIds.length > 0;
    if (byTeamMode) {
      if (teamAUserIds.length === 0 || teamBUserIds.length === 0) {
        throw new BadRequestException(
          "teamAUserIds and teamBUserIds must both be provided in byTeam mode",
        );
      }
      const overlap = teamAUserIds.filter((id) => teamBUserIds.includes(id));
      if (overlap.length > 0) {
        throw new BadRequestException("same user cannot be in both teams");
      }
    } else if (userIds.length === 0) {
      throw new BadRequestException(
        "userIds is required when teamAUserIds/teamBUserIds are not provided",
      );
    }

    return this.labStatsService.getBanRecommend({
      period,
      userIds,
      teamAUserIds,
      teamBUserIds,
    });
  }

  /**
   * Task 39: 외부 고티어 랭크 메타 챔피언 스냅샷 조회
   * 내전 LabChampionSnapshot과 분리된 데이터. 메타 레이더 비교 섹션에서 활용.
   */
  @Get("meta/ranked-snapshots")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getRankedChampionSnapshots(
    @Query("period") period: "7d" | "30d" | "current_patch" = "30d",
    @Query("position") position?: string,
  ) {
    return this.labStatsService.getRankedChampionSnapshots(period, position);
  }

  /**
   * Task 38: 시간대별/요일별 패턴 분석
   * 요일 × 시간대 히트맵 + 피크 시간대 집계
   */
  @Get("meta/play-patterns")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getPlayPatterns(@Query("period") period: Period = "30d") {
    return this.labStatsService.getPlayPatterns(period);
  }

  /**
   * Task 37: 유저 간 직접 대전 상성 분석
   * 두 유저가 서로 다른 팀으로 만난 내전 대전 기록 집계
   */
  @Get("oracle/head-to-head")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getHeadToHead(
    @Query("userAId") userAId: string,
    @Query("userBId") userBId: string,
  ) {
    if (!userAId || !userBId) {
      throw new BadRequestException("userAId and userBId are required");
    }
    if (userAId === userBId) {
      throw new BadRequestException(
        "userAId and userBId must be different users",
      );
    }
    return this.labStatsService.getHeadToHead(userAId, userBId);
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
