import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/decorators/public.decorator";
import { MatchService } from "./match.service";

@Controller("public/matches")
@Public()
export class PublicMatchController {
  constructor(private readonly matchService: MatchService) {}

  /** 검색 사이트맵에 사용할 공개 완료 경기의 최소 정보만 반환한다. */
  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async getCompletedMatches(@Query("limit") rawLimit?: string) {
    const parsed = Number.parseInt(rawLimit ?? "5000", 10);
    const limit = Number.isFinite(parsed) ? parsed : 5000;
    return this.matchService.getPublicCompletedMatches(limit);
  }

  /** 비로그인 방문자도 공개 완료 경기의 결과를 확인할 수 있다. */
  @Get(":id")
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  async getMatch(@Param("id") matchId: string) {
    return this.matchService.getPublicMatchDetails(matchId);
  }
}
