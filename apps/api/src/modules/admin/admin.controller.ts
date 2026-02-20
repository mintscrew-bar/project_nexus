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
} from "@nestjs/common";
import { AdminService } from "./admin.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@nexus/database";

@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Stats ──────────────────────────────────────────────────────────────────
  @Get("stats")
  getStats() {
    return this.adminService.getStats();
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  @Get("users")
  getUsers(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("search") search?: string,
  ) {
    return this.adminService.getUsers({ page: parseInt(page), limit: parseInt(limit), search });
  }

  @Patch("users/:id/role")
  updateUserRole(
    @Param("id") targetUserId: string,
    @Body("role") role: UserRole,
    @Request() req: any,
  ) {
    return this.adminService.updateUserRole(targetUserId, role, req.user.sub);
  }

  @Post("users/:id/ban")
  banUser(
    @Param("id") targetUserId: string,
    @Body() body: { reason: string; banUntil?: string },
    @Request() req: any,
  ) {
    return this.adminService.banUser(targetUserId, req.user.sub, body.reason, body.banUntil);
  }

  @Post("users/:id/unban")
  unbanUser(@Param("id") targetUserId: string) {
    return this.adminService.unbanUser(targetUserId);
  }

  @Post("users/:id/restrict")
  restrictUser(
    @Param("id") targetUserId: string,
    @Body("restrictedUntil") restrictedUntil: string,
    @Request() req: any,
  ) {
    return this.adminService.restrictUser(targetUserId, req.user.sub, restrictedUntil);
  }

  @Post("users/:id/unrestrict")
  unrestrictUser(@Param("id") targetUserId: string) {
    return this.adminService.unrestrictUser(targetUserId);
  }

  // ── Reports ────────────────────────────────────────────────────────────────
  @Get("reports")
  getReports(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("status") status?: string,
  ) {
    return this.adminService.getReports({ page: parseInt(page), limit: parseInt(limit), status });
  }

  @Patch("reports/:id/review")
  reviewReport(
    @Param("id") reportId: string,
    @Body() body: { status: "APPROVED" | "REJECTED"; reviewerNote: string },
  ) {
    return this.adminService.reviewReport(reportId, body.status, body.reviewerNote);
  }

  // ── Announcements ──────────────────────────────────────────────────────────
  @Post("announcements")
  sendAnnouncement(@Body() body: { title: string; message: string; link?: string }) {
    return this.adminService.sendAnnouncement(body.title, body.message, body.link);
  }

  // ── Chat Logs ──────────────────────────────────────────────────────────────
  @Get("chat-logs")
  getChatLogs(
    @Query("page") page = "1",
    @Query("limit") limit = "50",
    @Query("roomName") roomName?: string,
    @Query("search") search?: string,
  ) {
    return this.adminService.getChatLogs({
      page: parseInt(page),
      limit: parseInt(limit),
      roomName,
      search,
    });
  }

  // ── Community ──────────────────────────────────────────────────────────────
  @Get("posts")
  getPosts(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("search") search?: string,
  ) {
    return this.adminService.getPosts({ page: parseInt(page), limit: parseInt(limit), search });
  }

  @Delete("posts/:id")
  deletePost(@Param("id") postId: string) {
    return this.adminService.deletePost(postId);
  }

  @Patch("posts/:id/pin")
  pinPost(@Param("id") postId: string, @Body("isPinned") isPinned: boolean) {
    return this.adminService.pinPost(postId, isPinned);
  }

  @Delete("comments/:id")
  deleteComment(@Param("id") commentId: string) {
    return this.adminService.deleteComment(commentId);
  }

  // ── Clans ──────────────────────────────────────────────────────────────────
  @Get("clans")
  getClans(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("search") search?: string,
  ) {
    return this.adminService.getClans({ page: parseInt(page), limit: parseInt(limit), search });
  }

  @Delete("clans/:id")
  deleteClan(@Param("id") clanId: string) {
    return this.adminService.deleteClan(clanId);
  }

  // ── Rooms ──────────────────────────────────────────────────────────────────
  @Get("rooms")
  getRooms(
    @Query("page") page = "1",
    @Query("limit") limit = "20",
    @Query("status") status?: string,
  ) {
    return this.adminService.getRooms({ page: parseInt(page), limit: parseInt(limit), status });
  }

  @Post("rooms/:id/close")
  closeRoom(@Param("id") roomId: string) {
    return this.adminService.closeRoom(roomId);
  }
}
