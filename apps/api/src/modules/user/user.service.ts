import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

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
      if (!user.settings.showMatchHistory) {
        stats.gamesPlayed = 0;
        stats.wins = 0;
        stats.losses = 0;
        stats.winRate = 0;
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

  async getUserStats(userId: string, requesterId?: string) {
    // Privacy check: if not the owner, verify showMatchHistory
    if (requesterId && requesterId !== userId) {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: { showMatchHistory: true },
      });
      if (settings && !settings.showMatchHistory) {
        return { gamesPlayed: 0, wins: 0, losses: 0, winRate: 0, participations: 0 };
      }
    }

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

    teamMembers.forEach((tm) => {
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

  async updateProfile(userId: string, data: { username?: string; bio?: string }) {
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
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException("이의신청 사유를 입력해주세요.");
    }
    if (reason.length > 1000) {
      throw new BadRequestException("이의신청 사유는 1000자 이내로 입력해주세요.");
    }

    // 유저 상태 확인 — 밴 또는 임시제재 상태여야 제출 가능
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, isRestricted: true },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");
    if (!user.isBanned && !user.isRestricted) {
      throw new BadRequestException("밴 또는 임시제재 상태에서만 이의신청이 가능합니다.");
    }

    // 기존 PENDING 이의신청 존재 여부 확인
    const existing = await this.prisma.appeal.findFirst({
      where: { userId, status: "PENDING" },
    });
    if (existing) {
      throw new ConflictException("이미 심사 중인 이의신청이 있습니다.");
    }

    return this.prisma.appeal.create({
      data: { userId, reason: reason.trim() },
    });
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
