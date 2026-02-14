import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Inject,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, TeamMode, TeamCaptainSelection } from "@nexus/database";
import { calculateTierScore } from "../common/tier-score.util";

export interface SnakeDraftState {
  roomId: string;
  currentTeamIndex: number;
  currentRound: number;
  pickOrder: string[]; // Team IDs in pick order
  isReversing: boolean;
  availablePlayers: string[]; // User IDs not yet picked
  timerEnd: number;
}

@Injectable()
export class SnakeDraftService {
  private draftStates = new Map<string, SnakeDraftState>();
  private discordVoiceService: any; // DiscordVoiceService (optional dependency)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject("DISCORD_VOICE_SERVICE") discordVoice?: any,
  ) {
    this.discordVoiceService = discordVoice;
  }

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

    const numTeams = Math.floor(room.participants.length / 5);
    if (numTeams < 2) {
      throw new BadRequestException("Need at least 10 players for draft");
    }

    const captains = await this.selectCaptains(
      room.participants,
      numTeams,
      room.captainSelection,
    );
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
                pickOrder: 0,
              },
            },
          },
        });
      }),
    );

    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.DRAFT },
    });

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

    // Discord 봇: 팀장에게 역할 부여
    try {
      if (this.discordVoiceService) {
        await Promise.all(
          captains.map(async (captain) => {
            const discordProvider = await this.prisma.authProvider.findFirst({
              where: {
                userId: captain.userId,
                provider: "DISCORD",
              },
            });

            if (discordProvider) {
              await this.discordVoiceService.assignCaptainRole(
                discordProvider.providerId,
              );
            }
          }),
        );
      }
    } catch (error) {
      console.warn("Failed to assign Discord captain roles:", error);
    }

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
      timerEnd: Date.now() + (room.pickTimeLimit || 60) * 1000,
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

  private async selectCaptains(
    participants: any[],
    numTeams: number,
    selectionMethod: TeamCaptainSelection | null,
  ) {
    if (selectionMethod === "TIER") {
      return participants
        .sort((a, b) => {
          // Tier + Rank + LP 통합 점수 기준 정렬
          const aAcc = a.user.riotAccounts[0];
          const bAcc = b.user.riotAccounts[0];
          const aScore = calculateTierScore(aAcc?.tier || "UNRANKED", aAcc?.rank || "", aAcc?.lp || 0);
          const bScore = calculateTierScore(bAcc?.tier || "UNRANKED", bAcc?.rank || "", bAcc?.lp || 0);
          return bScore - aScore;
        })
        .slice(0, numTeams);
    }

    // Default to RANDOM
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, numTeams);
  }

  // ========================================
  // Snake Draft Pick Order
  // ========================================

  // ... (rest of the file is unchanged)

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
  // ... (rest of the file is unchanged)

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

    // Timer expiration check — 서버 기준으로 타이머 만료 여부 확인
    if (Date.now() > state.timerEnd) {
      throw new BadRequestException("Pick time has expired");
    }

    // Verify it's the captain's turn
    if (team.captainId !== userId) {
      throw new ForbiddenException("Not your turn to pick");
    }

    // Verify player is available
    if (!state.availablePlayers.includes(targetPlayerId)) {
      throw new BadRequestException("Player not available");
    }

    // Get player info and room settings in one go
    const [participant, roomSettings] = await Promise.all([
      this.prisma.roomParticipant.findFirst({
        where: { roomId, userId: targetPlayerId },
      }),
      this.prisma.room.findUnique({
        where: { id: roomId },
        select: { pickTimeLimit: true },
      }),
    ]);

    if (!participant) {
      throw new NotFoundException("Player not found");
    }

    const pickNumber = state.currentTeamIndex + 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: targetPlayerId,
          pickOrder: pickNumber,
        },
      });

      await tx.roomParticipant.update({
        where: { id: participant.id },
        data: { teamId: team.id },
      });

      await tx.snakeDraftPick.create({
        data: {
          roomId,
          teamId: team.id,
          userId: targetPlayerId,
          pickNumber,
        },
      });
    });

    // Update in-memory state
    state.availablePlayers = state.availablePlayers.filter(
      (id) => id !== targetPlayerId,
    );
    state.currentTeamIndex++;
    state.timerEnd =
      Date.now() + (roomSettings?.pickTimeLimit ?? 60) * 1000;

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

  // ... (rest of the file is unchanged)

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

  async checkDraftComplete(roomId: string): Promise<boolean> {
    const state = this.draftStates.get(roomId);
    if (!state) return false;

    return state.availablePlayers.length === 0;
  }

  async completeDraft(roomId: string) {
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.DRAFT_COMPLETED },
    });

    // Discord 봇: 팀 구성 완료 시 팀별 음성채널 배치
    try {
      if (this.discordVoiceService) {
        await this.discordVoiceService.handleTeamAssignment(roomId);
      }
    } catch (error) {
      console.warn("Failed to assign teams to Discord channels:", error);
    }

    this.draftStates.delete(roomId);

    return { message: "Draft completed" };
  }

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
