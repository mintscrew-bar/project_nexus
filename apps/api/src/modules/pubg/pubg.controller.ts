import {
  Body,
  Controller,
  NotFoundException,
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
  UpdatePubgScoreDto,
} from "./dto";
import { PubgService } from "./pubg.service";
import { PubgHistoryService } from "./pubg-history.service";

@Controller("pubg")
@UseGuards(JwtAuthGuard)
export class PubgController {
  constructor(
    private readonly pubgService: PubgService,
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

  /** 공식 PUBG 랭크 스냅샷 갱신. NEXUS 편성 등급과 다른 값이다. */
  @Post("accounts/:id/rank-sync")
  syncRank(@CurrentUser("sub") userId: string, @Param("id") accountId: string) {
    return this.pubgService.refreshRankSnapshot(userId, accountId);
  }

  /**
   * 편성 점수 자동 산정.
   *
   * 본인이 넣은 점수나 운영자 보정은 덮지 않는다 —
   * 사람이 판단한 값을 기계가 조용히 지우면 왜 바뀌었는지 아무도 모른다.
   */
  @Post("accounts/:id/recompute-balance")
  async recomputeBalance(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
  ) {
    // 본인 계정인지 먼저 확인한다(getAccounts 와 같은 소유 검사).
    const accounts = await this.pubgService.getAccounts(userId);
    if (!accounts.some((account) => account.id === accountId)) {
      throw new NotFoundException("PUBG 계정을 찾을 수 없습니다.");
    }
    return this.pubgService.recomputeBalanceScore(accountId);
  }

  /**
   * 편성 등급 변경 이력.
   *
   * 본인 계정만 본다. 마지막 상태만 남기면 왜 이 등급이 됐는지 되짚을 수 없다.
   */
  @Get("accounts/:id/tier-history")
  async getTierHistory(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
  ) {
    const accounts = await this.pubgService.getAccounts(userId);
    if (!accounts.some((account) => account.id === accountId)) {
      throw new NotFoundException("PUBG 계정을 찾을 수 없습니다.");
    }
    return this.pubgService.getTierHistory(accountId);
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
