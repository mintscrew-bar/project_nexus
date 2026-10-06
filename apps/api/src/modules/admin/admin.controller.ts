import type { Response } from "express";
import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  Res,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminStatsSnapshotService } from "./admin-stats-snapshot.service";
import { AdminService } from "./admin.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@nexus/database";
import { TasksService } from "../tasks/tasks.service";
import { RoomGateway } from "../room/room.gateway";
import { RoomService } from "../room/room.service";
import {
  AdminGameQueryDto,
  AdminScrimsQueryDto,
  AdminPageQueryDto,
  AdminReportsQueryDto,
  AdminChatLogsQueryDto,
  AdminRoomsQueryDto,
  AdminAppealsQueryDto,
  AdminInternalMatchesQueryDto,
  AdminRecomputeStatsQueryDto,
  SendUserMessageDto,
  AdminRoomFunnelQueryDto,
  AdminStatsSeriesQueryDto,
  AdminAuditLogsQueryDto,
} from "./dto/admin-query.dto";
import {
  AddBotsDto,
  BanUserDto,
  BotCleanupDto,
  PinPostDto,
  RestrictUserDto,
  UpdateUserRoleDto,
  ReviewAppealDto,
  ReviewReportDto,
  SendAnnouncementDto,
} from "./dto/admin-actions.dto";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tasksService: TasksService,
    @Inject(forwardRef(() => RoomGateway))
    private readonly roomGateway: RoomGateway,
    @Inject(forwardRef(() => RoomService))
    private readonly roomService: RoomService,
    private readonly statsSnapshot: AdminStatsSnapshotService,
  ) {}

  // ── Stats ──────────────────────────────────────────────────────────────────
  @Get("stats")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getStats(@Query() query: AdminGameQueryDto) {
    return this.adminService.getStats({ gameTitle: query.gameTitle });
  }

  @Get("room-funnel")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getRoomFunnel(@Query() query: AdminRoomFunnelQueryDto) {
    return this.adminService.getRoomFunnel({
      gameTitle: query.gameTitle,
      days: query.days,
    });
  }

  // ── 테스트 봇 정리 (ADMIN 전용) ────────────────────────────────────────────
  @Get("bot-cleanup/preview")
  @Roles(UserRole.ADMIN)
  getBotCleanupPreview() {
    return this.adminService.getBotCleanupPreview();
  }

  @Post("bot-cleanup")
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async cleanupBotData(@Body() body: BotCleanupDto, @Request() req: any) {
    const rooms = body?.rooms === true;
    const matches = body?.matches === true;
    if (!rooms && !matches) {
      throw new BadRequestException("정리할 대상을 하나 이상 고르세요.");
    }
    return this.adminService.cleanupBotData({ rooms, matches }, req.user.sub);
  }

  // ── 내보내기 (ADMIN 전용, 개인 식별 정보 없음) ───────────────────────────────
  @Get("export/:dataset")
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async exportDataset(
    @Param("dataset") dataset: string,
    @Query() query: AdminRoomFunnelQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.adminService.exportDataset(dataset, {
      gameTitle: query.gameTitle,
      days: query.days,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.csv);
  }

  // ── 관리 기록 (ADMIN 전용) ─────────────────────────────────────────────────
  @Get("audit-logs")
  @Roles(UserRole.ADMIN)
  getAuditLogs(@Query() query: AdminAuditLogsQueryDto) {
    return this.adminService.getAuditLogs({
      page: query.page,
      limit: query.limit,
      action: query.action,
      adminId: query.adminId,
      targetType: query.targetType,
      from: query.from,
      to: query.to,
    });
  }

  @Get("stats/series")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getStatsSeries(@Query() query: AdminStatsSeriesQueryDto) {
    return this.statsSnapshot.getSeries(query.scope, query.days);
  }

  @Get("stats/signup-sources")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getSignupSources(@Query("days") days?: string) {
    return this.statsSnapshot.getSignupSources(Number(days) || 30);
  }

  @Get("stats/cohorts")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getCohorts(@Query("weeks") weeks?: string) {
    return this.statsSnapshot.getCohortSurvival(Number(weeks) || 8);
  }

  @Post("matches/recompute-stats")
  @Roles(UserRole.ADMIN)
  async recomputeMatchStats(@Query() query: AdminRecomputeStatsQueryDto) {
    const userId = await this.adminService.resolveStatsRecomputeUserId(query);
    await this.tasksService.runMatchStatsCompute(userId);
    return {
      ok: true,
      userId,
    };
  }

  // ── 내전 기록 (실제 진행된 내부 토너먼트 매치) ─────────────────────────────
  // 운영 현황 파악용 조회이므로 매니저(MODERATOR)에게도 열어둔다.
  @Get("matches")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getInternalMatches(@Query() query: AdminInternalMatchesQueryDto) {
    return this.adminService.getInternalMatches({
      page: query.page,
      limit: query.limit,
      status: query.status,
      collected: query.collected,
      search: query.search,
    });
  }

  @Get("matches/:id")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getInternalMatchDetail(@Param("id") matchId: string) {
    return this.adminService.getInternalMatchDetail(matchId);
  }

  @Post("matches/:id/retry-collection")
  @Roles(UserRole.ADMIN)
  retryMatchCollection(@Param("id") matchId: string, @Request() req: any) {
    return this.adminService.retryMatchCollection(matchId, req.user.sub);
  }

  // ── 스크림 기록 (배그) ─────────────────────────────────────────────────────
  // 배그 내전 결과는 `Match` 가 아니라 `Scrim` 에 쌓인다(라운드·포인트 구조).
  @Get("scrims")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getScrims(@Query() query: AdminScrimsQueryDto) {
    return this.adminService.getScrims({
      page: query.page,
      limit: query.limit,
      status: query.status,
      search: query.search,
    });
  }

  @Get("scrims/:id")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getScrimDetail(@Param("id") scrimId: string) {
    return this.adminService.getScrimDetail(scrimId);
  }

  @Post("scrims/:id/rounds/:roundId/reset")
  @Roles(UserRole.ADMIN)
  resetScrimRound(
    @Param("id") scrimId: string,
    @Param("roundId") roundId: string,
    @Request() req: any,
  ) {
    return this.adminService.resetScrimRound(scrimId, roundId, req.user.sub);
  }

  @Post("scrims/:id/retry-collection")
  @Roles(UserRole.ADMIN)
  retryScrimCollection(@Param("id") scrimId: string, @Request() req: any) {
    return this.adminService.retryScrimCollection(scrimId, req.user.sub);
  }

  @Post("scrims/:id/cancel")
  @Roles(UserRole.ADMIN)
  cancelScrim(@Param("id") scrimId: string, @Request() req: any) {
    return this.adminService.cancelScrim(scrimId, req.user.sub);
  }

  // ── Users ────────────────────────────────────────────────────────────────
  // 조회 및 제재(restrict/unrestrict)는 ADMIN + MODERATOR(매니저), 밴/역할변경은 ADMIN 전용
  @Get("users")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getUsers(@Query() query: AdminPageQueryDto) {
    return this.adminService.getUsers({
      page: query.page,
      limit: query.limit,
      search: query.search,
      kind: query.kind,
      role: query.role,
      statusFilter: query.statusFilter,
      presence: query.presence,
    });
  }

  @Get("users/:id/activity")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getUserActivity(@Param("id") userId: string) {
    return this.adminService.getUserActivity(userId);
  }

  @Patch("users/:id/role")
  @Roles(UserRole.ADMIN)
  updateUserRole(
    @Param("id") targetUserId: string,
    @Body() body: UpdateUserRoleDto,
    @Request() req: any,
  ) {
    return this.adminService.updateUserRole(
      targetUserId,
      body.role,
      req.user.sub,
    );
  }

  @Post("users/:id/ban")
  @Roles(UserRole.ADMIN)
  banUser(
    @Param("id") targetUserId: string,
    @Body() body: BanUserDto,
    @Request() req: any,
  ) {
    return this.adminService.banUser(
      targetUserId,
      req.user.sub,
      body.reason,
      body.banUntil,
    );
  }

  @Post("users/:id/unban")
  @Roles(UserRole.ADMIN)
  unbanUser(@Param("id") targetUserId: string, @Request() req: any) {
    return this.adminService.unbanUser(targetUserId, req.user.sub);
  }

  @Post("users/:id/restrict")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  restrictUser(
    @Param("id") targetUserId: string,
    @Body() body: RestrictUserDto,
    @Request() req: any,
  ) {
    return this.adminService.restrictUser(
      targetUserId,
      req.user.sub,
      body.restrictedUntil,
    );
  }

  @Post("users/:id/unrestrict")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  unrestrictUser(@Param("id") targetUserId: string, @Request() req: any) {
    return this.adminService.unrestrictUser(targetUserId, req.user.sub);
  }

  // ── Reports (ADMIN + MODERATOR) ──────────────────────────────────────────
  @Get("reports")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 분당 60회
  getReports(@Query() query: AdminReportsQueryDto) {
    return this.adminService.getReports({
      page: query.page,
      limit: query.limit,
      status: query.status,
      category: query.category as "user" | "post" | undefined,
    });
  }

  @Patch("reports/:id/review")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  reviewReport(
    @Param("id") reportId: string,
    @Body() body: ReviewReportDto,
    @Request() req: any,
  ) {
    return this.adminService.reviewReport(
      reportId,
      body.status,
      body.reviewerNote,
      req.user.sub,
      body.category ?? "user",
    );
  }

  // ── Announcements (ADMIN only) ──────────────────────────────────────────
  @Post("announcements")
  @Roles(UserRole.ADMIN)
  sendAnnouncement(@Body() body: SendAnnouncementDto, @Request() req: any) {
    return this.adminService.sendAnnouncement(
      body.title,
      body.message,
      req.user.sub,
      body.link,
    );
  }

  // 특정 유저(단일/다중)에게 개인 쪽지(DM) 또는 개인 공지(알림) 발송
  @Post("messages")
  @Roles(UserRole.ADMIN)
  sendUserMessage(@Body() body: SendUserMessageDto, @Request() req: any) {
    return this.adminService.sendUserMessage(req.user.sub, body);
  }

  // ── Client Error Logs (ADMIN only) ─────────────────────────────────────────
  @Get("error-logs")
  @Roles(UserRole.ADMIN)
  getClientErrorLogs(@Query() query: AdminPageQueryDto) {
    return this.adminService.getClientErrorLogs({
      page: query.page,
      limit: query.limit,
      search: query.search,
    });
  }

  // ── Chat Logs (ADMIN + MODERATOR) ──────────────────────────────────────────
  @Get("chat-logs")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getChatLogs(@Query() query: AdminChatLogsQueryDto) {
    return this.adminService.getChatLogs({
      page: query.page,
      limit: query.limit,
      category: query.category as any,
      roomName: query.roomName,
      userId: query.userId,
      search: query.search,
    });
  }

  // ── Community (ADMIN + MODERATOR) ──────────────────────────────────────────
  @Get("posts")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getPosts(@Query() query: AdminPageQueryDto) {
    return this.adminService.getPosts({
      page: query.page,
      limit: query.limit,
      search: query.search,
      gameTitle: query.gameTitle,
    });
  }

  @Delete("posts/:id")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  deletePost(@Param("id") postId: string, @Request() req: any) {
    return this.adminService.deletePost(postId, req.user.sub);
  }

  @Patch("posts/:id/pin")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  pinPost(
    @Param("id") postId: string,
    @Body() body: PinPostDto,
    @Request() req: any,
  ) {
    return this.adminService.pinPost(postId, body.isPinned, req.user.sub);
  }

  @Delete("comments/:id")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  deleteComment(@Param("id") commentId: string, @Request() req: any) {
    return this.adminService.deleteComment(commentId, req.user.sub);
  }

  // ── Clans (ADMIN only) ──────────────────────────────────────────────────────
  @Get("clans")
  @Roles(UserRole.ADMIN)
  getClans(@Query() query: AdminPageQueryDto) {
    return this.adminService.getClans({
      page: query.page,
      limit: query.limit,
      search: query.search,
      gameTitle: query.gameTitle,
    });
  }

  @Delete("clans/:id")
  @Roles(UserRole.ADMIN)
  deleteClan(@Param("id") clanId: string, @Request() req: any) {
    return this.adminService.deleteClan(clanId, req.user.sub);
  }

  // ── Rooms (ADMIN only) ──────────────────────────────────────────────────────
  @Get("rooms")
  @Roles(UserRole.ADMIN)
  getRooms(@Query() query: AdminRoomsQueryDto) {
    return this.adminService.getRooms({
      page: query.page,
      limit: query.limit,
      status: query.status,
      gameTitle: query.gameTitle,
    });
  }

  @Post("rooms/:id/close")
  @Roles(UserRole.ADMIN)
  async closeRoom(@Param("id") roomId: string, @Request() req: any) {
    const result = await this.adminService.closeRoom(roomId, req.user.sub);

    try {
      await this.roomGateway.broadcastRoomDelta("remove", roomId);
    } catch (error) {
      console.error("[Admin] Failed to broadcast room removal:", error);
    }

    return result;
  }

  // ── Test Bots (ADMIN only) ─────────────────────────────────────────────────
  @Post("rooms/:id/add-bot")
  @Roles(UserRole.ADMIN)
  async addBotToRoom(
    @Param("id") roomId: string,
    @Body() body: AddBotsDto,
    @Request() req: any,
  ) {
    const result = await this.adminService.addBotToRoom(
      roomId,
      req.user.sub,
      body.count ?? 1,
    );

    // 봇 추가 후 실시간 업데이트
    try {
      // 최신 방 데이터 조회
      const updatedRoom = await this.roomService.getRoomById(roomId);

      // 같은 방에 있는 유저들에게 업데이트 알림
      this.roomGateway.notifyRoomUpdate(roomId, "room-updated", updatedRoom);

      // 방 목록 구독자들에게 update delta 전송
      await this.roomGateway.broadcastRoomDelta("update", roomId);
    } catch (error) {
      // 실시간 업데이트 실패해도 봇 추가는 성공으로 처리
      console.error("[Admin] Failed to broadcast bot addition:", error);
    }

    return result;
  }

  // ── Appeals (ADMIN + MODERATOR) ─────────────────────────────────────────────

  @Get("appeals")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getAppeals(@Query() query: AdminAppealsQueryDto) {
    return this.adminService.getAppeals({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
  }

  @Patch("appeals/:id/review")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  reviewAppeal(
    @Param("id") appealId: string,
    @Body() body: ReviewAppealDto,
    @Request() req: any,
  ) {
    return this.adminService.reviewAppeal(
      appealId,
      body.status,
      req.user.sub,
      body.adminNote,
    );
  }

  // ── Discord 길드 연동 (멀티 길드) ──────────────────────────────────────────

  @Get("discord/guild-links")
  @Roles(UserRole.ADMIN)
  getDiscordGuildLinks() {
    return this.adminService.getDiscordGuildLinks();
  }

  @Post("discord/test-alert")
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  sendDiscordTestAlert(@Request() req: any) {
    return this.adminService.sendDiscordTestAlert(req.user.sub);
  }

  @Patch("discord/guild-links/:id/approve")
  @Roles(UserRole.ADMIN)
  approveDiscordGuildLink(@Param("id") id: string, @Request() req: any) {
    return this.adminService.approveDiscordGuildLink(id, req.user.sub);
  }

  @Patch("discord/guild-links/:id/disable")
  @Roles(UserRole.ADMIN)
  disableDiscordGuildLink(@Param("id") id: string, @Request() req: any) {
    return this.adminService.disableDiscordGuildLink(id, req.user.sub);
  }
}
