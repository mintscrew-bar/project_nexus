import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@nexus/database";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { MedalService } from "./medal.service";
import {
  AdjustMedalDto,
  RetroMedalDto,
  VoidMatchMedalDto,
} from "./dto/adjust-medal.dto";
import { MatchMedalService } from "./match-medal.service";

@Controller("medals")
export class MedalController {
  constructor(
    private readonly medalService: MedalService,
    private readonly matchMedals: MatchMedalService,
  ) {}

  /** 내 메달 잔액 */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getMyBalance(@CurrentUser("sub") userId: string) {
    return { balance: await this.medalService.getBalance(userId) };
  }

  /** 내 메달 내역 (최신순, 커서 페이지) */
  @Get("me/history")
  @UseGuards(JwtAuthGuard)
  async getMyHistory(
    @CurrentUser("sub") userId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const n = limit ? Number.parseInt(limit, 10) : undefined;
    return this.medalService.getHistory(userId, {
      cursor: cursor || undefined,
      limit: Number.isFinite(n) ? n : undefined,
    });
  }

  /** 관리자 지급·회수 — 원장 한 줄 + 감사 로그 */
  @Post("admin/adjust")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminAdjust(
    @CurrentUser("sub") adminId: string,
    @Body() dto: AdjustMedalDto,
  ) {
    return this.medalService.adminAdjust({ adminId, ...dto });
  }

  /**
   * 소급 지급 — 메달 출시 전에 끝난 내전 전부를 끝난 순서대로 정산한다(출시 첫날 한 번).
   * dryRun 이면 쓰지 않고 몇 경기·몇 메달·상위 받는 사람을 돌려준다.
   * 이미 준 메달은 원장 키가 걸러내므로 다시 눌러도 두 번 주지 않는다.
   */
  @Post("admin/retro")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async retro(@Body() dto: RetroMedalDto) {
    return this.matchMedals.retroGrantAll({ dryRun: dto.dryRun ?? true });
  }

  /** 경기 무효 처리 — 이후 정산에서 빼고 이미 준 메달을 회수한다 */
  @Post("admin/void-match")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async voidMatch(
    @CurrentUser("sub") adminId: string,
    @Body() dto: VoidMatchMedalDto,
  ) {
    return this.matchMedals.voidMatch(dto.matchId, adminId, dto.memo);
  }
}
