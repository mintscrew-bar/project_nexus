import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Inject,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, TeamCaptainSelection, TeamMode } from "@nexus/database";
import { calculateTierScore } from "../common/tier-score.util";

const BONUS_GOLD = 500;

export interface AuctionState {
  roomId: string;
  currentPlayerIndex: number;
  currentHighestBid: number;
  currentHighestBidder: string | null;
  timerEnd: number;
  yuchalCount: number;
  maxYuchalCycles: number;
}

export interface CaptainSelectionPhase {
  mode: TeamCaptainSelection;
  requiredCount: number;
  volunteers: string[]; // userId[]
  timerEnd: number | null;
  timerHandle: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class AuctionService {
  private auctionStates = new Map<string, AuctionState>();
  private captainPhases = new Map<string, CaptainSelectionPhase>();
  private discordVoiceService: any; // DiscordVoiceService (optional dependency)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject("DISCORD_VOICE_SERVICE") discordVoice?: any,
  ) {
    this.discordVoiceService = discordVoice;
  }

  // ========================================
  // Auction Initialization
  // ========================================

  async startAuction(hostId: string, roomId: string) {
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
      throw new ForbiddenException("Only host can start auction");
    }

    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("Room already started");
    }

    if (room.teamMode !== TeamMode.AUCTION) {
      throw new BadRequestException("Room is not in auction mode");
    }

    // Calculate number of teams
    const numTeams = Math.floor(room.participants.length / 5);
    if (numTeams < 2) {
      throw new BadRequestException("Need at least 10 players for auction");
    }

    const captainMode = room.captainSelection ?? TeamCaptainSelection.TIER;

    // MANUAL / VOLUNTEER: 팀장 선정 단계 진입 (경매 시작 보류)
    if (captainMode === TeamCaptainSelection.MANUAL) {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DRAFT },
      });

      return {
        captainSelectionPhase: {
          mode: TeamCaptainSelection.MANUAL,
          requiredCount: numTeams,
          volunteers: [],
          timerEnd: null,
        },
        participants: room.participants.map((p) => {
          const acc = p.user.riotAccounts[0];
          return {
            id: p.userId,
            username: p.user.username,
            avatar: p.user.avatar,
            tier: acc?.tier,
            rank: acc?.rank,
            mmr: calculateTierScore(acc?.tier || 'UNRANKED', acc?.rank || '', acc?.lp || 0),
          };
        }),
      };
    }

    if (captainMode === TeamCaptainSelection.VOLUNTEER) {
      const timerEnd = Date.now() + 30_000;

      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: RoomStatus.DRAFT },
      });

      const phase: CaptainSelectionPhase = {
        mode: TeamCaptainSelection.VOLUNTEER,
        requiredCount: numTeams,
        volunteers: [],
        timerEnd,
        timerHandle: null,
      };
      this.captainPhases.set(roomId, phase);

      return {
        captainSelectionPhase: {
          mode: TeamCaptainSelection.VOLUNTEER,
          requiredCount: numTeams,
          volunteers: [],
          timerEnd,
        },
        participants: room.participants.map((p) => {
          const acc = p.user.riotAccounts[0];
          return {
            id: p.userId,
            username: p.user.username,
            avatar: p.user.avatar,
            tier: acc?.tier,
            rank: acc?.rank,
            mmr: calculateTierScore(acc?.tier || 'UNRANKED', acc?.rank || '', acc?.lp || 0),
          };
        }),
      };
    }

    // TIER (default): MMR 자동 선정
    return this._startAuctionWithCaptains(hostId, roomId, room);
  }

  // ========================================
  // Captain Selection Helpers
  // ========================================

  private async _startAuctionWithCaptains(hostId: string, roomId: string, room: any) {
    const numTeams = Math.floor(room.participants.length / 5);

    const sortedPlayers = [...room.participants].sort((a: any, b: any) => {
      const aAcc = a.user.riotAccounts[0];
      const bAcc = b.user.riotAccounts[0];
      const aScore = calculateTierScore(aAcc?.tier || "UNRANKED", aAcc?.rank || "", aAcc?.lp || 0);
      const bScore = calculateTierScore(bAcc?.tier || "UNRANKED", bAcc?.rank || "", bAcc?.lp || 0);
      return bScore - aScore;
    });

    const captains = sortedPlayers.slice(0, numTeams);
    const players = sortedPlayers.slice(numTeams);

    const { teams } = await this._applySelectedCaptains(roomId, room, captains.map((c: any) => c.userId));

    const auctionState: AuctionState = {
      roomId,
      currentPlayerIndex: 0,
      currentHighestBid: 0,
      currentHighestBidder: null,
      timerEnd: Date.now() + (room.bidTimeLimit || 30) * 1000,
      yuchalCount: 0,
      maxYuchalCycles: numTeams,
    };

    this.auctionStates.set(roomId, auctionState);

    return {
      teams,
      players: players.map((p: any) => {
        const acc = p.user.riotAccounts[0];
        return {
          id: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          tier: acc?.tier,
          rank: acc?.rank,
          lp: acc?.lp,
          mmr: calculateTierScore(acc?.tier || 'UNRANKED', acc?.rank || '', acc?.lp || 0),
          mainRole: acc?.mainRole,
          subRole: acc?.subRole,
        };
      }),
      auctionState,
    };
  }

  async _applySelectedCaptains(roomId: string, room: any, captainUserIds: string[]) {
    const captainParticipants = room.participants.filter((p: any) => captainUserIds.includes(p.userId));

    const teams = await Promise.all(
      captainParticipants.map(async (captain: any, index: number) => {
        const initialBudget = room.startingPoints || 1000;
        return this.prisma.team.create({
          data: {
            roomId,
            name: `Team ${index + 1}`,
            captainId: captain.userId,
            color: this.getTeamColor(index),
            initialBudget,
            remainingBudget: initialBudget,
            members: {
              create: {
                userId: captain.userId,
                assignedRole: captain.user.riotAccounts[0]?.mainRole,
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
      captainParticipants.map((captain: any) =>
        this.prisma.roomParticipant.update({
          where: { id: captain.id },
          data: {
            isCaptain: true,
            teamId: teams.find((t) => t.captainId === captain.userId)?.id,
          },
        }),
      ),
    );

    try {
      if (this.discordVoiceService) {
        await Promise.all(
          captainParticipants.map(async (captain: any) => {
            const discordProvider = await this.prisma.authProvider.findFirst({
              where: { userId: captain.userId, provider: "DISCORD" },
            });
            if (discordProvider) {
              await this.discordVoiceService.assignCaptainRole(discordProvider.providerId);
            }
          }),
        );
      }
    } catch (error) {
      console.warn("Failed to assign Discord captain roles:", error);
    }

    return { teams };
  }

  async handleVolunteer(userId: string, roomId: string): Promise<{ volunteers: string[] }> {
    const phase = this.captainPhases.get(roomId);
    if (!phase || phase.mode !== TeamCaptainSelection.VOLUNTEER) {
      throw new BadRequestException("Not in volunteer phase");
    }

    const idx = phase.volunteers.indexOf(userId);
    if (idx === -1) {
      phase.volunteers.push(userId);
    } else {
      phase.volunteers.splice(idx, 1);
    }

    return { volunteers: phase.volunteers };
  }

  async finalizeVolunteers(hostId: string, roomId: string, selectedUserIds?: string[]) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: { user: { include: { riotAccounts: { where: { isPrimary: true } } } } },
        },
      },
    });
    if (!room) throw new NotFoundException("Room not found");
    if (room.hostId !== hostId) throw new ForbiddenException("Only host can finalize");

    const phase = this.captainPhases.get(roomId);
    if (!phase || phase.mode !== TeamCaptainSelection.VOLUNTEER) {
      throw new BadRequestException("Not in volunteer phase");
    }

    if (phase.timerHandle) {
      clearTimeout(phase.timerHandle);
    }

    const numTeams = phase.requiredCount;
    let captainUserIds: string[];

    if (phase.volunteers.length === 0) {
      // Fallback: MMR 자동
      const sorted = [...room.participants].sort((a, b) => {
        const aAcc = a.user.riotAccounts[0];
        const bAcc = b.user.riotAccounts[0];
        return calculateTierScore(bAcc?.tier || 'UNRANKED', bAcc?.rank || '', bAcc?.lp || 0)
          - calculateTierScore(aAcc?.tier || 'UNRANKED', aAcc?.rank || '', aAcc?.lp || 0);
      });
      captainUserIds = sorted.slice(0, numTeams).map((p) => p.userId);
    } else if (phase.volunteers.length <= numTeams) {
      // 자원자 부족 or 딱 맞음: 자원자 모두 팀장 + 나머지 MMR로 채움
      const remaining = numTeams - phase.volunteers.length;
      captainUserIds = [...phase.volunteers];
      if (remaining > 0) {
        const nonVolunteers = room.participants
          .filter((p) => !phase.volunteers.includes(p.userId))
          .sort((a, b) => {
            const aAcc = a.user.riotAccounts[0];
            const bAcc = b.user.riotAccounts[0];
            return calculateTierScore(bAcc?.tier || 'UNRANKED', bAcc?.rank || '', bAcc?.lp || 0)
              - calculateTierScore(aAcc?.tier || 'UNRANKED', aAcc?.rank || '', aAcc?.lp || 0);
          });
        captainUserIds.push(...nonVolunteers.slice(0, remaining).map((p) => p.userId));
      }
    } else {
      // 자원자 초과: 방장이 selectedUserIds 지정 필수
      if (!selectedUserIds || selectedUserIds.length !== numTeams) {
        throw new BadRequestException(`Select exactly ${numTeams} captains from volunteers`);
      }
      const invalidIds = selectedUserIds.filter((id) => !phase.volunteers.includes(id));
      if (invalidIds.length > 0) {
        throw new BadRequestException("Selected users must be volunteers");
      }
      captainUserIds = selectedUserIds;
    }

    this.captainPhases.delete(roomId);

    const { teams } = await this._applySelectedCaptains(roomId, room, captainUserIds);

    const nonCaptains = room.participants.filter((p) => !captainUserIds.includes(p.userId));
    const numTeamsFinal = teams.length;

    const auctionState: AuctionState = {
      roomId,
      currentPlayerIndex: 0,
      currentHighestBid: 0,
      currentHighestBidder: null,
      timerEnd: Date.now() + ((room as any).bidTimeLimit || 30) * 1000,
      yuchalCount: 0,
      maxYuchalCycles: numTeamsFinal,
    };

    this.auctionStates.set(roomId, auctionState);

    return {
      teams,
      players: nonCaptains.map((p) => {
        const acc = p.user.riotAccounts[0];
        return {
          id: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          tier: acc?.tier,
          rank: acc?.rank,
          lp: acc?.lp,
          mmr: calculateTierScore(acc?.tier || 'UNRANKED', acc?.rank || '', acc?.lp || 0),
          mainRole: acc?.mainRole,
          subRole: acc?.subRole,
        };
      }),
      auctionState,
      captainUserIds,
    };
  }

  async selectManualCaptains(hostId: string, roomId: string, userIds: string[]) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER" },
          include: { user: { include: { riotAccounts: { where: { isPrimary: true } } } } },
        },
      },
    });
    if (!room) throw new NotFoundException("Room not found");
    if (room.hostId !== hostId) throw new ForbiddenException("Only host can select captains");

    const numTeams = Math.floor(room.participants.length / 5);
    if (userIds.length !== numTeams) {
      throw new BadRequestException(`Need exactly ${numTeams} captains`);
    }

    const participantIds = room.participants.map((p) => p.userId);
    const invalid = userIds.filter((id) => !participantIds.includes(id));
    if (invalid.length > 0) {
      throw new BadRequestException("Selected users must be participants");
    }

    const { teams } = await this._applySelectedCaptains(roomId, room, userIds);
    const nonCaptains = room.participants.filter((p) => !userIds.includes(p.userId));

    const auctionState: AuctionState = {
      roomId,
      currentPlayerIndex: 0,
      currentHighestBid: 0,
      currentHighestBidder: null,
      timerEnd: Date.now() + ((room as any).bidTimeLimit || 30) * 1000,
      yuchalCount: 0,
      maxYuchalCycles: numTeams,
    };

    this.auctionStates.set(roomId, auctionState);

    return {
      teams,
      players: nonCaptains.map((p) => {
        const acc = p.user.riotAccounts[0];
        return {
          id: p.userId,
          username: p.user.username,
          avatar: p.user.avatar,
          tier: acc?.tier,
          rank: acc?.rank,
          lp: acc?.lp,
          mmr: calculateTierScore(acc?.tier || 'UNRANKED', acc?.rank || '', acc?.lp || 0),
          mainRole: acc?.mainRole,
          subRole: acc?.subRole,
        };
      }),
      auctionState,
      captainUserIds: userIds,
    };
  }

  getCaptainPhase(roomId: string): CaptainSelectionPhase | undefined {
    return this.captainPhases.get(roomId);
  }

  setCaptainPhaseTimerHandle(roomId: string, handle: ReturnType<typeof setTimeout>) {
    const phase = this.captainPhases.get(roomId);
    if (phase) phase.timerHandle = handle;
  }

  // ========================================
  // Bidding Logic
  // ========================================

  async placeBid(
    userId: string,
    roomId: string,
    amount: number,
  ): Promise<AuctionState> {
    const state = this.auctionStates.get(roomId);
    if (!state) {
      throw new BadRequestException("Auction not started");
    }

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException("Room not found");

    const bidIncrement = room.minBidIncrement || 50;
    const bidTimeLimit = room.bidTimeLimit || 30;

    // Get team
    const team = await this.prisma.team.findFirst({
      where: { roomId, captainId: userId },
    });

    if (!team) {
      throw new ForbiddenException("Only captains can bid");
    }

    // Timer expiration check — 서버 기준으로 타이머 만료 여부 확인
    if (Date.now() > state.timerEnd) {
      throw new BadRequestException("Bidding time has expired");
    }

    // Self-outbid prevention — 이미 최고가인 팀은 다시 입찰 불가
    if (state.currentHighestBidder === team.id) {
      throw new BadRequestException("You are already the highest bidder");
    }

    // Validate bid
    if (amount < state.currentHighestBid + bidIncrement) {
      throw new BadRequestException(
        `Bid must be at least ${state.currentHighestBid + bidIncrement}`,
      );
    }

    if (amount > team.remainingBudget) {
      throw new BadRequestException("Insufficient budget");
    }

    if (amount % bidIncrement !== 0) {
      throw new BadRequestException(`Bid must be multiple of ${bidIncrement}`);
    }

    // Get current player being auctioned
    const roomWithParticipants = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER", isCaptain: false, teamId: null },
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

    const currentPlayer =
      roomWithParticipants?.participants[state.currentPlayerIndex];
    if (!currentPlayer) {
      throw new BadRequestException("No player to bid on");
    }

    state.currentHighestBid = amount;
    state.currentHighestBidder = team.id;
    state.timerEnd = Date.now() + bidTimeLimit * 1000;
    state.yuchalCount = 0; // Reset yuchal count

    // Record bid
    await this.prisma.auctionBid.create({
      data: {
        roomId,
        teamId: team.id,
        targetUserId: currentPlayer.userId,
        amount,
      },
    });

    return state;
  }

  // ========================================
  // Auction Resolution
  // ========================================

  async resolveCurrentBid(roomId: string): Promise<{
    sold: boolean;
    player?: any;
    team?: any;
    price?: number;
  }> {
    const state = this.auctionStates.get(roomId);
    if (!state) {
      throw new BadRequestException("Auction not started");
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER", isCaptain: false, teamId: null },
          include: {
            user: {
              include: {
                riotAccounts: { where: { isPrimary: true } },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
        teams: {
          include: {
            captain: true,
          },
          orderBy: { remainingBudget: "desc" },
        },
      },
    });

    const currentPlayer = room?.participants[state.currentPlayerIndex];
    if (!currentPlayer) {
      throw new BadRequestException("No player to resolve");
    }

    // Check if there was a bid
    if (state.currentHighestBidder) {
      // Sold!
      const team = await this.prisma.team.findUnique({
        where: { id: state.currentHighestBidder },
      });

      if (!team) {
        throw new NotFoundException("Team not found");
      }

      const soldPrice = state.currentHighestBid;

      // Atomic update: deduct budget, assign player, update participant
      await this.prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id: team.id },
          data: {
            remainingBudget: team.remainingBudget - soldPrice,
          },
        });

        await tx.teamMember.create({
          data: {
            teamId: team.id,
            userId: currentPlayer.userId,
            soldPrice,
          },
        });

        await tx.roomParticipant.update({
          where: { id: currentPlayer.id },
          data: { teamId: team.id },
        });
      });

      const bidTimeLimitMs = (room?.bidTimeLimit || 30) * 1000;

      // Move to next player
      state.currentPlayerIndex++;
      state.currentHighestBid = 0;
      state.currentHighestBidder = null;
      state.timerEnd = Date.now() + bidTimeLimitMs;
      state.yuchalCount = 0;

      return {
        sold: true,
        player: currentPlayer,
        team,
        price: soldPrice,
      };
    } else {
      const bidTimeLimitMs = (room?.bidTimeLimit || 30) * 1000;

      // Yuchal (no sale)
      state.yuchalCount++;

      // If yuchal cycle complete, assign to team with most budget
      if (state.yuchalCount >= state.maxYuchalCycles) {
        const targetTeam = room!.teams[0]; // Sorted by remainingBudget desc

        await this.prisma.$transaction(async (tx) => {
          if (targetTeam.remainingBudget === 0 && !targetTeam.hasReceivedBonus) {
            await tx.team.update({
              where: { id: targetTeam.id },
              data: {
                remainingBudget: BONUS_GOLD,
                hasReceivedBonus: true,
              },
            });
          }

          await tx.teamMember.create({
            data: {
              teamId: targetTeam.id,
              userId: currentPlayer.userId,
              soldPrice: 0,
            },
          });

          await tx.roomParticipant.update({
            where: { id: currentPlayer.id },
            data: { teamId: targetTeam.id },
          });

          await tx.auctionBid.create({
            data: {
              roomId,
              teamId: targetTeam.id,
              targetUserId: currentPlayer.userId,
              amount: 0,
              isYuchal: true,
            },
          });
        });

        // Move to next player
        state.currentPlayerIndex++;
        state.currentHighestBid = 0;
        state.currentHighestBidder = null;
        state.timerEnd = Date.now() + bidTimeLimitMs;
        state.yuchalCount = 0;

        return {
          sold: true,
          player: currentPlayer,
          team: targetTeam,
          price: 0,
        };
      }

      // Continue auction for same player
      state.timerEnd = Date.now() + bidTimeLimitMs;

      return { sold: false };
    }
  }

  // ========================================
  // Auction Completion
  // ========================================

  async checkAuctionComplete(roomId: string): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { role: "PLAYER", teamId: null },
        },
      },
    });

    // All players assigned (except captains who are already assigned)
    const state = this.auctionStates.get(roomId);
    if (!state) return false;

    return room!.participants.length === 0;
  }

  async completeAuction(roomId: string) {
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

    this.auctionStates.delete(roomId);

    return { message: "Auction completed" };
  }

  // ========================================
  // Utility
  // ========================================

  getAuctionState(roomId: string): AuctionState | undefined {
    return this.auctionStates.get(roomId);
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
