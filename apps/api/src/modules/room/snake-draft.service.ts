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
import { Prisma } from "@prisma/client";
import { calculateTierScore } from "../common/tier-score.util";

export interface SnakeDraftState {
  roomId: string;
  numTeams: number;
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
      (p: (typeof room.participants)[number]) => !captains.find((c: (typeof room.participants)[number]) => c.id === p.id),
    );

    // 팀 생성 + 상태 전환 + 캡틴 배정을 원자적으로 처리
    const teams = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdTeams = await Promise.all(
        captains.map(async (captain, index) => {
          return tx.team.create({
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

      await tx.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DRAFT },
      });

      await Promise.all(
        captains.map((captain) =>
          tx.roomParticipant.update({
            where: { id: captain.id },
            data: {
              isCaptain: true,
              teamId: createdTeams.find(
                (t) => t.captainId === captain.userId,
              )?.id,
            },
          }),
        ),
      );

      return createdTeams;
    });

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
      teams.map((t: (typeof teams)[number]) => t.id),
      numTeams,
    );

    const draftState: SnakeDraftState = {
      roomId,
      numTeams: teams.length,
      currentTeamIndex: 0,
      currentRound: 1,
      pickOrder,
      isReversing: false,
      availablePlayers: players.map((p: (typeof players)[number]) => p.userId),
      timerEnd: Date.now() + (room.pickTimeLimit || 60) * 1000,
    };

    this.draftStates.set(roomId, draftState);

    return {
      teams,
      players: players.map((p: (typeof players)[number]) => {
        const acc = p.user.riotAccounts[0];
        return {
          id: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          tier: acc?.tier,
          rank: acc?.rank,
          lp: acc?.lp,
          mmr: calculateTierScore(
            acc?.tier || "UNRANKED",
            acc?.rank || "",
            acc?.lp || 0,
          ),
          mainRole: acc?.mainRole,
          subRole: acc?.subRole,
        };
      }),
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
          const aScore = calculateTierScore(
            aAcc?.tier || "UNRANKED",
            aAcc?.rank || "",
            aAcc?.lp || 0,
          );
          const bScore = calculateTierScore(
            bAcc?.tier || "UNRANKED",
            bAcc?.rank || "",
            bAcc?.lp || 0,
          );
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
    const picksNeededPerTeam = playersPerTeam - 1; // 캡틴 제외 4명
    const totalPicksNeeded = picksNeededPerTeam * numTeams;

    // 공정성 강화: 순환형 스네이크(Rotating Snake)
    // 매 라운드가 끝날 때 마지막 팀이 다음 라운드의 첫 팀이 되도록 순번을 회전시킵니다.
    // 3팀 예시 (12픽):
    // R1: [T1, T2, T3] (3번팀 끝)
    // R2: [T3, T1, T2] (T3 연속 픽, 2번팀 끝)
    // R3: [T2, T3, T1] (T2 연속 픽, 1번팀 끝)
    // R4: [T1, T2, T3] (T1 연속 픽)
    
    for (let round = 0; round < picksNeededPerTeam; round++) {
      // 라운드별 시작 오프셋 계산: (numTeams - (round % numTeams)) % numTeams
      // R0: 0, R1: 2, R2: 1, R3: 0 (3팀 기준)
      const startingOffset = (numTeams - (round % numTeams)) % numTeams;
      
      for (let i = 0; i < numTeams; i++) {
        const teamIndex = (startingOffset + i) % numTeams;
        order.push(teamIds[teamIndex]);
      }
    }

    return order.slice(0, totalPicksNeeded);
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

    const currentTeamId = state.pickOrder[state.currentTeamIndex];
    const team = await this.prisma.team.findUnique({
      where: { id: currentTeamId },
    });

    if (!team) {
      throw new NotFoundException("Team not found");
    }

    // Timer expiration check — 2초 grace period로 네트워크 지연 허용
    const TIMER_GRACE_MS = 2000;
    if (Date.now() > state.timerEnd + TIMER_GRACE_MS) {
      throw new BadRequestException("Pick time has expired");
    }

    if (team.captainId !== userId) {
      throw new ForbiddenException("Not your turn to pick");
    }

    if (!state.availablePlayers.includes(targetPlayerId)) {
      throw new BadRequestException("Player not available");
    }

    return this.executePick(state, roomId, team.id, targetPlayerId);
  }

  async autoPick(roomId: string): Promise<SnakeDraftState> {
    const state = this.draftStates.get(roomId);
    if (!state) {
      throw new BadRequestException("Draft not started");
    }

    if (state.availablePlayers.length === 0) {
      throw new BadRequestException("No players available");
    }

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

    return this.executePick(state, roomId, team.id, targetPlayerId);
  }

  /** 공통 픽 실행: DB 트랜잭션 + 인메모리 상태 업데이트 */
  private async executePick(
    state: SnakeDraftState,
    roomId: string,
    teamId: string,
    targetPlayerId: string,
  ): Promise<SnakeDraftState> {
    const participant = await this.prisma.roomParticipant.findFirst({
      where: { roomId, userId: targetPlayerId },
    });

    if (!participant) {
      throw new NotFoundException("Player not found");
    }

    const pickNumber = state.currentTeamIndex + 1;

    const roomSettings = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { pickTimeLimit: true },
    });

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.teamMember.create({
        data: { teamId, userId: targetPlayerId, pickOrder: pickNumber },
      });

      await tx.roomParticipant.update({
        where: { id: participant.id },
        data: { teamId },
      });

      await tx.snakeDraftPick.create({
        data: { roomId, teamId, userId: targetPlayerId, pickNumber },
      });
    });

    // Update in-memory state
    state.availablePlayers = state.availablePlayers.filter(
      (id) => id !== targetPlayerId,
    );
    state.currentTeamIndex++;
    state.timerEnd = Date.now() + (roomSettings?.pickTimeLimit ?? 60) * 1000;

    if (state.currentTeamIndex % state.numTeams === 0) {
      state.currentRound++;
      state.isReversing = !state.isReversing;
    }

    return state;
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

  async getClientDraftState(roomId: string): Promise<any | null> {
    const state = this.draftStates.get(roomId);
    if (!state) return null;

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        teams: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    riotAccounts: { where: { isPrimary: true } },
                  },
                },
              },
            },
          },
        },
        participants: {
          where: { role: "PLAYER", teamId: null, isCaptain: false },
          include: {
            user: {
              include: {
                riotAccounts: { where: { isPrimary: true } },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    if (!room) return null;

    const teams = room.teams.map((t: any) => ({
      id: t.id,
      name: t.name,
      captainId: t.captainId,
      members: t.members.map((m: any) => {
        const acc = m.user?.riotAccounts?.[0];
        return {
          id: m.userId,
          username: m.user?.username ?? "Unknown",
          tier: acc?.tier ?? "UNRANKED",
          rank: acc?.rank,
          mmr: calculateTierScore(
            acc?.tier || "UNRANKED",
            acc?.rank || "",
            acc?.lp || 0,
          ),
          position: m.assignedRole ?? acc?.mainRole ?? "FLEX",
        };
      }),
    }));

    const availablePlayers = room.participants.map((p: any) => {
      const acc = p.user?.riotAccounts?.[0];
      return {
        id: p.userId,
        username: p.user?.username ?? "Unknown",
        tier: acc?.tier ?? "UNRANKED",
        rank: acc?.rank,
        mmr: calculateTierScore(
          acc?.tier || "UNRANKED",
          acc?.rank || "",
          acc?.lp || 0,
        ),
        position: acc?.mainRole ?? "FLEX",
      };
    });

    return {
      roomId,
      teams,
      availablePlayers,
      pickOrder: state.pickOrder,
      currentPickIndex: state.currentTeamIndex,
      currentTeamId: state.pickOrder[state.currentTeamIndex] ?? null,
      timerEnd: state.timerEnd,
      status: "IN_PROGRESS",
    };
  }

  clearDraftState(roomId: string): void {
    this.draftStates.delete(roomId);
  }

  async cleanupBotOnlyRoomOnHostDisconnect(
    userId: string,
    roomId: string,
  ): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        discordChannels: {
          select: {
            channelId: true,
            teamName: true,
          },
        },
        participants: {
          include: {
            user: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    if (!room || room.hostId !== userId) {
      return false;
    }

    const remainingParticipants = room.participants.filter(
      (p: (typeof room.participants)[number]) => p.userId !== userId,
    );
    const shouldDelete =
      remainingParticipants.length === 0 ||
      remainingParticipants.every((p: (typeof remainingParticipants)[number]) =>
        /^testbot_\d+$/.test(p.user?.username ?? ""),
      );

    if (!shouldDelete) {
      return false;
    }

    try {
      if (this.discordVoiceService) {
        await this.discordVoiceService
          .deleteRoomChannels(roomId, false, {
            discordCategoryId: room.discordCategoryId,
            discordChannels: room.discordChannels,
          })
          .catch(() => {});
      }
    } catch {
      // Ignore Discord cleanup failures for zombie-room cleanup.
    }

    await this.prisma.room.delete({ where: { id: roomId } });
    this.clearDraftState(roomId);
    return true;
  }

  getCurrentPickingTeam(roomId: string): string | null {
    const state = this.draftStates.get(roomId);
    if (!state) return null;

    return state.pickOrder[state.currentTeamIndex] || null;
  }

  /**
   * 특정 팀의 캡틴이 해당 userId인지 확인한다.
   * 게이트웨이 레이어에서 현재 턴 픽 권한을 선제 검증할 때 사용.
   */
  async isTeamCaptain(teamId: string, userId: string): Promise<boolean> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { captainId: true },
    });
    return team?.captainId === userId;
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
