import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, TeamMode } from "@nexus/database";

export interface SnakeDraftState {
  roomId: string;
  currentTeamIndex: number;
  currentRound: number;
  pickOrder: string[]; // Team IDs in pick order
  isReversing: boolean;
  availablePlayers: string[]; // User IDs not yet picked
  timerEnd: number;
}

const PICK_TIMER_SECONDS = 30;

@Injectable()
export class SnakeDraftService {
  private draftStates = new Map<string, SnakeDraftState>();

  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // Draft Initialization
  // ========================================

  async startSnakeDraft(hostId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: {
            user: {
              include: {
                riotAccounts: {
                  where: { isPrimary: true },
                },
              },
            },
          },
        },
        teams: true,
      },
    });

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    if (room.hostId !== hostId) {
      throw new ForbiddenException("Only host can start draft");
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Room already started");
    }

    if (room.teamMode !== TeamMode.SNAKE_DRAFT) {
      throw new BadRequestException("Room is not in snake draft mode");
    }

    // Calculate number of teams (2 for 10 players, 3 for 15, 4 for 20)
    const numTeams = Math.floor(room.participants.length / 5);
    if (numTeams < 2) {
      throw new BadRequestException("Need at least 10 players for draft");
    }

    // Select captains - two methods:
    // 1. Random selection
    // 2. Coin flip / highest tier players
    const captains = await this.selectCaptains(room.participants, numTeams);
    const players = room.participants.filter(
      (p) => !captains.find((c) => c.id === p.id),
    );

    // Create teams
    const teams = await Promise.all(
      captains.map(async (captain, index) => {
        return this.prisma.team.create({
          data: {
            roomId,
            name: `Team ${index + 1}`,
            captainId: captain.userId,
            color: this.getTeamColor(index),
            members: {
              create: {
                userId: captain.userId,
                assignedRole: captain.user.riotAccounts[0]?.mainRole,
                pickOrder: 0, // Captain is pick 0
              },
            },
          },
        });
      }),
    );

    // Update room status
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.TEAM_SELECTION },
    });

    // Mark captains
    await Promise.all(
      captains.map((captain) =>
        this.prisma.roomParticipant.update({
          where: { id: captain.id },
          data: {
            isCaptain: true,
            teamId: teams.find((t) => t.captainId === captain.userId)?.id,
          },
        }),
      ),
    );

    // Initialize snake draft state
    const pickOrder = this.generatePickOrder(
      teams.map((t) => t.id),
      numTeams,
    );

    const draftState: SnakeDraftState = {
      roomId,
      currentTeamIndex: 0,
      currentRound: 1,
      pickOrder,
      isReversing: false,
      availablePlayers: players.map((p) => p.userId),
      timerEnd: Date.now() + PICK_TIMER_SECONDS * 1000,
    };

    this.draftStates.set(roomId, draftState);

    return {
      teams,
      players: players.map((p) => ({
        id: p.userId,
        username: p.user.username,
        avatar: p.user.avatar,
        tier: p.user.riotAccounts[0]?.tier,
        rank: p.user.riotAccounts[0]?.rank,
        mainRole: p.user.riotAccounts[0]?.mainRole,
        subRole: p.user.riotAccounts[0]?.subRole,
      })),
      draftState,
      pickOrder,
    };
  }

  // ========================================
  // Captain Selection Methods
  // ========================================

  private async selectCaptains(participants: any[], numTeams: number) {
    // Method 1: Random selection
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, numTeams);

    // Method 2: Highest tier (commented out, can be used instead)
    // return participants
    //   .sort((a, b) => {
    //     const aTier = a.user.riotAccounts[0]?.tier || "UNRANKED";
    //     const bTier = b.user.riotAccounts[0]?.tier || "UNRANKED";
    //     const tierOrder = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
    //     return tierOrder.indexOf(bTier) - tierOrder.indexOf(aTier);
    //   })
    //   .slice(0, numTeams);
  }

  // ========================================
  // Snake Draft Pick Order
  // ========================================

  /**
   * Generates snake draft pick order
   * Example for 2 teams: A, B, B, A, A, B, B, A
   * Example for 3 teams: A, B, C, C, B, A, A, B, C
   */
  private generatePickOrder(teamIds: string[], numTeams: number): string[] {
    const order: string[] = [];
    const playersPerTeam = 5;
    const rounds = playersPerTeam - 1; // -1 because captains already picked

    for (let round = 0; round < rounds; round++) {
      if (round % 2 === 0) {
        // Normal order: A, B, C, ...
        for (let i = 0; i < numTeams; i++) {
          order.push(teamIds[i]);
        }
      } else {
        // Reverse order: ..., C, B, A
        for (let i = numTeams - 1; i >= 0; i--) {
          order.push(teamIds[i]);
        }
      }
    }

    return order;
  }

  // ========================================
  // Making Picks
  // ========================================

  async makePick(
    userId: string,
    roomId: string,
    targetPlayerId: string,
  ): Promise<SnakeDraftState> {
    const state = this.draftStates.get(roomId);
    if (!state) {
      throw new BadRequestException("Draft not started");
    }

    // Get current team that should pick
    const currentTeamId = state.pickOrder[state.currentTeamIndex];

    const team = await this.prisma.team.findUnique({
      where: { id: currentTeamId },
    });

    if (!team) {
      throw new NotFoundException("Team not found");
    }

    // Verify it's the captain's turn
    if (team.captainId !== userId) {
      throw new ForbiddenException("Not your turn to pick");
    }

    // Verify player is available
    if (!state.availablePlayers.includes(targetPlayerId)) {
      throw new BadRequestException("Player not available");
    }

    // Get player info
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId: targetPlayerId },
    });

    if (!participant) {
      throw new NotFoundException("Player not found");
    }

    // Make the pick
    const pickNumber = state.currentTeamIndex + 1;

    await this.prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: targetPlayerId,
        pickOrder: pickNumber,
      },
    });

    await this.prisma.roomParticipant.update({
      where: { id: participant.id },
      data: { teamId: team.id },
    });

    // Record pick in database
    await this.prisma.snakeDraftPick.create({
      data: {
        roomId,
        teamId: team.id,
        userId: targetPlayerId,
        pickNumber,
      },
    });

    // Update state
    state.availablePlayers = state.availablePlayers.filter(
      (id) => id !== targetPlayerId,
    );
    state.currentTeamIndex++;
    state.timerEnd = Date.now() + PICK_TIMER_SECONDS * 1000;

    // Check if we need to reverse
    const numTeams = state.pickOrder.filter(
      (id, i, arr) => arr.indexOf(id) === i,
    ).length;
    if (state.currentTeamIndex % numTeams === 0) {
      state.currentRound++;
      state.isReversing = !state.isReversing;
    }

    return state;
  }

  // ========================================
  // Auto-Pick (when timer expires)
  // ========================================

  async autoPick(roomId: string): Promise<SnakeDraftState> {
    const state = this.draftStates.get(roomId);
    if (!state) {
      throw new BadRequestException("Draft not started");
    }

    if (state.availablePlayers.length === 0) {
      throw new BadRequestException("No players available");
    }

    // Pick random player from available
    const randomIndex = Math.floor(
      Math.random() * state.availablePlayers.length,
    );
    const targetPlayerId = state.availablePlayers[randomIndex];

    const currentTeamId = state.pickOrder[state.currentTeamIndex];
    const team = await this.prisma.team.findUnique({
      where: { id: currentTeamId },
    });

    if (!team) {
      throw new NotFoundException("Team not found");
    }

    // Make auto pick (same logic as manual pick)
    return this.makePick(team.captainId, roomId, targetPlayerId);
  }

  // ========================================
  // Draft Completion
  // ========================================

  async checkDraftComplete(roomId: string): Promise<boolean> {
    const state = this.draftStates.get(roomId);
    if (!state) return false;

    return state.availablePlayers.length === 0;
  }

  async completeDraft(roomId: string) {
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.IN_PROGRESS },
    });

    this.draftStates.delete(roomId);

    return { message: "Draft completed" };
  }

  // ========================================
  // Utility
  // ========================================

  getDraftState(roomId: string): SnakeDraftState | undefined {
    return this.draftStates.get(roomId);
  }

  getCurrentPickingTeam(roomId: string): string | null {
    const state = this.draftStates.get(roomId);
    if (!state) return null;

    return state.pickOrder[state.currentTeamIndex] || null;
  }

  private getTeamColor(index: number): string {
    const colors = [
      "#3B82F6", // Blue
      "#EF4444", // Red
      "#10B981", // Green
      "#F59E0B", // Yellow
      "#8B5CF6", // Purple
      "#EC4899", // Pink
    ];
    return colors[index % colors.length];
  }
}
