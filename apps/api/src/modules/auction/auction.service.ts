import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, TeamMode } from "@nexus/database";

// Tier-based gold allocation
const TIER_GOLD: Record<string, number> = {
  IRON: 3000,
  BRONZE: 2900,
  SILVER: 2800,
  GOLD: 2600,
  PLATINUM: 2400,
  EMERALD: 2200,
  DIAMOND: 2000,
  MASTER: 2000,
  GRANDMASTER: 2000,
  CHALLENGER: 2000,
  UNRANKED: 2500,
};

const BID_INCREMENT = 100;
const SOFT_TIMER_SECONDS = 5;
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

@Injectable()
export class AuctionService {
  private auctionStates = new Map<string, AuctionState>();

  constructor(private readonly prisma: PrismaService) {}

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

    // Select captains (random or by highest tier)
    const sortedPlayers = room.participants.sort((a, b) => {
      const aTier = a.user.riotAccounts[0]?.tier || "UNRANKED";
      const bTier = b.user.riotAccounts[0]?.tier || "UNRANKED";
      return (TIER_GOLD[bTier] || 0) - (TIER_GOLD[aTier] || 0);
    });

    const captains = sortedPlayers.slice(0, numTeams);
    const players = sortedPlayers.slice(numTeams);

    // Create teams with tier-based budgets
    const teams = await Promise.all(
      captains.map(async (captain, index) => {
        const tier = captain.user.riotAccounts[0]?.tier || "UNRANKED";
        const initialBudget = TIER_GOLD[tier] || 2500;

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

    // Update room status
    await this.prisma.room.update({
      where: { id: roomId },
      data: { status: RoomStatus.TEAM_SELECTION },
    });

    // Mark captains as captains in participants
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

    // Initialize auction state
    const auctionState: AuctionState = {
      roomId,
      currentPlayerIndex: 0,
      currentHighestBid: 0,
      currentHighestBidder: null,
      timerEnd: Date.now() + 30000, // 30 seconds initial
      yuchalCount: 0,
      maxYuchalCycles: numTeams,
    };

    this.auctionStates.set(roomId, auctionState);

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
      auctionState,
    };
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

    // Get team
    const team = await this.prisma.team.findFirst({
      where: { roomId, captainId: userId },
    });

    if (!team) {
      throw new ForbiddenException("Only captains can bid");
    }

    // Validate bid
    if (amount < state.currentHighestBid + BID_INCREMENT) {
      throw new BadRequestException(
        `Bid must be at least ${state.currentHighestBid + BID_INCREMENT}`,
      );
    }

    if (amount > team.remainingBudget) {
      throw new BadRequestException("Insufficient budget");
    }

    if (amount % BID_INCREMENT !== 0) {
      throw new BadRequestException(`Bid must be multiple of ${BID_INCREMENT}`);
    }

    // Get current player being auctioned
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
      },
    });

    const currentPlayer = room?.participants[state.currentPlayerIndex];
    if (!currentPlayer) {
      throw new BadRequestException("No player to bid on");
    }

    // Update state with soft timer reset
    state.currentHighestBid = amount;
    state.currentHighestBidder = team.id;
    state.timerEnd = Date.now() + SOFT_TIMER_SECONDS * 1000;
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

      // Deduct budget
      await this.prisma.team.update({
        where: { id: team.id },
        data: {
          remainingBudget: team.remainingBudget - state.currentHighestBid,
        },
      });

      // Assign player to team
      await this.prisma.teamMember.create({
        data: {
          teamId: team.id,
          userId: currentPlayer.userId,
          soldPrice: state.currentHighestBid,
        },
      });

      await this.prisma.roomParticipant.update({
        where: { id: currentPlayer.id },
        data: { teamId: team.id },
      });

      // Move to next player
      state.currentPlayerIndex++;
      state.currentHighestBid = 0;
      state.currentHighestBidder = null;
      state.timerEnd = Date.now() + 30000;
      state.yuchalCount = 0;

      return {
        sold: true,
        player: currentPlayer,
        team,
        price: state.currentHighestBid,
      };
    } else {
      // Yuchal (no sale)
      state.yuchalCount++;

      // If yuchal cycle complete, assign to team with most budget
      if (state.yuchalCount >= state.maxYuchalCycles) {
        const targetTeam = room!.teams[0]; // Sorted by remainingBudget desc

        // Check if team has any budget
        if (targetTeam.remainingBudget === 0 && !targetTeam.hasReceivedBonus) {
          // Give bonus gold
          await this.prisma.team.update({
            where: { id: targetTeam.id },
            data: {
              remainingBudget: BONUS_GOLD,
              hasReceivedBonus: true,
            },
          });
        }

        // Assign player for free
        await this.prisma.teamMember.create({
          data: {
            teamId: targetTeam.id,
            userId: currentPlayer.userId,
            soldPrice: 0,
          },
        });

        await this.prisma.roomParticipant.update({
          where: { id: currentPlayer.id },
          data: { teamId: targetTeam.id },
        });

        // Record yuchal
        await this.prisma.auctionBid.create({
          data: {
            roomId,
            teamId: targetTeam.id,
            targetUserId: currentPlayer.userId,
            amount: 0,
            isYuchal: true,
          },
        });

        // Move to next player
        state.currentPlayerIndex++;
        state.currentHighestBid = 0;
        state.currentHighestBidder = null;
        state.timerEnd = Date.now() + 30000;
        state.yuchalCount = 0;

        return {
          sold: true,
          player: currentPlayer,
          team: targetTeam,
          price: 0,
        };
      }

      // Continue auction for same player
      state.timerEnd = Date.now() + 30000;

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
      data: { status: RoomStatus.IN_PROGRESS },
    });

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
