import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, Role } from "@nexus/database";
import { MatchService } from "../match/match.service";

const ROLE_SELECTION_TIME_MS = 120000; // 2 minutes

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

    if (room.status !== RoomStatus.ROLE_SELECTION) {
      throw new BadRequestException("Room is not in role selection phase");
    }

    // Find the user's team
    let userTeam = null;
    let userTeamMember = null;

    for (const team of room.teams) {
      const member = team.members.find((m) => m.userId === userId);
      if (member) {
        userTeam = team;
        userTeamMember = member;
        break;
      }
    }

    if (!userTeam || !userTeamMember) {
      throw new ForbiddenException("User is not a member of any team");
    }

    // Check if role is already taken in the team
    const roleAlreadyTaken = userTeam.members.some(
      (m) => m.assignedRole === role && m.id !== userTeamMember.id,
    );

    if (roleAlreadyTaken) {
      throw new BadRequestException(
        `Role ${role} is already taken by another team member`,
      );
    }

    // Update the team member's role
    const updatedMember = await this.prisma.teamMember.update({
      where: { id: userTeamMember.id },
      data: { assignedRole: role },
      include: {
        user: true,
      },
    });

    // Check if all roles are selected
    const allRolesSelected = await this.checkAllRolesSelected(roomId);

    return {
      member: updatedMember,
      teamId: userTeam.id,
      allRolesSelected,
    };
  }

  // ========================================
  // Completion Check
  // ========================================

  async checkAllRolesSelected(roomId: string): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
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
        .filter((m) => m.assignedRole)
        .map((m) => m.assignedRole as Role);

      const remainingRoles = ALL_ROLES.filter((r) => !takenRoles.includes(r));

      // Shuffle remaining roles for random assignment
      for (let i = remainingRoles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingRoles[i], remainingRoles[j]] = [
          remainingRoles[j],
          remainingRoles[i],
        ];
      }

      const unassignedMembers = team.members.filter((m) => !m.assignedRole);

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
      timeRemaining,
    };
  }
}
