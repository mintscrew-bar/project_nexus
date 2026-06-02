import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ReportReason, ReportStatus } from "../community/community.types";
import { DiscordAdminAlertService } from "../discord/discord-admin-alert.service";

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
  /** 클랜 채팅 메시지 신고 시 첨부 (DB에 저장해 관리자가 맥락 확인 가능) */
  clanChatMessageId?: string;
  reason: ReportReason;
  description: string;
}

@Injectable()
export class ReputationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAlerts: DiscordAdminAlertService,
  ) {}

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
      ...(match.teamA?.members.map((m: { userId: string }) => m.userId) ?? []),
      ...(match.teamB?.members.map((m: { userId: string }) => m.userId) ?? []),
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
      ratings.reduce(
        (sum: number, r: (typeof ratings)[number]) => sum + r.skillRating,
        0,
      ) / ratings.length;
    const avgAttitude =
      ratings.reduce(
        (sum: number, r: (typeof ratings)[number]) => sum + r.attitudeRating,
        0,
      ) / ratings.length;
    const avgCommunication =
      ratings.reduce(
        (sum: number, r: (typeof ratings)[number]) =>
          sum + r.communicationRating,
        0,
      ) / ratings.length;

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

    // 매치가 제공된 경우 존재 여부 확인
    if (dto.matchId) {
      const match = await this.prisma.match.findUnique({
        where: { id: dto.matchId },
      });

      if (!match) {
        throw new NotFoundException("Match not found");
      }
    }

    // 클랜 채팅 메시지가 제공된 경우 존재 여부 확인
    if (dto.clanChatMessageId) {
      const clanMsg = await this.prisma.clanChatMessage.findUnique({
        where: { id: dto.clanChatMessageId },
      });

      if (!clanMsg) {
        throw new NotFoundException("Clan chat message not found");
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

    // 신고 생성 (클랜 채팅 메시지 ID 포함)
    const report = await this.prisma.userReport.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        matchId: dto.matchId,
        clanChatMessageId: dto.clanChatMessageId,
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
        // 클랜 채팅 메시지 내용도 함께 반환
        clanChatMessage: {
          select: {
            id: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    // Check if user should be auto-banned (multiple reports)
    await this.checkAutoModeration(dto.targetUserId);

    await this.adminAlerts.notifyReportSubmitted({
      reportId: report.id,
      reportType: "USER",
      reporterId: report.reporter.id,
      reporterName: report.reporter.username,
      targetId: report.target.id,
      targetName: report.target.username,
      reason: report.reason,
    });

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
        // 클랜 채팅 메시지 신고인 경우 내용 포함 (관리자가 맥락 확인용)
        clanChatMessage: {
          select: {
            id: true,
            content: true,
            createdAt: true,
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
    // 이미 밴/제한 중인 유저는 중복 처리 생략
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, isRestricted: true, restrictedUntil: true },
    });
    if (!user) return;
    // 제재는 기한이 지나면 효력 없음 — 만료된 제재는 활성으로 간주하지 않음
    const restrictionActive =
      user.isRestricted &&
      (!user.restrictedUntil || user.restrictedUntil > new Date());
    if (user.isBanned || restrictionActive) return;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 24시간 내 PENDING 신고 수 확인
    const recentReports = await this.prisma.userReport.count({
      where: {
        targetUserId: userId,
        status: ReportStatus.PENDING,
        createdAt: { gte: oneDayAgo },
      },
    });

    // 신고 5건 이상 → 영구 밴 대신 24시간 임시 제한 (관리자 검토 후 결정)
    // 허위 신고·집단 신고로 인한 무고한 유저 피해 방지
    if (recentReports >= 5) {
      const restrictedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isRestricted: true,
          restrictedUntil,
        },
      });
      // 임시 제한 자동 해제는 tasks.service.ts의 Cron이 처리
      // 관리자는 신고 목록을 검토 후 수동으로 밴/해제를 결정해야 함
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
        this.prisma.userReport.count({
          where: { status: ReportStatus.PENDING },
        }),
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
