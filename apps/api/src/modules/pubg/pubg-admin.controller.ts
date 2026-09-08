import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { UserRole } from "@nexus/database";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SetPubgTierDto } from "./dto";
import { PubgService } from "./pubg.service";

/**
 * 운영자용 PUBG 편성 등급 조작.
 *
 * 자동 산정(`recomputeBalanceScore`)은 사람이 손으로 넣은 값을 덮지 않는다.
 * 자동이 명백히 틀렸을 때 사람이 개입하는 경로가 여기다 — 사유를 함께 남긴다.
 */
@Controller("admin/pubg")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PubgAdminController {
  constructor(private readonly pubgService: PubgService) {}

  @Patch("accounts/:id/tier")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  setTier(
    @CurrentUser("sub") adminId: string,
    @Param("id") accountId: string,
    @Body() dto: SetPubgTierDto,
  ) {
    return this.pubgService.setTierByAdmin(
      adminId,
      accountId,
      dto.tier,
      dto.note,
    );
  }

  @Get("accounts/:id/tier-history")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getTierHistory(@Param("id") accountId: string) {
    return this.pubgService.getTierHistory(accountId);
  }
}
