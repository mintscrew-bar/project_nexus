import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { DiscordAdminAlertService } from "../discord/discord-admin-alert.service";
import { ReputationService } from "../reputation/reputation.service";

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly adminAlerts: DiscordAdminAlertService,
    private readonly reputationService: ReputationService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        riotAccounts: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async findByDiscordId(discordId: string) {
    const authProvider = await this.prisma.authProvider.findFirst({
      where: {
        provider: "DISCORD",
        providerId: discordId,
      },
      include: {
        user: {
          include: {
            riotAccounts: true,
          },
        },
      },
    });

    return authProvider?.user || null;
  }

  async getProfile(userId: string, requesterId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        riotAccounts: {
          include: { championPreferences: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
        },
        clanMemberships: {
          include: {
            clan: {
              select: { id: true, name: true, tag: true },
            },
          },
        },
        settings: true,
        _count: {
          select: {
            roomParticipations: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Get statistics
    const stats = await this.getUserStats(userId);

    // Strip sensitive fields before returning
    const {
      password: _pw,
      isBanned: _ib,
      banReason: _br,
      bannedAt: _ba,
      banUntil: _be,
      isRestricted: _ir,
      restrictedUntil: _ru,
      emailVerified: _ev,
      ...safeUser
    } = user;

    const isOwner = requesterId === userId;

    // Apply privacy settings for non-owner viewers
    if (!isOwner && user.settings) {
      if (!user.settings.showRiotAccounts) {
        safeUser.riotAccounts = [];
      }
      if (!user.settings.showChampionStats) {
        safeUser.riotAccounts = safeUser.riotAccounts.map((acc: any) => ({
          ...acc,
          championPreferences: [],
        }));
      }
    }

    return {
      ...safeUser,
      stats,
    };
  }

  async getUserStats(userId: string, _requesterId?: string) {
    const teamMembers = await this.prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            matchesAsTeamA: true,
            matchesAsTeamB: true,
          },
        },
      },
    });

    let wins = 0;
    let losses = 0;

    teamMembers.forEach((tm: (typeof teamMembers)[number]) => {
      if (!tm.team) return;

      const teamMatches = [
        ...tm.team.matchesAsTeamA,
        ...tm.team.matchesAsTeamB,
      ];

      teamMatches.forEach((match) => {
        if (match.winnerId === tm.team!.id) {
          wins++;
        } else if (match.winnerId) {
          losses++;
        }
      });
    });

    return {
      gamesPlayed: wins + losses,
      wins,
      losses,
      winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
      participations: teamMembers.length,
    };
  }

  async getHoverProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        avatar: true,
        riotAccounts: {
          where: { isPrimary: true },
          select: {
            gameName: true,
            tagLine: true,
            tier: true,
            rank: true,
            lp: true,
            peakTier: true,
            peakRank: true,
            peakLp: true,
            mainRole: true,
            subRole: true,
            championPreferences: {
              orderBy: { order: "asc" },
              select: { role: true, championId: true, order: true },
            },
          },
        },
        clanMemberships: {
          take: 1,
          select: {
            clan: { select: { name: true, tag: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundException("User not found");

    const [stats, reputation, kdaAgg] = await Promise.all([
      this.getUserStats(userId),
      this.reputationService.getUserReputationStats(userId),
      // 내전 참여 기록(teamId 있는 것)에서 KDA 집계
      this.prisma.matchParticipant.aggregate({
        where: { userId, teamId: { not: null } },
        _avg: { kills: true, deaths: true, assists: true },
        _count: { id: true },
      }),
    ]);

    const riot = user.riotAccounts[0] ?? null;
    const clan = user.clanMemberships[0]?.clan ?? null;

    const kdaGames = kdaAgg._count.id;
    const kda =
      kdaGames > 0
        ? {
            kills: Math.round((kdaAgg._avg.kills ?? 0) * 10) / 10,
            deaths: Math.round((kdaAgg._avg.deaths ?? 0) * 10) / 10,
            assists: Math.round((kdaAgg._avg.assists ?? 0) * 10) / 10,
            games: kdaGames,
          }
        : null;

    return {
      username: user.username,
      avatar: user.avatar,
      riotAccount: riot,
      clan,
      stats: {
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.winRate,
      },
      kda,
      reputation: {
        overallAverage: reputation.overallAverage,
        totalRatings: reputation.totalRatings,
      },
    };
  }

  async updateProfile(
    userId: string,
    data: { username?: string; bio?: string },
  ) {
    // 유저네임 유효성 검증
    if (data.username !== undefined) {
      const trimmed = data.username.trim();
      if (trimmed.length < 2 || trimmed.length > 20) {
        throw new BadRequestException("유저네임은 2~20자여야 합니다.");
      }
      if (!/^[a-zA-Z0-9가-힣_]+$/.test(trimmed)) {
        throw new BadRequestException(
          "유저네임은 영문, 숫자, 한글, 밑줄(_)만 사용 가능합니다.",
        );
      }
      // 중복 확인
      const existing = await this.prisma.user.findFirst({
        where: { username: trimmed, id: { not: userId } },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException("이미 사용 중인 유저네임입니다.");
      }
      data.username = trimmed;
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
    });
  }

  async getAvatarUrl(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });
    return user?.avatar || null;
  }

  /**
   * Discord 봇 토큰으로 현재 Discord 프로필 사진을 가져와 아바타를 갱신한다.
   * 커스텀 업로드 아바타도 덮어쓴다 (사용자 명시 요청 시).
   */
  async syncDiscordAvatar(userId: string): Promise<{ avatarUrl: string }> {
    // 유저의 Discord AuthProvider에서 providerId(Discord 유저 ID) 조회
    const discordProvider = await this.prisma.authProvider.findFirst({
      where: { userId, provider: "DISCORD" },
      select: { providerId: true },
    });

    if (!discordProvider) {
      throw new BadRequestException("연결된 Discord 계정이 없습니다.");
    }

    const botToken = this.configService.get<string>("DISCORD_BOT_TOKEN");
    if (!botToken) {
      throw new BadRequestException("Discord Bot 토큰이 설정되지 않았습니다.");
    }

    // Discord API로 최신 프로필 조회
    const res = await fetch(
      `https://discord.com/api/v10/users/${discordProvider.providerId}`,
      { headers: { Authorization: `Bot ${botToken}` } },
    );

    if (!res.ok) {
      throw new BadRequestException("Discord 프로필 조회에 실패했습니다.");
    }

    const profile = await res.json();

    if (!profile.avatar) {
      throw new BadRequestException(
        "Discord 계정에 프로필 사진이 설정되어 있지 않습니다.",
      );
    }

    const ext = profile.avatar.startsWith("a_") ? "gif" : "png";
    const avatarUrl = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${ext}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
    });

    return { avatarUrl };
  }

  /**
   * 회원 탈퇴: 유저 레코드를 삭제한다.
   * - User 모델에 onDelete: Cascade가 설정된 연관 데이터는 자동으로 함께 삭제됨
   * - ChatMessage / DirectMessage 는 onDelete: SetNull이므로 익명 메시지로 보존됨
   *   (개인정보처리방침 및 이용약관에 명시된 내용과 일치)
   */
  async deleteAccount(userId: string): Promise<void> {
    // 존재 여부 확인 (없으면 NotFoundException 발생)
    await this.findById(userId);

    // 유저 레코드 삭제 — Cascade 연관 데이터 자동 삭제
    await this.prisma.user.delete({ where: { id: userId } });
  }

  // ── 이의신청 ─────────────────────────────────────────────────────────────

  /**
   * 이의신청 제출: 밴 또는 임시제재 상태인 유저만 제출 가능
   * - 이미 PENDING 이의신청이 있으면 ConflictException
   * - reason 최대 1000자 검증
   */
  async submitAppeal(userId: string, reason: string) {
    // 파라미터 변조 방어: reason은 반드시 문자열이어야 한다.
    // (배열/객체를 전달해 length·trim 검증을 우회하는 타입 혼동 공격 차단)
    if (typeof reason !== "string") {
      throw new BadRequestException("이의신청 사유 형식이 올바르지 않습니다.");
    }
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException("이의신청 사유를 입력해주세요.");
    }
    if (reason.length > 1000) {
      throw new BadRequestException(
        "이의신청 사유는 1000자 이내로 입력해주세요.",
      );
    }

    // 유저 상태 확인 — 밴 또는 임시제재 상태여야 제출 가능
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        isBanned: true,
        isRestricted: true,
        restrictedUntil: true,
      },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");
    // 제재는 기한이 지나면 자동 해제되므로, 기한이 남은 제재만 이의신청 대상으로 인정
    const restrictionActive =
      user.isRestricted &&
      (!user.restrictedUntil || user.restrictedUntil > new Date());
    if (!user.isBanned && !restrictionActive) {
      throw new BadRequestException(
        "밴 또는 임시제재 상태에서만 이의신청이 가능합니다.",
      );
    }

    // 기존 PENDING 이의신청 존재 여부 확인
    const existing = await this.prisma.appeal.findFirst({
      where: { userId, status: "PENDING" },
    });
    if (existing) {
      throw new ConflictException("이미 심사 중인 이의신청이 있습니다.");
    }

    const appeal = await this.prisma.appeal.create({
      data: { userId, reason: reason.trim() },
    });
    await this.adminAlerts.notifyAppealSubmitted({
      appealId: appeal.id,
      userId,
      username: user.username,
    });

    return appeal;
  }

  /**
   * 내 이의신청 조회: 가장 최근 이의신청 반환
   */
  async getMyAppeal(userId: string) {
    return this.prisma.appeal.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }
}
