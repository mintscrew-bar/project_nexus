import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma, RoomStatus, Role } from "@nexus/database";
import { MatchService } from "../match/match.service";

const ROLE_SELECTION_TIME_MS = 15000; // 15 seconds (roles are auto-assigned by preference)

export interface RoleSelectionState {
  roomId: string;
  timerEnd: number;
  startedAt: number;
}

@Injectable()
export class RoleSelectionService {
  private roleSelectionStates = new Map<string, RoleSelectionState>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
  ) {}

  /**
   * 역할 동시 선택 충돌(P2034) 발생 시 직렬화 트랜잭션을 재시도한다.
   */
  private async runSerializableTx<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: any) {
        if (error?.code === "P2034" && attempt < maxRetries) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException("트랜잭션 재시도 한도를 초과했습니다.");
  }

  // ========================================
  // Role Selection Initialization
  // ========================================

  async startRoleSelection(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.status !== RoomStatus.DRAFT_COMPLETED) {
      throw new BadRequestException(
        "Room must be in DRAFT_COMPLETED status to start role selection",
      );
    }

    // Update room status
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.ROLE_SELECTION },
    });

    // Initialize state
    const now = Date.now();
    const state: RoleSelectionState = {
      roomId,
      timerEnd: now + ROLE_SELECTION_TIME_MS,
      startedAt: now,
    };

    this.roleSelectionStates.set(roomId, state);

    return {
      room,
      state,
      timeRemaining: ROLE_SELECTION_TIME_MS,
    };
  }

  // ========================================
  // Role Selection
  // ========================================

  async selectRole(userId: string, roomId: string, role: Role) {
    return this.runSerializableTx(async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: roomId },
        include: {
          teams: {
            include: {
              members: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      if (!room) {
        throw new NotFoundException("Room not found");
      }

      if (room.status !== RoomStatus.ROLE_SELECTION) {
        throw new BadRequestException("Room is not in role selection phase");
      }

      // Find the user's team
      let userTeam = null;
      let userTeamMember = null;

      for (const team of room.teams) {
        const member = team.members.find(
          (m: (typeof team.members)[number]) => m.userId === userId,
        );
        if (member) {
          userTeam = team;
          userTeamMember = member;
          break;
        }
      }

      if (!userTeam || !userTeamMember) {
        throw new ForbiddenException("User is not a member of any team");
      }

      // Serializable 트랜잭션 안에서 체크+업데이트:
      // 같은 팀에 이미 동일 역할을 가진 다른 멤버가 있으면 count=0 반환.
      // 동시에 같은 역할을 고른 경우 한쪽 트랜잭션은 P2034로 재시도되고,
      // 재시도 시 이미 선점된 역할이므로 count=0이 된다.
      const updateResult = await tx.teamMember.updateMany({
        where: {
          id: userTeamMember.id,
          team: {
            members: {
              none: {
                assignedRole: role,
                id: { not: userTeamMember.id },
              },
            },
          },
        },
        data: { assignedRole: role },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException(
          `Role ${role} is already taken by another team member`,
        );
      }

      // updateMany는 include를 지원하지 않으므로 업데이트 후 재조회
      const updatedMember = await tx.teamMember.findUnique({
        where: { id: userTeamMember.id },
        include: { user: true },
      });

      if (!updatedMember) {
        throw new NotFoundException("Team member not found after update");
      }

      // Check if all roles are selected against the same serialized snapshot
      const allRolesSelected = await this.checkAllRolesSelected(roomId, tx);

      return {
        member: updatedMember,
        teamId: userTeam.id,
        allRolesSelected,
      };
    });
  }

  // ========================================
  // Completion Check
  // ========================================

  async checkAllRolesSelected(
    roomId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<boolean> {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!room) {
      return false;
    }

    // Check if all team members have selected a role
    for (const team of room.teams) {
      for (const member of team.members) {
        if (!member.assignedRole) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Auto-assign roles for all team members based on their preferred positions.
   * Priority: mainRole → subRole → random from remaining roles.
   * Members are shuffled first to ensure fairness when preferences conflict.
   */
  async autoAssignRolesByPreference(roomId: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    riotAccounts: {
                      where: { isPrimary: true },
                      take: 1,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!room) return;

    const ALL_ROLES: Role[] = [
      Role.TOP,
      Role.JUNGLE,
      Role.MID,
      Role.ADC,
      Role.SUPPORT,
    ];

    for (const team of room.teams) {
      // Shuffle members for fairness when preferences conflict
      const members = [...team.members];
      for (let i = members.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [members[i], members[j]] = [members[j], members[i]];
      }

      const assignedRoles = new Set<Role>();
      const assignments = new Map<string, Role>(); // memberId → role

      // Pass 1: Assign mainRole where not contested
      for (const member of members) {
        const primaryAccount = member.user.riotAccounts[0];
        const mainRole = primaryAccount?.mainRole as Role | undefined;
        if (mainRole && !assignedRoles.has(mainRole)) {
          assignments.set(member.id, mainRole);
          assignedRoles.add(mainRole);
        }
      }

      // Pass 2: Assign subRole for members who didn't get their mainRole
      for (const member of members) {
        if (assignments.has(member.id)) continue;
        const primaryAccount = member.user.riotAccounts[0];
        const subRole = primaryAccount?.subRole as Role | undefined;
        if (subRole && !assignedRoles.has(subRole)) {
          assignments.set(member.id, subRole);
          assignedRoles.add(subRole);
        }
      }

      // Pass 3: Assign random remaining roles for still-unassigned members
      const remainingRoles = ALL_ROLES.filter((r) => !assignedRoles.has(r));
      for (let i = remainingRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingRoles[i], remainingRoles[j]] = [
          remainingRoles[j],
          remainingRoles[i],
        ];
      }

      let remainingIdx = 0;
      for (const member of members) {
        if (assignments.has(member.id)) continue;
        const role = remainingRoles[remainingIdx++];
        if (role) assignments.set(member.id, role);
      }

      // Persist all assignments
      for (const [memberId, role] of assignments) {
        await this.prisma.teamMember.update({
          where: { id: memberId },
          data: { assignedRole: role },
        });
      }
    }
  }

  async autoAssignRemainingRoles(roomId: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: { members: true },
        },
      },
    });

    if (!room) return;

    const ALL_ROLES: Role[] = [
      Role.TOP,
      Role.JUNGLE,
      Role.MID,
      Role.ADC,
      Role.SUPPORT,
    ];

    for (const team of room.teams) {
      const takenRoles = team.members
        .filter((m: (typeof team.members)[number]) => m.assignedRole)
        .map((m: (typeof team.members)[number]) => m.assignedRole as Role);

      const remainingRoles = ALL_ROLES.filter((r) => !takenRoles.includes(r));

      // Shuffle remaining roles for random assignment
      for (let i = remainingRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingRoles[i], remainingRoles[j]] = [
          remainingRoles[j],
          remainingRoles[i],
        ];
      }

      const unassignedMembers = team.members.filter(
        (m: (typeof team.members)[number]) => !m.assignedRole,
      );

      for (let i = 0; i < unassignedMembers.length; i++) {
        const role = remainingRoles[i];
        if (!role) continue;
        await this.prisma.teamMember.update({
          where: { id: unassignedMembers[i].id },
          data: { assignedRole: role },
        });
      }
    }
  }

  async completeRoleSelection(roomId: string) {
    const allSelected = await this.checkAllRolesSelected(roomId);

    if (!allSelected) {
      throw new BadRequestException(
        "Not all team members have selected their roles",
      );
    }

    // Get room data first
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    // Generate bracket (this will also update room status to IN_PROGRESS)
    // If bracket generation fails, we should not proceed to IN_PROGRESS status
    try {
      await this.matchService.generateBracket(room.hostId, roomId);
      // Bracket generation successful - room status is already updated to IN_PROGRESS
    } catch (error: any) {
      // Log error with more details
      console.error("Error generating bracket:", error);

      // If bracket generation fails, throw error instead of silently continuing
      // This prevents room from being in IN_PROGRESS state without a bracket
      throw new BadRequestException(
        `Failed to generate bracket: ${error.message || "Unknown error"}. Please try again or generate bracket manually.`,
      );
    }

    // Fetch updated room (status already updated by generateBracket)
    const updatedRoom = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!updatedRoom) {
      throw new NotFoundException("Room not found after bracket generation");
    }

    // Clean up state
    this.roleSelectionStates.delete(roomId);

    return updatedRoom;
  }

  // ========================================
  // State Management
  // ========================================

  getRoleSelectionState(roomId: string): RoleSelectionState | undefined {
    return this.roleSelectionStates.get(roomId);
  }

  clearRoleSelectionState(roomId: string): void {
    this.roleSelectionStates.delete(roomId);
  }

  getTimeRemaining(roomId: string): number {
    const state = this.roleSelectionStates.get(roomId);
    if (!state) {
      return 0;
    }

    const now = Date.now();
    const remaining = state.timerEnd - now;
    return Math.max(0, remaining);
  }

  async getRoleSelectionData(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        },
        discordChannels: true,
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    const state = this.getRoleSelectionState(roomId);
    const timeRemaining = this.getTimeRemaining(roomId);

    return {
      room,
      state,
      timerEndAt: state?.timerEnd ?? null,
      timeRemaining,
    };
  }
}
