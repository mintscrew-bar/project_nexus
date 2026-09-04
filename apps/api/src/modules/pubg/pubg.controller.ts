import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  LookupPubgPlayerDto,
  RegisterPubgAccountDto,
  ReportKillMatchDto,
  UpdatePubgScoreDto,
} from "./dto";
import { PubgService } from "./pubg.service";
import { PubgKillMatchService } from "./pubg-kill-match.service";
import { PubgHistoryService } from "./pubg-history.service";

@Controller("pubg")
@UseGuards(JwtAuthGuard)
export class PubgController {
  constructor(
    private readonly pubgService: PubgService,
    private readonly killMatchService: PubgKillMatchService,
    private readonly historyService: PubgHistoryService,
  ) {}

  @Get("accounts")
  getAccounts(@CurrentUser("sub") userId: string) {
    return this.pubgService.getAccounts(userId);
  }

  /**
   * 등록 전 닉네임 확인. 계정 존재 여부·플레이 플랫폼·중복 등록 여부를 돌려준다.
   * 조회가 PUBG 전역 예산(10 req/분)을 쓰므로 등록과 분리해 한 번만 부르게 한다.
   */
  @Post("accounts/lookup")
  @HttpCode(HttpStatus.OK)
  lookupPlayer(@Body() dto: LookupPubgPlayerDto) {
    return this.pubgService.lookupPlayer(dto.playerName);
  }

  @Post("accounts")
  @HttpCode(HttpStatus.CREATED)
  registerAccount(
    @CurrentUser("sub") userId: string,
    @Body() dto: RegisterPubgAccountDto,
  ) {
    return this.pubgService.registerAccount(userId, dto);
  }

  @Delete("accounts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
  ) {
    await this.pubgService.deleteAccount(userId, accountId);
  }

  @Patch("accounts/:id/primary")
  setPrimary(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
  ) {
    return this.pubgService.setPrimary(userId, accountId);
  }

  /** 배그 전적 — 스크림 참가 이력과 킬내기 결과를 시간순으로 섞어 돌려준다. */
  @Get("history/:userId")
  getUserHistory(@Param("userId") userId: string) {
    return this.historyService.getUserHistory(userId);
  }

  /** 킬내기 결과 — 승패는 기존 2팀 흐름을 쓰고 킬 수만 얹는다. */
  @Get("matches/:matchId/kills")
  getKillMatchResult(@Param("matchId") matchId: string) {
    return this.killMatchService.getKillMatchResult(matchId);
  }

  @Post("matches/:matchId/kills")
  reportKillMatch(
    @CurrentUser("sub") userId: string,
    @Param("matchId") matchId: string,
    @Body() dto: ReportKillMatchDto,
  ) {
    return this.killMatchService.reportKills(userId, matchId, dto);
  }

  @Patch("accounts/:id/score")
  updateScore(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
    @Body() dto: UpdatePubgScoreDto,
  ) {
    return this.pubgService.updateScore(userId, accountId, dto);
  }
}
