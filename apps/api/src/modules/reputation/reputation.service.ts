import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ReportReason, ReportStatus } from "@nexus/database";

export interface SubmitRatingDto {
  targetUserId: string;
  matchId: string;
  skillRating: number; // 1-5
  attitudeRating: number; // 1-5
  communicationRating: number; // 1-5
  comment?: string;
}

export interface SubmitReportDto {
  targetUserId: string;
  matchId?: string;
  reason: ReportReason;
  description: string;
}

@Injectable()
export class ReputationService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // Rating System
  // ========================================

  async submitRating(reporterId: string, dto: SubmitRatingDto) {
    // Validate ratings are 1-5
    if (
      dto.skillRating < 1 ||
      dto.skillRating > 5 ||
      dto.attitudeRating < 1 ||
      dto.attitudeRating > 5 ||
      dto.communicationRating < 1 ||
      dto.communicationRating > 5
    ) {
      throw new BadRequestException("Ratings must be between 1 and 5");
    }

    // Cannot rate yourself
    if (reporterId === dto.targetUserId) {
      throw new BadRequestException("Cannot rate yourself");
    }

    // Verify match exists
    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
      },
    });

    if (!match) {
      throw new NotFoundException("Match not found");
    }

    // Verify both users were in the match
    const allMembers = [
      ...match.teamA.members.map((m) => m.userId),
      ...match.teamB.members.map((m) => m.userId),
    ];

    if (
      !allMembers.includes(reporterId) ||
      !allMembers.includes(dto.targetUserId)
    ) {
      throw new ForbiddenException(
        "Both users must have participated in the match",
      );
    }

    // Check if already rated
    const existingRating = await this.prisma.userRating.findUnique({
      where: {
        reporterId_targetUserId_matchId: {
          reporterId,
          targetUserId: dto.targetUserId,
          matchId: dto.matchId,
        },
      },
    });

    if (existingRating) {
      throw new ConflictException("You already rated this user for this match");
    }

    // Create rating
    const rating = await this.prisma.userRating.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        matchId: dto.matchId,
        skillRating: dto.skillRating,
        attitudeRating: dto.attitudeRating,
        communicationRating: dto.communicationRating,
        comment: dto.comment,
      },
    });

    // Update user's reputation stats
    await this.updateUserReputationStats(dto.targetUserId);

    return rating;
  }

  async getUserRatings(userId: string, limit = 10) {
    return this.prisma.userRating.findMany({
      where: { targetUserId: userId },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        match: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async getUserReputationStats(userId: string) {
    const ratings = await this.prisma.userRating.findMany({
      where: { targetUserId: userId },
    });

    if (ratings.length === 0) {
      return {
        totalRatings: 0,
        averageSkill: 0,
        averageAttitude: 0,
        averageCommunication: 0,
        overallAverage: 0,
      };
    }

    const avgSkill =
      ratings.reduce((sum, r) => sum + r.skillRating, 0) / ratings.length;
    const avgAttitude =
      ratings.reduce((sum, r) => sum + r.attitudeRating, 0) / ratings.length;
    const avgCommunication =
      ratings.reduce((sum, r) => sum + r.communicationRating, 0) /
      ratings.length;

    const overall = (avgSkill + avgAttitude + avgCommunication) / 3;

    return {
      totalRatings: ratings.length,
      averageSkill: parseFloat(avgSkill.toFixed(2)),
      averageAttitude: parseFloat(avgAttitude.toFixed(2)),
      averageCommunication: parseFloat(avgCommunication.toFixed(2)),
      overallAverage: parseFloat(overall.toFixed(2)),
    };
  }

  private async updateUserReputationStats(userId: string) {
    const stats = await this.getUserReputationStats(userId);

    // Update user record with reputation stats
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        reputationScore: stats.overallAverage,
      },
    });
  }

  // ========================================
  // Report System
  // ========================================

  async submitReport(reporterId: string, dto: SubmitReportDto) {
    // Cannot report yourself
    if (reporterId === dto.targetUserId) {
      throw new BadRequestException("Cannot report yourself");
    }

    // Validate description
    if (!dto.description || dto.description.trim().length === 0) {
      throw new BadRequestException("Description is required");
    }

    if (dto.description.length > 1000) {
      throw new BadRequestException(
        "Description too long (max 1000 characters)",
      );
    }

    // If match provided, verify it exists
    if (dto.matchId) {
      const match = await this.prisma.match.findUnique({
        where: { id: dto.matchId },
      });

      if (!match) {
        throw new NotFoundException("Match not found");
      }
    }

    // Check for duplicate reports (same reporter, target, and reason within 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingReport = await this.prisma.userReport.findFirst({
      where: {
        reporterId,
        targetUserId: dto.targetUserId,
        reason: dto.reason,
        createdAt: { gte: oneDayAgo },
      },
    });

    if (existingReport) {
      throw new ConflictException(
        "You already reported this user for this reason recently",
      );
    }

    // Create report
    const report = await this.prisma.userReport.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        matchId: dto.matchId,
        reason: dto.reason,
        description: dto.description.trim(),
        status: ReportStatus.PENDING,
      },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
          },
        },
        target: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Check if user should be auto-banned (multiple reports)
    await this.checkAutoModeration(dto.targetUserId);

    return report;
  }

  async getReportsByUser(userId: string) {
    return this.prisma.userReport.findMany({
      where: { targetUserId: userId },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getReportById(reportId: string) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        target: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        match: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException("Report not found");
    }

    return report;
  }

  async updateReportStatus(
    reportId: string,
    status: ReportStatus,
    reviewerNote?: string,
  ) {
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundException("Report not found");
    }

    return this.prisma.userReport.update({
      where: { id: reportId },
      data: {
        status,
        reviewerNote,
        reviewedAt: new Date(),
      },
    });
  }

  async listPendingReports(limit = 50) {
    return this.prisma.userReport.findMany({
      where: { status: ReportStatus.PENDING },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
          },
        },
        target: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  // ========================================
  // Auto-Moderation
  // ========================================

  private async checkAutoModeration(userId: string) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Count pending reports in last 24 hours
    const recentReports = await this.prisma.userReport.count({
      where: {
        targetUserId: userId,
        status: ReportStatus.PENDING,
        createdAt: { gte: oneDayAgo },
      },
    });

    // Auto-ban if 5+ reports in 24 hours
    if (recentReports >= 5) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isBanned: true,
          banReason: "Auto-banned: Multiple reports received",
          bannedAt: new Date(),
        },
      });
    }
  }

  // ========================================
  // Ban Management (Admin/Moderator)
  // ========================================

  async banUser(userId: string, reason: string, duration?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const banData: any = {
      isBanned: true,
      banReason: reason,
      bannedAt: new Date(),
    };

    if (duration) {
      // Duration in days
      const banUntil = new Date();
      banUntil.setDate(banUntil.getDate() + duration);
      banData.banUntil = banUntil;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: banData,
    });
  }

  async unbanUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
        banUntil: null,
      },
    });
  }

  // ========================================
  // Statistics
  // ========================================

  async getReportStatistics() {
    const [totalReports, pendingReports, approvedReports, rejectedReports] =
      await Promise.all([
        this.prisma.userReport.count(),
        this.prisma.userReport.count({ where: { status: ReportStatus.PENDING } }),
        this.prisma.userReport.count({
          where: { status: ReportStatus.APPROVED },
        }),
        this.prisma.userReport.count({
          where: { status: ReportStatus.REJECTED },
        }),
      ]);

    return {
      totalReports,
      pendingReports,
      approvedReports,
      rejectedReports,
    };
  }
}
