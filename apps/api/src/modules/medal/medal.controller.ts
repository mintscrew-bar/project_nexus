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
import { AdjustMedalDto } from "./dto/adjust-medal.dto";

@Controller("medals")
export class MedalController {
  constructor(private readonly medalService: MedalService) {}

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
}
