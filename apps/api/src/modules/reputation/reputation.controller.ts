import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  ReputationService,
  SubmitRatingDto,
  SubmitReportDto,
} from "./reputation.service";
import { ReportStatus } from "../community/community.types";

@Controller("reputation")
export class ReputationController {
  constructor(private readonly reputationService: ReputationService) {}

  // ========================================
  // Rating System
  // ========================================

  @Post("ratings")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async submitRating(
    @CurrentUser("sub") userId: string,
    @Body() dto: SubmitRatingDto,
  ) {
    return this.reputationService.submitRating(userId, dto);
  }

  @Get("users/:userId/ratings")
  async getUserRatings(
    @Param("userId") userId: string,
    @Query("limit") limit?: string,
  ) {
    return this.reputationService.getUserRatings(
      userId,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get("users/:userId/stats")
  async getUserStats(@Param("userId") userId: string) {
    return this.reputationService.getUserReputationStats(userId);
  }

  // ========================================
  // Report System
  // ========================================

  @Post("reports")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async submitReport(
    @CurrentUser("sub") userId: string,
    @Body() dto: SubmitReportDto,
  ) {
    return this.reputationService.submitReport(userId, dto);
  }

  @Get("reports/:id")
  @UseGuards(JwtAuthGuard)
  async getReport(@Param("id") reportId: string) {
    return this.reputationService.getReportById(reportId);
  }

  @Get("users/:userId/reports")
  @UseGuards(JwtAuthGuard)
  async getUserReports(@Param("userId") userId: string) {
    return this.reputationService.getReportsByUser(userId);
  }

  @Get("reports")
  @UseGuards(JwtAuthGuard)
  async listPendingReports(@Query("limit") limit?: string) {
    return this.reputationService.listPendingReports(
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Put("reports/:id/status")
  @UseGuards(JwtAuthGuard)
  async updateReportStatus(
    @Param("id") reportId: string,
    @Body() body: { status: ReportStatus; reviewerNote?: string },
  ) {
    return this.reputationService.updateReportStatus(
      reportId,
      body.status,
      body.reviewerNote,
    );
  }

  // ========================================
  // Ban Management (TODO: Add admin/moderator guard)
  // ========================================

  @Post("users/:userId/ban")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async banUser(
    @Param("userId") userId: string,
    @Body() body: { reason: string; duration?: number },
  ) {
    return this.reputationService.banUser(
      userId,
      body.reason,
      body.duration,
    );
  }

  @Post("users/:userId/unban")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async unbanUser(@Param("userId") userId: string) {
    return this.reputationService.unbanUser(userId);
  }

  // ========================================
  // Statistics
  // ========================================

  @Get("stats")
  @UseGuards(JwtAuthGuard)
  async getReportStatistics() {
    return this.reputationService.getReportStatistics();
  }
}
