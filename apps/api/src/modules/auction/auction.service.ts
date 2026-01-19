import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

export enum AuctionStatus {
  WAITING = "WAITING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

@Injectable()
export class AuctionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService
  ) {}

  async create(data: {
    name: string;
    hostId: string;
    maxTeams: number;
    teamBudget: number;
    minBid: number;
  }) {
    return this.prisma.auction.create({
      data: {
        name: data.name,
        hostId: data.hostId,
        maxTeams: data.maxTeams,
        teamBudget: data.teamBudget,
        minBid: data.minBid,
        status: AuctionStatus.WAITING,
      },
    });
  }

  async findById(id: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id },
      include: {
        host: true,
        teams: {
          include: {
            captain: true,
            members: {
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
          },
        },
        participants: {
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
      },
    });

    if (!auction) {
      throw new NotFoundException("Auction not found");
    }

    return auction;
  }

  async join(auctionId: string, userId: string) {
    const auction = await this.findById(auctionId);

    if (auction.status !== AuctionStatus.WAITING) {
      throw new BadRequestException("Cannot join auction in progress");
    }

    const existingParticipant = await this.prisma.auctionParticipant.findFirst({
      where: { auctionId, userId },
    });

    if (existingParticipant) {
      throw new BadRequestException("Already joined this auction");
    }

    return this.prisma.auctionParticipant.create({
      data: {
        auctionId,
        userId,
      },
    });
  }

  async startAuction(auctionId: string, hostId: string) {
    const auction = await this.findById(auctionId);

    if (auction.hostId !== hostId) {
      throw new BadRequestException("Only host can start the auction");
    }

    if (auction.status !== AuctionStatus.WAITING) {
      throw new BadRequestException("Auction already started");
    }

    return this.prisma.auction.update({
      where: { id: auctionId },
      data: {
        status: AuctionStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });
  }

  async placeBid(data: {
    auctionId: string;
    participantId: string;
    teamId: string;
    amount: number;
    bidderId: string;
  }) {
    const auction = await this.findById(data.auctionId);

    if (auction.status !== AuctionStatus.IN_PROGRESS) {
      throw new BadRequestException("Auction is not in progress");
    }

    const team = auction.teams.find((t) => t.id === data.teamId);
    if (!team) {
      throw new BadRequestException("Team not found");
    }

    if (team.captainId !== data.bidderId) {
      throw new BadRequestException("Only team captain can place bids");
    }

    // Get current highest bid from Redis
    const currentBidKey = `auction:${data.auctionId}:participant:${data.participantId}:bid`;
    const currentBidStr = await this.redis.get(currentBidKey);
    const currentBid = currentBidStr ? parseInt(currentBidStr) : 0;

    if (data.amount <= currentBid) {
      throw new BadRequestException("Bid must be higher than current bid");
    }

    if (data.amount < auction.minBid) {
      throw new BadRequestException(`Minimum bid is ${auction.minBid}`);
    }

    // Check team budget
    const teamSpent = team.members.reduce((sum, m) => sum + (m.soldPrice || 0), 0);
    if (teamSpent + data.amount > auction.teamBudget) {
      throw new BadRequestException("Exceeds team budget");
    }

    // Store bid in Redis
    await this.redis.set(currentBidKey, data.amount.toString(), 300); // 5 min TTL
    await this.redis.set(
      `auction:${data.auctionId}:participant:${data.participantId}:bidder`,
      data.teamId,
      300
    );

    return {
      participantId: data.participantId,
      teamId: data.teamId,
      amount: data.amount,
    };
  }

  async completeBid(auctionId: string, participantId: string) {
    const bidderTeamId = await this.redis.get(
      `auction:${auctionId}:participant:${participantId}:bidder`
    );
    const bidAmount = await this.redis.get(
      `auction:${auctionId}:participant:${participantId}:bid`
    );

    if (!bidderTeamId || !bidAmount) {
      throw new BadRequestException("No winning bid found");
    }

    // Update participant with team assignment
    return this.prisma.auctionParticipant.update({
      where: { id: participantId },
      data: {
        teamId: bidderTeamId,
        soldPrice: parseInt(bidAmount),
      },
    });
  }
}
