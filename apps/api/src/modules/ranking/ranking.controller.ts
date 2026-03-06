import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RankingService } from "./ranking.service";

@Controller("ranking")
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  /**
   * 글로벌 랭킹 (페이지네이션, 최소 10판 이상)
   */
  @Get("global")
  async getGlobalRanking(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.rankingService.getGlobalRanking(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * 클랜 내 랭킹
   */
  @Get("clan/:clanId")
  async getClanRanking(
    @Param("clanId") clanId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.rankingService.getClanRanking(
      clanId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * 특정 유저의 글로벌 + 클랜 순위
   */
  @Get("user/:userId")
  async getUserRanking(@Param("userId") userId: string) {
    return this.rankingService.getUserRanking(userId);
  }

  /**
   * 전체 랭킹 재계산 (관리자용)
   */
  @Post("recalculate")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async recalculateAllRankings() {
    return this.rankingService.recalculateAllRankings();
  }
}
