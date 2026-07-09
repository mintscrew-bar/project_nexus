import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole, AdminAction, Prisma } from "@nexus/database";
import { DiscordBotService } from "../discord/discord-bot.service";
import { DiscordAdminAlertService } from "../discord/discord-admin-alert.service";
import { DiscordVoiceService } from "../discord/discord-voice.service";
import { RoomService } from "../room/room.service";

const MAX_LIMIT = 100;

function clampLimit(limit: number): number {
  return Math.min(Math.max(1, limit), MAX_LIMIT);
}

function validateFutureDate(dateStr: string, fieldName: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new BadRequestException(
      `${fieldName}: 유효하지 않은 날짜 형식입니다.`,
    );
  }
  if (date <= new Date()) {
    throw new BadRequestException(
      `${fieldName}: 미래 날짜만 설정할 수 있습니다.`,
    );
  }
  return date;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly discordBotService: DiscordBotService,
    private readonly adminAlerts: DiscordAdminAlertService,
    private readonly discordVoiceService: DiscordVoiceService,
    private readonly roomService: RoomService,
  ) {}

  private readonly seededHighTierPriority = 7;
  private readonly matchFetchStaleHours = {
    ranked: 6,
    normal: 12,
    aram: 24,
    custom: 24,
  } as const;

  private getPositiveIntConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  // ── Audit Log ───────────────────────────────────────────────────────────────

  private async logAction(
    adminId: string,
    action: AdminAction,
    targetType?: string,
    targetId?: string,
    details?: Record<string, any>,
  ) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        details: details ?? undefined,
      },
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  async getStats() {
    // 테스트 봇은 실제 이용자 수에서 제외한다 (대시보드 "전체 유저"는 봇 미포함)
    const botWhere = this.getTestBotWhere();

    const [
      totalUsers,
      botUsers,
      totalRooms,
      activeRooms,
      totalMatches,
      pendingUserReports,
      pendingPostReports,
      totalClans,
    ] = await Promise.all([
      this.prisma.user.count({ where: { NOT: botWhere } }),
      this.prisma.user.count({ where: botWhere }),
      this.prisma.room.count(),
      this.prisma.room.count({
        where: { status: { in: ["WAITING", "IN_PROGRESS"] } },
      }),
      this.prisma.match.count(),
      this.prisma.userReport.count({ where: { status: "PENDING" } }),
      this.prisma.postReport.count({ where: { status: "PENDING" } }),
      this.prisma.clan.count(),
    ]);

    return {
      totalUsers,
      botUsers,
      totalRooms,
      activeRooms,
      totalMatches,
      pendingReports: pendingUserReports + pendingPostReports,
      pendingUserReports,
      pendingPostReports,
      totalClans,
    };
  }

  async getMatchQueueStats() {
    const now = Date.now();
    const rankedStaleBefore = new Date(
      now - this.matchFetchStaleHours.ranked * 60 * 60 * 1000,
    );
    const normalStaleBefore = new Date(
      now - this.matchFetchStaleHours.normal * 60 * 60 * 1000,
    );
    const aramStaleBefore = new Date(
      now - this.matchFetchStaleHours.aram * 60 * 60 * 1000,
    );
    const customStaleBefore = new Date(
      now - this.matchFetchStaleHours.custom * 60 * 60 * 1000,
    );

    const [
      knownPuuidsTotal,
      nexusUsers,
      seededUsers,
      rankedPending,
      rankedPendingNexus,
      rankedPendingSeeded,
      normalPending,
      aramPending,
      customPending,
      riotMatchCacheSize,
      matchStatsCacheGrouped,
      recomputeQueueSize,
    ] = await Promise.all([
      this.prisma.knownPuuid.count(),
      this.prisma.knownPuuid.count({
        where: { isNexusUser: true },
      }),
      this.prisma.knownPuuid.count({
        where: {
          isNexusUser: false,
          priority: this.seededHighTierPriority,
        },
      }),
      this.prisma.knownPuuid.count({
        where: {
          OR: [
            { rankedFetchedAt: null },
            { rankedFetchedAt: { lt: rankedStaleBefore } },
          ],
        },
      }),
      this.prisma.knownPuuid.count({
        where: {
          isNexusUser: true,
          OR: [
            { rankedFetchedAt: null },
            { rankedFetchedAt: { lt: rankedStaleBefore } },
          ],
        },
      }),
      this.prisma.knownPuuid.count({
        where: {
          isNexusUser: false,
          priority: this.seededHighTierPriority,
          OR: [
            { rankedFetchedAt: null },
            { rankedFetchedAt: { lt: rankedStaleBefore } },
          ],
        },
      }),
      this.prisma.knownPuuid.count({
        where: {
          OR: [
            { normalFetchedAt: null },
            { normalFetchedAt: { lt: normalStaleBefore } },
          ],
        },
      }),
      this.prisma.knownPuuid.count({
        where: {
          OR: [
            { aramFetchedAt: null },
            { aramFetchedAt: { lt: aramStaleBefore } },
          ],
        },
      }),
      this.prisma.knownPuuid.count({
        where: {
          isNexusUser: false,
          OR: [
            { customFetchedAt: null },
            { customFetchedAt: { lt: customStaleBefore } },
          ],
        },
      }),
      this.prisma.riotMatchCache.count(),
      this.prisma.matchStatsCache.groupBy({
        by: ["queueGroup"],
        _count: { _all: true },
      }),
      this.prisma.statsRecomputeQueue.count(),
    ]);

    const matchStatsCacheSize = {
      ranked: 0,
      normal: 0,
      aram: 0,
      custom: 0,
      all: 0,
    };

    for (const row of matchStatsCacheGrouped) {
      if (row.queueGroup in matchStatsCacheSize) {
        matchStatsCacheSize[
          row.queueGroup as keyof typeof matchStatsCacheSize
        ] = row._count._all;
      }
    }

    return {
      knownPuuids: {
        total: knownPuuidsTotal,
        nexusUsers,
        seeded: seededUsers,
      },
      fetchPending: {
        ranked: {
          total: rankedPending,
          nexus: rankedPendingNexus,
          seeded: rankedPendingSeeded,
        },
        normal: normalPending,
        aram: aramPending,
        custom: customPending,
      },
      seededPolicy: {
        priority: this.seededHighTierPriority,
        slotCap: this.getPositiveIntConfig(
          "MATCH_FETCH_RANKED_SEEDED_SLOT_CAP",
          15,
        ),
        staleHours: this.getPositiveIntConfig(
          "MATCH_FETCH_RANKED_SEEDED_STALE_HOURS",
          72,
        ),
        initialBackfillLimit: this.getPositiveIntConfig(
          "MATCH_FETCH_RANKED_SEEDED_INITIAL_BACKFILL_LIMIT",
          100,
        ),
      },
      riotMatchCacheSize,
      matchStatsCacheSize,
      statsRecomputeQueueSize: recomputeQueueSize,
    };
  }

  async resolveStatsRecomputeUserId(params: {
    userId?: string;
    puuid?: string;
  }) {
    if (params.userId) {
      return params.userId;
    }

    if (!params.puuid) {
      throw new BadRequestException("userId 또는 puuid 중 하나는 필수입니다.");
    }

    const account = await this.prisma.riotAccount.findUnique({
      where: { puuid: params.puuid },
      select: { userId: true },
    });

    if (!account?.userId) {
      throw new NotFoundException(
        "해당 puuid와 연결된 유저를 찾을 수 없습니다.",
      );
    }

    return account.userId;
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  private getTestBotWhere(): Prisma.UserWhereInput {
    return {
      OR: [
        { username: { startsWith: "testbot_" } },
        { email: { endsWith: "@nexus.test" } },
        {
          riotAccounts: {
            some: {
              puuid: { startsWith: "bot_puuid_" },
            },
          },
        },
      ],
    };
  }

  private isTestBotUser(user: {
    username?: string | null;
    email?: string | null;
    riotAccounts?: Array<{ puuid?: string | null }>;
  }): boolean {
    return (
      user.username?.startsWith("testbot_") ||
      user.email?.endsWith("@nexus.test") ||
      user.riotAccounts?.some((account) =>
        account.puuid?.startsWith("bot_puuid_"),
      ) ||
      false
    );
  }

  async getUsers(params: {
    page: number;
    limit: number;
    search?: string;
    kind?: "users" | "bots" | "all";
    role?: UserRole;
  }) {
    const { page, search } = params;
    const limit = clampLimit(params.limit);
    const skip = (page - 1) * limit;
    const kind = params.kind ?? "users";

    const filters: Prisma.UserWhereInput[] = [];
    const botWhere = this.getTestBotWhere();

    if (kind === "bots") {
      filters.push(botWhere);
    } else if (kind === "users") {
      filters.push({ NOT: botWhere });
    }

    if (params.role) {
      filters.push({ role: params.role });
    }

    if (search) {
      filters.push({
        OR: [
          { username: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      });
    }

    const where: Prisma.UserWhereInput =
      filters.length > 0 ? { AND: filters } : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          avatar: true,
          role: true,
          reputation: true,
          isRestricted: true,
          restrictedUntil: true,
          isBanned: true,
          banReason: true,
          banUntil: true,
          createdAt: true,
          authProviders: { select: { provider: true } },
          riotAccounts: {
            select: {
              id: true,
              gameName: true,
              tagLine: true,
              puuid: true,
              tier: true,
              rank: true,
              isPrimary: true,
            },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          },
          streamerProfiles: {
            select: {
              platform: true,
              channelUrl: true,
              channelName: true,
              isActive: true,
            },
          },
          _count: { select: { reportsReceived: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map((user) => ({
        ...user,
        isBot: this.isTestBotUser(user),
      })),
      total,
      page,
      limit,
      kind,
      role: params.role ?? "all",
    };
  }

  async updateUserRole(
    targetUserId: string,
    role: UserRole,
    requesterId: string,
  ) {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException("유효한 권한 값을 선택해주세요.");
    }

    if (targetUserId === requesterId)
      throw new BadRequestException("자신의 권한은 변경할 수 없습니다.");

    // ADMIN 승격은 ADMIN만 가능 (MODERATOR의 권한 에스컬레이션 방지)
    if (role === UserRole.ADMIN) {
      const requester = await this.prisma.user.findUnique({
        where: { id: requesterId },
        select: { role: true },
      });
      if (requester?.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          "ADMIN 승격은 ADMIN만 수행할 수 있습니다.",
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    // ADMIN 대상의 역할 변경도 ADMIN만 가능
    if (user.role === UserRole.ADMIN) {
      const requester = await this.prisma.user.findUnique({
        where: { id: requesterId },
        select: { role: true },
      });
      if (requester?.role !== UserRole.ADMIN) {
        throw new ForbiddenException(
          "ADMIN의 권한은 다른 ADMIN만 변경할 수 있습니다.",
        );
      }
    }

    const result = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, username: true, role: true },
    });

    await this.logAction(
      requesterId,
      AdminAction.USER_ROLE_CHANGE,
      "user",
      targetUserId,
      {
        previousRole: user.role,
        newRole: role,
      },
    );

    return result;
  }

  async banUser(
    targetUserId: string,
    requesterId: string,
    reason: string,
    banUntil?: string,
  ) {
    if (targetUserId === requesterId)
      throw new BadRequestException("자신을 밴할 수 없습니다.");

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    const banUntilDate = banUntil
      ? validateFutureDate(banUntil, "banUntil")
      : null;

    const result = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        isBanned: true,
        banReason: reason,
        bannedAt: new Date(),
        banUntil: banUntilDate,
      },
      select: {
        id: true,
        username: true,
        isBanned: true,
        banReason: true,
        banUntil: true,
      },
    });

    await this.logAction(
      requesterId,
      AdminAction.USER_BAN,
      "user",
      targetUserId,
      {
        reason,
        banUntil: banUntilDate,
      },
    );

    return result;
  }

  async unbanUser(targetUserId: string, requesterId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    const result = await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
        banUntil: null,
      },
      select: { id: true, username: true, isBanned: true },
    });

    await this.logAction(
      requesterId,
      AdminAction.USER_UNBAN,
      "user",
      targetUserId,
    );

    return result;
  }

  async restrictUser(
    targetUserId: string,
    requesterId: string,
    restrictedUntil: string,
  ) {
    if (targetUserId === requesterId)
      throw new BadRequestException("자신을 제재할 수 없습니다.");

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    // 매니저(MODERATOR)는 일반 유저만 제재 가능 — 관리자/다른 매니저 제재 차단(권한 에스컬레이션 방지)
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { role: true },
    });
    if (requester?.role === UserRole.MODERATOR && user.role !== UserRole.USER) {
      throw new ForbiddenException("매니저는 일반 유저만 제재할 수 있습니다.");
    }

    const restrictedUntilDate = validateFutureDate(
      restrictedUntil,
      "restrictedUntil",
    );

    const result = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isRestricted: true, restrictedUntil: restrictedUntilDate },
      select: {
        id: true,
        username: true,
        isRestricted: true,
        restrictedUntil: true,
      },
    });

    await this.logAction(
      requesterId,
      AdminAction.USER_RESTRICT,
      "user",
      targetUserId,
      {
        restrictedUntil: restrictedUntilDate,
      },
    );

    return result;
  }

  async unrestrictUser(targetUserId: string, requesterId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    const result = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isRestricted: false, restrictedUntil: null },
      select: { id: true, username: true, isRestricted: true },
    });

    await this.logAction(
      requesterId,
      AdminAction.USER_UNRESTRICT,
      "user",
      targetUserId,
    );

    return result;
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  async getReports(params: {
    page: number;
    limit: number;
    status?: string;
    category?: "user" | "post";
  }) {
    const { page, status, category } = params;
    const limit = clampLimit(params.limit);
    const skip = (page - 1) * limit;

    // 카테고리 미지정 시 기본 user
    const cat = category || "user";

    if (cat === "post") {
      return this.getPostReports(skip, limit, page, status);
    }
    return this.getUserReports(skip, limit, page, status);
  }

  private async getUserReports(
    skip: number,
    limit: number,
    page: number,
    status?: string,
  ) {
    const where = status ? { status: status as any } : {};

    const [reports, total] = await Promise.all([
      this.prisma.userReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, username: true, avatar: true } },
          target: {
            select: { id: true, username: true, avatar: true, isBanned: true },
          },
          match: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.userReport.count({ where }),
    ]);

    return {
      reports: reports.map((r) => ({
        ...r,
        category: "user" as const,
      })),
      total,
      page,
      limit,
    };
  }

  private async getPostReports(
    skip: number,
    limit: number,
    page: number,
    status?: string,
  ) {
    const where = status ? { status: status as any } : {};

    const [reports, total] = await Promise.all([
      this.prisma.postReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, username: true, avatar: true } },
          post: { select: { id: true, title: true } },
          comment: { select: { id: true, content: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.postReport.count({ where }),
    ]);

    return {
      reports: reports.map((r) => ({
        ...r,
        category: "post" as const,
        targetLabel: r.post
          ? `게시글: ${r.post.title}`
          : r.comment
            ? `댓글: ${r.comment.content?.slice(0, 30)}...`
            : "삭제된 콘텐츠",
      })),
      total,
      page,
      limit,
    };
  }

  async reviewReport(
    reportId: string,
    status: "APPROVED" | "REJECTED",
    reviewerNote: string,
    reviewerId: string,
    category: "user" | "post" = "user",
  ) {
    if (category === "post") {
      const report = await this.prisma.postReport.findUnique({
        where: { id: reportId },
      });
      if (!report) throw new NotFoundException("신고를 찾을 수 없습니다.");

      const result = await this.prisma.postReport.update({
        where: { id: reportId },
        data: { status, reviewerNote, reviewedAt: new Date() },
      });

      await this.logAction(
        reviewerId,
        AdminAction.REPORT_REVIEW,
        "postReport",
        reportId,
        {
          category,
          status,
          reviewerNote,
        },
      );

      return result;
    }

    // user report
    const report = await this.prisma.userReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException("신고를 찾을 수 없습니다.");

    const result = await this.prisma.userReport.update({
      where: { id: reportId },
      data: { status, reviewerNote, reviewerId, reviewedAt: new Date() },
    });

    await this.logAction(
      reviewerId,
      AdminAction.REPORT_REVIEW,
      "userReport",
      reportId,
      {
        category,
        status,
        reviewerNote,
      },
    );

    return result;
  }

  // ── Announcements ─────────────────────────────────────────────────────────

  async sendAnnouncement(
    title: string,
    message: string,
    adminId: string,
    link?: string,
  ) {
    const BATCH_SIZE = 1000;
    let sent = 0;
    let cursor: string | undefined;

    // 배치 처리: 한 번에 1000명씩 조회 + 알림 생성
    while (true) {
      const users = await this.prisma.user.findMany({
        select: { id: true },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
      });

      if (users.length === 0) break;

      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: "SYSTEM" as any,
          title,
          message,
          link: link ?? null,
        })),
      });

      sent += users.length;
      cursor = users[users.length - 1].id;

      if (users.length < BATCH_SIZE) break;
    }

    await this.logAction(
      adminId,
      AdminAction.ANNOUNCEMENT_SEND,
      undefined,
      undefined,
      {
        title,
        sentCount: sent,
      },
    );

    return { sent };
  }

  // ── Chat Logs ─────────────────────────────────────────────────────────────

  async getChatLogs(params: {
    page: number;
    limit: number;
    // DM은 개인정보보호법·통신비밀보호법상 임의 열람 위법 소지로 제외
    category?: "all" | "room" | "clan";
    roomName?: string;
    userId?: string;
    search?: string;
  }) {
    const { page, roomName, userId, search } = params;
    const _category = params.category || "all";
    const limit = clampLimit(params.limit);
    const skip = (page - 1) * limit;

    const dateLimit30d = {
      gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };

    // DM·클랜 채팅은 개인정보보호법·통신비밀보호법 위법 소지로 자유 열람 차단
    // 클랜 채팅은 신고 접수 시 신고 처리 흐름을 통해서만 확인 가능

    // category === "room" 또는 "all"
    const roomResult = await this.getRoomChatLogs({
      page,
      limit,
      skip,
      roomName,
      userId,
      search,
      dateLimit30d,
    });
    return roomResult;
  }

  private async getRoomChatLogs(params: {
    page: number;
    limit: number;
    skip: number;
    roomName?: string;
    userId?: string;
    search?: string;
    dateLimit30d: { gte: Date };
  }) {
    const { page, limit, skip, roomName, userId, search, dateLimit30d } =
      params;
    const where: any = {};
    if (roomName) where.roomName = { contains: roomName, mode: "insensitive" };
    if (userId) where.userId = userId;
    if (search) {
      where.content = { contains: search, mode: "insensitive" };
      if (!where.createdAt) where.createdAt = dateLimit30d;
    }

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.chatMessage.count({ where }),
    ]);

    return {
      logs: messages.map((m) => ({
        id: m.id,
        category: "room" as const,
        content: m.content,
        location: m.roomName ?? "(삭제된 방)",
        userId: m.userId,
        username: m.user?.username ?? "(탈퇴)",
        avatar: m.user?.avatar ?? null,
        createdAt: m.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  private async getDmLogs(params: {
    page: number;
    limit: number;
    skip: number;
    userId?: string;
    search?: string;
    dateLimit30d: { gte: Date };
  }) {
    const { page, limit, skip, userId, search, dateLimit30d } = params;
    const where: any = {};
    if (userId) where.OR = [{ senderId: userId }, { receiverId: userId }];
    if (search) {
      where.content = { contains: search, mode: "insensitive" };
      if (!where.createdAt) where.createdAt = dateLimit30d;
    }

    const [messages, total] = await Promise.all([
      this.prisma.directMessage.findMany({
        where,
        include: {
          sender: { select: { id: true, username: true, avatar: true } },
          receiver: { select: { id: true, username: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.directMessage.count({ where }),
    ]);

    return {
      logs: messages.map((m) => ({
        id: m.id,
        category: "dm" as const,
        content: m.content,
        location: `→ ${m.receiver?.username ?? "(탈퇴)"}`,
        userId: m.senderId,
        username: m.sender?.username ?? m.senderUsername,
        avatar: m.sender?.avatar ?? null,
        createdAt: m.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  private async getClanChatLogs(params: {
    page: number;
    limit: number;
    skip: number;
    userId?: string;
    search?: string;
    dateLimit30d: { gte: Date };
  }) {
    const { page, limit, skip, userId, search, dateLimit30d } = params;
    const where: any = {};
    if (userId) where.userId = userId;
    if (search) {
      where.content = { contains: search, mode: "insensitive" };
      if (!where.createdAt) where.createdAt = dateLimit30d;
    }

    const [messages, total] = await Promise.all([
      this.prisma.clanChatMessage.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, avatar: true } },
          clan: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.clanChatMessage.count({ where }),
    ]);

    return {
      logs: messages.map((m) => ({
        id: m.id,
        category: "clan" as const,
        content: m.content,
        location: m.clan?.name ?? "(삭제된 클랜)",
        userId: m.userId,
        username: m.user?.username ?? "(탈퇴)",
        avatar: m.user?.avatar ?? null,
        createdAt: m.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  // ── Community ─────────────────────────────────────────────────────────────

  async getPosts(params: { page: number; limit: number; search?: string }) {
    const { page, search } = params;
    const limit = clampLimit(params.limit);
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" as const } },
        { content: { contains: search, mode: "insensitive" as const } },
      ];
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          author: { select: { id: true, username: true } },
          _count: { select: { comments: true, likes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return { posts, total, page, limit };
  }

  async deletePost(postId: string, adminId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("게시글을 찾을 수 없습니다.");
    if (post.isDeleted)
      throw new BadRequestException("이미 삭제된 게시글입니다.");

    await this.prisma.post.update({
      where: { id: postId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId },
    });

    await this.logAction(adminId, AdminAction.POST_DELETE, "post", postId, {
      title: post.title,
    });

    return { success: true };
  }

  async pinPost(postId: string, isPinned: boolean, adminId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException("게시글을 찾을 수 없습니다.");

    const result = await this.prisma.post.update({
      where: { id: postId },
      data: { isPinned },
    });

    await this.logAction(adminId, AdminAction.POST_PIN, "post", postId, {
      isPinned,
    });

    return result;
  }

  async deleteComment(commentId: string, adminId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException("댓글을 찾을 수 없습니다.");
    if (comment.isDeleted)
      throw new BadRequestException("이미 삭제된 댓글입니다.");

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId },
    });

    await this.logAction(
      adminId,
      AdminAction.COMMENT_DELETE,
      "comment",
      commentId,
      {
        postId: comment.postId,
      },
    );

    return { success: true };
  }

  // ── Clans ─────────────────────────────────────────────────────────────────

  async getClans(params: { page: number; limit: number; search?: string }) {
    const { page, search } = params;
    const limit = clampLimit(params.limit);
    const skip = (page - 1) * limit;

    const where = search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {};

    const [clans, total] = await Promise.all([
      this.prisma.clan.findMany({
        where,
        include: {
          owner: { select: { id: true, username: true } },
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.clan.count({ where }),
    ]);

    return { clans, total, page, limit };
  }

  async deleteClan(clanId: string, adminId: string) {
    const clan = await this.prisma.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new NotFoundException("클랜을 찾을 수 없습니다.");

    await this.prisma.clan.delete({ where: { id: clanId } });

    await this.logAction(adminId, AdminAction.CLAN_DELETE, "clan", clanId, {
      name: clan.name,
    });

    return { success: true };
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  async getRooms(params: { page: number; limit: number; status?: string }) {
    const { page, status } = params;
    const limit = clampLimit(params.limit);
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: {
          host: { select: { id: true, username: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.room.count({ where }),
    ]);

    return { rooms, total, page, limit };
  }

  async closeRoom(roomId: string, adminId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: { select: { id: true } },
        discordChannels: { select: { channelId: true, teamName: true } },
      },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");

    await this.discordVoiceService.deleteRoomChannels(roomId, false, {
      discordCategoryId: room.discordCategoryId,
      discordChannels: room.discordChannels,
    });

    await this.roomService.deleteRoomData(roomId);

    const result = {
      id: room.id,
      name: room.name,
      status: room.status,
      deleted: true,
    };

    // ⚠️ 인메모리 상태(경매/드래프트/역할선택)는 서비스 의존성 순환 문제로
    // 직접 정리 불가. 인메모리 상태는 다음 접근 시 roomId 기반으로 무효화되거나,
    // 서버 재시작 시 정리됨. 장기적으로 Redis 이관 시 해결 예정.

    await this.logAction(adminId, AdminAction.ROOM_CLOSE, "room", roomId, {
      name: room.name,
      previousStatus: room.status,
      participantCount: room.participants.length,
      deleted: true,
    });

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { username: true },
    });
    await this.adminAlerts.notifyAdminOperation({
      operation: "ROOM_CLOSE",
      adminId,
      adminName: admin?.username,
      targetType: "room",
      targetId: roomId,
      summary: `관리자가 방을 삭제했습니다: ${room.name}`,
    });

    return result;
  }

  // ── Test Bots ──────────────────────────────────────────────────────────────

  /** testbot_01 ~ testbot_{count} 유저를 없으면 생성, 있으면 반환 */
  async ensureBotUsers(
    count: number,
  ): Promise<{ id: string; username: string }[]> {
    const bots: { id: string; username: string }[] = [];

    for (let i = 1; i <= count; i++) {
      const username = `testbot_${String(i).padStart(2, "0")}`;
      const email = `${username}@nexus.test`;

      // 봇의 기본 Tier: SILVER (중간 등급)
      const botTiers = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"];
      const botTier = botTiers[i % botTiers.length]; // 봇마다 다른 티어 할당
      const botRank = "IV";

      const user = await this.prisma.user.upsert({
        where: { email },
        update: {}, // 이미 있으면 업데이트 안 함 (기존 봇 유지)
        create: {
          username,
          email,
          emailVerified: true,
          termsAgreements: {
            create: {
              termsOfService: true,
              privacyPolicy: true,
              ageVerification: true,
              marketingConsent: false,
            },
          },
          // 봇용 RiotAccount 생성 (드래프트/경매에서 사용)
          riotAccounts: {
            create: {
              gameName: username,
              tagLine: "BOT",
              puuid: `bot_puuid_${i}`,
              tier: botTier,
              rank: botRank,
              lp: 0,
              isPrimary: true,
              mainRole: null,
              subRole: null,
            },
          },
        },
        select: { id: true, username: true },
      });

      bots.push(user);
    }

    return bots;
  }

  /** 방에 봇을 count명 추가. 이미 있는 봇은 스킵, maxParticipants 초과하지 않음 */
  async addBotToRoom(roomId: string, adminId: string, count: number = 1) {
    const result = await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          participants: { select: { userId: true } },
        },
      });

      if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
      if (room.status !== ("WAITING" as any)) {
        throw new BadRequestException(
          "대기 중인 방에만 봇을 추가할 수 있습니다.",
        );
      }

      const currentCount = room.participants.length;
      const available = (room.maxParticipants || 10) - currentCount;
      if (available <= 0) throw new BadRequestException("방이 가득 찼습니다.");

      const toAdd = Math.min(count, available);
      const existingBotIds = new Set(room.participants.map((p) => p.userId));

      // 필요한 봇보다 여유 있게 확보 (방 최대 인원 40명 → 호스트 제외 최대 39봇)
      const bots = await this.ensureBotUsers(
        Math.min(39, currentCount + toAdd),
      );

      const newBots = bots
        .filter((b) => !existingBotIds.has(b.id))
        .slice(0, toAdd);
      if (newBots.length === 0)
        throw new BadRequestException("추가할 수 있는 봇이 없습니다.");

      await tx.roomParticipant.createMany({
        data: newBots.map((bot) => ({
          roomId,
          userId: bot.id,
          role: "PLAYER" as any,
          isReady: true,
        })),
        skipDuplicates: true,
      });

      const updatedParticipants = await tx.roomParticipant.findMany({
        where: { roomId },
        include: {
          user: {
            select: { id: true, username: true, avatar: true, role: true },
          },
        },
      });

      await this.logAction(adminId, AdminAction.ROOM_ADD_BOT, "room", roomId, {
        addedCount: newBots.length,
      });

      return { addedCount: newBots.length, participants: updatedParticipants };
    });

    const [admin, room] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: adminId },
        select: { username: true },
      }),
      this.prisma.room.findUnique({
        where: { id: roomId },
        select: { name: true },
      }),
    ]);
    await this.adminAlerts.notifyAdminOperation({
      operation: "ROOM_ADD_BOT",
      adminId,
      adminName: admin?.username,
      targetType: "room",
      targetId: roomId,
      summary: `관리자가 방에 테스트 봇 ${result.addedCount}명을 추가했습니다: ${room?.name ?? roomId}`,
    });

    return result;
  }

  // ── Appeals (이의신청) ────────────────────────────────────────────────────

  /**
   * 이의신청 목록 조회: 상태 필터 + 페이지네이션
   * - user 정보 포함 (username, avatar, isBanned, banReason, isRestricted)
   */
  async getAppeals(params: { page: number; limit: number; status?: string }) {
    const { page, status } = params;
    const limit = clampLimit(params.limit);
    const skip = (page - 1) * limit;

    const where = status ? { status: status as any } : {};

    const [appeals, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatar: true,
              isBanned: true,
              banReason: true,
              banUntil: true,
              isRestricted: true,
              restrictedUntil: true,
            },
          },
          reviewer: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.appeal.count({ where }),
    ]);

    return { appeals, total, page, limit };
  }

  /**
   * 이의신청 처리: 승인(APPROVED) 또는 거절(REJECTED)
   * - 승인 시: user.isBanned=false / isRestricted=false 자동 해제 (트랜잭션)
   * - AdminAuditLog에 APPEAL_APPROVE 또는 APPEAL_REJECT 기록
   */
  async reviewAppeal(
    appealId: string,
    status: "APPROVED" | "REJECTED",
    adminId: string,
    adminNote?: string,
  ) {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id: appealId },
      include: {
        user: { select: { id: true, isBanned: true, isRestricted: true } },
      },
    });
    if (!appeal) throw new NotFoundException("이의신청을 찾을 수 없습니다.");
    if (appeal.status !== "PENDING") {
      throw new BadRequestException("이미 처리된 이의신청입니다.");
    }

    const action =
      status === "APPROVED"
        ? AdminAction.APPEAL_APPROVE
        : AdminAction.APPEAL_REJECT;

    return this.prisma.$transaction(async (tx) => {
      // 이의신청 상태 업데이트
      const updated = await tx.appeal.update({
        where: { id: appealId },
        data: {
          status,
          adminNote: adminNote ?? null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });

      // 승인 시 제재 자동 해제
      if (status === "APPROVED") {
        await tx.user.update({
          where: { id: appeal.userId },
          data: {
            isBanned: false,
            banReason: null,
            bannedAt: null,
            banUntil: null,
            isRestricted: false,
            restrictedUntil: null,
          },
        });
      }

      // 감사 로그 기록
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action,
          targetType: "appeal",
          targetId: appealId,
          details: { userId: appeal.userId, adminNote: adminNote ?? null },
        },
      });

      return updated;
    });
  }

  // ── Discord 길드 연동 (멀티 길드) ──────────────────────────────────────────

  async getDiscordGuildLinks() {
    return this.prisma.discordGuildLink.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        owner: { select: { id: true, username: true, avatar: true } },
        clan: { select: { id: true, name: true, tag: true } },
      },
    });
  }

  async sendDiscordTestAlert(adminId: string) {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { username: true },
    });

    const sent = await this.adminAlerts.notifyTestAlert({
      adminId,
      adminName: admin?.username,
    });

    if (!sent) {
      throw new BadRequestException(
        "Discord 관리자 알림 전송에 실패했습니다. 봇/길드/채널 환경변수와 봇 권한을 확인해주세요.",
      );
    }

    return { ok: true };
  }

  async approveDiscordGuildLink(linkId: string, requesterId: string) {
    const link = await this.prisma.discordGuildLink.findUnique({
      where: { id: linkId },
      include: { owner: { select: { id: true, username: true } } },
    });
    if (!link) throw new NotFoundException("길드 연동을 찾을 수 없습니다.");

    // 활성화 전 봇이 실제로 그 길드에 있고 채널 운영 권한을 가졌는지 검증.
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      select: { username: true },
    });
    const perms = await this.discordBotService
      .verifyGuildPermissions(link.guildId)
      .catch(async (error: any) => {
        await this.adminAlerts.notifyDiscordGuildPermissionFailure({
          linkId,
          guildId: link.guildId,
          guildName: link.guildName,
          requesterId,
          requesterName: requester?.username,
          reason: `권한 검증 중 오류가 발생했습니다: ${error?.message ?? error}`,
        });
        throw error;
      });
    if (!perms.inGuild) {
      // 봇이 서버에 없는 연동은 유지할 이유가 없으므로 삭제한다.
      await this.prisma.discordGuildLink
        .delete({ where: { id: linkId } })
        .catch(() => {});
      await this.adminAlerts.notifyDiscordGuildPermissionFailure({
        linkId,
        guildId: link.guildId,
        guildName: link.guildName,
        requesterId,
        requesterName: requester?.username,
        reason: "봇이 해당 Discord 서버에 없어 연동을 삭제했습니다.",
      });
      throw new BadRequestException(
        "봇이 해당 디스코드 서버에 없어 연동을 삭제했습니다. 서버에 봇을 다시 초대한 뒤 재설치해주세요.",
      );
    }
    if (!perms.hasManageChannels || !perms.hasMoveMembers) {
      const missing = [
        !perms.hasManageChannels ? "채널 관리" : null,
        !perms.hasMoveMembers ? "멤버 이동" : null,
      ]
        .filter(Boolean)
        .join(", ");
      await this.adminAlerts.notifyDiscordGuildPermissionFailure({
        linkId,
        guildId: link.guildId,
        guildName: perms.guildName ?? link.guildName,
        requesterId,
        requesterName: requester?.username,
        reason: "봇에게 필요한 권한이 없습니다.",
        missingPermissions: missing,
      });
      throw new BadRequestException(
        `봇에게 필요한 권한이 없습니다: ${missing}. 서버 역할 설정에서 권한을 부여한 뒤 다시 시도해주세요.`,
      );
    }

    const result = await this.prisma.discordGuildLink.update({
      where: { id: linkId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        // 검증 과정에서 확인한 최신 길드명 반영
        ...(perms.guildName ? { guildName: perms.guildName } : {}),
      },
    });

    await this.logAction(
      requesterId,
      AdminAction.DISCORD_GUILD_LINK,
      "discord_guild_link",
      linkId,
      { guildId: link.guildId, action: "approve" },
    );

    return result;
  }

  async disableDiscordGuildLink(linkId: string, requesterId: string) {
    const link = await this.prisma.discordGuildLink.findUnique({
      where: { id: linkId },
    });
    if (!link) throw new NotFoundException("길드 연동을 찾을 수 없습니다.");

    const result = await this.prisma.discordGuildLink.update({
      where: { id: linkId },
      data: { status: "DISABLED" },
    });

    await this.logAction(
      requesterId,
      AdminAction.DISCORD_GUILD_LINK,
      "discord_guild_link",
      linkId,
      { guildId: link.guildId, action: "disable" },
    );

    return result;
  }
}
