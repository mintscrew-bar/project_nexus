import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@nexus/database";
import {
  LoadRehearsalService,
  type StartOptions,
} from "./load-rehearsal.service";

/**
 * 경매 리허설 — ADMIN 전용.
 *
 * 운영 서버에 부하를 거는 기능이라 MODERATOR 에게도 열지 않는다.
 * 켜져 있지 않으면(ENABLE_LOAD_REHEARSAL != 1) 시작 자체가 거부된다.
 */
@Controller("admin/load-rehearsal")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class LoadRehearsalController {
  constructor(private readonly rehearsal: LoadRehearsalService) {}

  @Get("status")
  getStatus() {
    return this.rehearsal.getStatus();
  }

  @Post("start")
  async start(@Body() body: StartOptions, @Request() req: any) {
    return this.rehearsal.start(req.user.sub, body ?? {});
  }

  @Post("abort")
  async abort() {
    return this.rehearsal.abort();
  }
}
