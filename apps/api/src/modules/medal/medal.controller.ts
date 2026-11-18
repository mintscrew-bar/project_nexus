import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
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
  AdminLedgerQueryDto,
  RefundCosmeticDto,
  RetroMedalDto,
  VoidMatchMedalDto,
} from "./dto/adjust-medal.dto";
import { ShopService } from "./shop.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CAPPED_REASONS,
  MEDAL_DAILY_CAP,
  MatchMedalService,
  kstDayKey,
} from "./match-medal.service";

@Controller("medals")
export class MedalController {
  constructor(
    private readonly medalService: MedalService,
    private readonly matchMedals: MatchMedalService,
    private readonly shopService: ShopService,
    private readonly prisma: PrismaService,
  ) {}

  /** 내 메달 잔액 */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  async getMyBalance(@CurrentUser("sub") userId: string) {
    return { balance: await this.medalService.getBalance(userId) };
  }

  /** 내 메달 요약 — 메달 화면 위쪽 (오늘 상한 진행·사유별 합계) */
  @Get("me/summary")
  @UseGuards(JwtAuthGuard)
  async getMySummary(@CurrentUser("sub") userId: string) {
    return this.medalService.getSummary(userId, {
      dayKey: kstDayKey(new Date()),
      dailyCap: MEDAL_DAILY_CAP,
      cappedReasons: CAPPED_REASONS,
    });
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

  /** 관리자 원장 조회 — 전체 또는 한 사람, 사유 필터, 최신순 커서 페이지 (Task 17) */
  @Get("admin/ledger")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminLedger(@Query() q: AdminLedgerQueryDto) {
    const n = q.limit ? Number.parseInt(q.limit, 10) : undefined;
    return this.medalService.adminLedger({
      userId: q.userId || undefined,
      reason: q.reason,
      cursor: q.cursor || undefined,
      limit: Number.isFinite(n) ? n : undefined,
    });
  }

  /** 관리자 사용자 메달 상세 — 잔액·합계·사유별, 가진 상품과 장착 (Task 17) */
  @Get("admin/users/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminUser(@Param("userId") userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, avatar: true, createdAt: true },
    });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없어요.");
    const [summary, cosmetics] = await Promise.all([
      this.medalService.getSummary(userId, {
        dayKey: kstDayKey(new Date()),
        dailyCap: MEDAL_DAILY_CAP,
        cappedReasons: CAPPED_REASONS,
      }),
      this.shopService.adminUserCosmetics(userId),
    ]);
    return { user, summary, cosmetics };
  }

  /** 관리자 상점 구매 환불 — 산 값을 돌려주고 보유·장착을 지운다 (Task 17) */
  @Post("admin/refund")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async adminRefund(
    @CurrentUser("sub") adminId: string,
    @Body() dto: RefundCosmeticDto,
  ) {
    return this.shopService.adminRefund({ adminId, ...dto });
  }
}
