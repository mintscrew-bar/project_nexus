import {
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
  Inject,
  forwardRef,
} from "@nestjs/common";
import { AdminService } from "./admin.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@nexus/database";
import { RoomGateway } from "../room/room.gateway";
import { RoomService } from "../room/room.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    @Inject(forwardRef(() => RoomGateway))
    private readonly roomGateway: RoomGateway,
    @Inject(forwardRef(() => RoomService))
    private readonly roomService: RoomService,
  ) {}

  // ── Stats ──────────────────────────────────────────────────────────────────
  @Get("stats")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getStats() {
    return this.adminService.getStats();
  }

  // ── Users (ADMIN only) ──────────────────────────────────────────────────────
  @Get("users")
  @Roles(UserRole.ADMIN)
  getUsers(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("search") search?: string,
  ) {
    return this.adminService.getUsers({ page: parseInt(page), limit: parseInt(limit), search });
  }

  @Patch("users/:id/role")
  @Roles(UserRole.ADMIN)
  updateUserRole(
    @Param("id") targetUserId: string,
    @Body("role") role: UserRole,
    @Request() req: any,
  ) {
    return this.adminService.updateUserRole(targetUserId, role, req.user.sub);
  }

  @Post("users/:id/ban")
  @Roles(UserRole.ADMIN)
  banUser(
    @Param("id") targetUserId: string,
    @Body() body: { reason: string; banUntil?: string },
    @Request() req: any,
  ) {
    return this.adminService.banUser(targetUserId, req.user.sub, body.reason, body.banUntil);
  }

  @Post("users/:id/unban")
  @Roles(UserRole.ADMIN)
  unbanUser(@Param("id") targetUserId: string, @Request() req: any) {
    return this.adminService.unbanUser(targetUserId, req.user.sub);
  }

  @Post("users/:id/restrict")
  @Roles(UserRole.ADMIN)
  restrictUser(
    @Param("id") targetUserId: string,
    @Body("restrictedUntil") restrictedUntil: string,
    @Request() req: any,
  ) {
    return this.adminService.restrictUser(targetUserId, req.user.sub, restrictedUntil);
  }

  @Post("users/:id/unrestrict")
  @Roles(UserRole.ADMIN)
  unrestrictUser(@Param("id") targetUserId: string, @Request() req: any) {
    return this.adminService.unrestrictUser(targetUserId, req.user.sub);
  }

  // ── Reports (ADMIN + MODERATOR) ──────────────────────────────────────────
  @Get("reports")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getReports(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("status") status?: string,
    @Query("category") category?: string,
  ) {
    return this.adminService.getReports({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      category: category as "user" | "post" | undefined,
    });
  }

  @Patch("reports/:id/review")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  reviewReport(
    @Param("id") reportId: string,
    @Body() body: { status: "APPROVED" | "REJECTED"; reviewerNote: string; category?: string },
    @Request() req: any,
  ) {
    return this.adminService.reviewReport(
      reportId,
      body.status,
      body.reviewerNote,
      req.user.sub,
      (body.category as "user" | "post") || "user",
    );
  }

  // ── Announcements (ADMIN only) ──────────────────────────────────────────
  @Post("announcements")
  @Roles(UserRole.ADMIN)
  sendAnnouncement(
    @Body() body: { title: string; message: string; link?: string },
    @Request() req: any,
  ) {
    return this.adminService.sendAnnouncement(body.title, body.message, req.user.sub, body.link);
  }

  // ── Chat Logs (ADMIN + MODERATOR) ──────────────────────────────────────────
  @Get("chat-logs")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getChatLogs(
    @Query("page") page = "1",
    @Query("limit") limit = "50",
    @Query("category") category?: string,
    @Query("roomName") roomName?: string,
    @Query("userId") userId?: string,
    @Query("search") search?: string,
  ) {
    return this.adminService.getChatLogs({
      page: parseInt(page),
      limit: parseInt(limit),
      category: category as any,
      roomName,
      userId,
      search,
    });
  }

  // ── Community (ADMIN + MODERATOR) ──────────────────────────────────────────
  @Get("posts")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  getPosts(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("search") search?: string,
  ) {
    return this.adminService.getPosts({ page: parseInt(page), limit: parseInt(limit), search });
  }

  @Delete("posts/:id")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  deletePost(@Param("id") postId: string, @Request() req: any) {
    return this.adminService.deletePost(postId, req.user.sub);
  }

  @Patch("posts/:id/pin")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  pinPost(@Param("id") postId: string, @Body("isPinned") isPinned: boolean, @Request() req: any) {
    return this.adminService.pinPost(postId, isPinned, req.user.sub);
  }

  @Delete("comments/:id")
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  deleteComment(@Param("id") commentId: string, @Request() req: any) {
    return this.adminService.deleteComment(commentId, req.user.sub);
  }

  // ── Clans (ADMIN only) ──────────────────────────────────────────────────────
  @Get("clans")
  @Roles(UserRole.ADMIN)
  getClans(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("search") search?: string,
  ) {
    return this.adminService.getClans({ page: parseInt(page), limit: parseInt(limit), search });
  }

  @Delete("clans/:id")
  @Roles(UserRole.ADMIN)
  deleteClan(@Param("id") clanId: string, @Request() req: any) {
    return this.adminService.deleteClan(clanId, req.user.sub);
  }

  // ── Rooms (ADMIN only) ──────────────────────────────────────────────────────
  @Get("rooms")
  @Roles(UserRole.ADMIN)
  getRooms(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("status") status?: string,
  ) {
    return this.adminService.getRooms({ page: parseInt(page), limit: parseInt(limit), status });
  }

  @Post("rooms/:id/close")
  @Roles(UserRole.ADMIN)
  closeRoom(@Param("id") roomId: string, @Request() req: any) {
    return this.adminService.closeRoom(roomId, req.user.sub);
  }

  // ── Test Bots (ADMIN only) ─────────────────────────────────────────────────
  @Post("rooms/:id/add-bot")
  @Roles(UserRole.ADMIN)
  async addBotToRoom(
    @Param("id") roomId: string,
    @Body("count") count = 1,
    @Request() req: any,
  ) {
    const result = await this.adminService.addBotToRoom(roomId, req.user.sub, count);

    // 봇 추가 후 실시간 업데이트
    try {
      // 최신 방 데이터 조회
      const updatedRoom = await this.roomService.getRoomById(roomId);

      // 같은 방에 있는 유저들에게 업데이트 알림
      this.roomGateway.notifyRoomUpdate(roomId, "room-updated", updatedRoom);

      // 방 목록 구독자들에게 업데이트 알림
      await this.roomGateway.broadcastRoomListUpdate();
    } catch (error) {
      // 실시간 업데이트 실패해도 봇 추가는 성공으로 처리
      console.error("[Admin] Failed to broadcast bot addition:", error);
    }

    return result;
  }
}
