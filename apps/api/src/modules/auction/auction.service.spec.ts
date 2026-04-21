import { Test, TestingModule } from "@nestjs/testing";
import { AuctionService, AuctionState } from "./auction.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";

describe("AuctionService", () => {
  let service: AuctionService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    prisma = {
      room: {
        findUnique: jest.fn(),
      },
      team: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      teamMember: {
        count: jest.fn(),
        create: jest.fn(),
      },
      roomParticipant: {
        update: jest.fn(),
      },
      auctionBid: {
        create: jest.fn(),
      },
      // $transaction: 콜백에 prisma 자신을 tx로 넘겨 단위 테스트에서 트랜잭션 동작 시뮬레이션
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<AuctionService>(AuctionService);
  });

  describe("placeBid", () => {
    const roomId = "room-1";
    const userId = "user-1";
    const teamId = "team-1";

    it("경매가 시작되지 않았으면 BadRequestException을 던진다", async () => {
      await expect(service.placeBid(userId, roomId, 100)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("방을 찾을 수 없으면 NotFoundException을 던진다", async () => {
      // 강제로 private auctionStates에 상태 주입 (테스트용)
      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 0,
        currentHighestBidder: null,
        timerEnd: Date.now() + 10000,
        bidIncrement: 100,
      });

      prisma.room.findUnique.mockResolvedValue(null);

      await expect(service.placeBid(userId, roomId, 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("주장이 아니면 ForbiddenException을 던진다", async () => {
      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 0,
        currentHighestBidder: null,
        timerEnd: Date.now() + 10000,
        bidIncrement: 100,
      });

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        minBidIncrement: 100,
      });
      prisma.team.findFirst.mockResolvedValue(null);

      await expect(service.placeBid(userId, roomId, 100)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("예산이 부족하면 BadRequestException을 던진다", async () => {
      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 500,
        currentHighestBidder: "other-team",
        timerEnd: Date.now() + 10000,
        bidIncrement: 100,
      });

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        minBidIncrement: 100,
      });
      prisma.team.findFirst.mockResolvedValue({
        id: teamId,
        remainingBudget: 600,
        _count: { members: 0 },
      });

      // amount 700 > 600 budget
      await expect(service.placeBid(userId, roomId, 700)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("입찰이 성공하면 DB에 기록하고 상태를 업데이트한다", async () => {
      const state: AuctionState = {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 500,
        currentHighestBidder: "other-team",
        timerEnd: Date.now() + 10000,
        yuchalCount: 0,
        maxYuchalCycles: 1,
        bidIncrement: 100,
        botCaptainIds: [],
      };
      (service as any).auctionStates.set(roomId, state);

      prisma.room.findUnique.mockImplementation(({ include }: any) => {
        if (include?.participants) {
          return Promise.resolve({
            id: roomId,
            participants: [
              { id: "p1", userId: "user-p1", user: { username: "Player1" } },
            ],
          });
        }
        return Promise.resolve({ id: roomId, minBidIncrement: 100 });
      });

      prisma.team.findFirst.mockResolvedValue({
        id: teamId,
        remainingBudget: 1000,
        _count: { members: 0 },
        captain: { username: "Captain1" },
      });
      // 트랜잭션 내 예산 재확인 쿼리 목
      prisma.team.findUnique.mockResolvedValue({ remainingBudget: 1000 });
      prisma.teamMember.count.mockResolvedValue(0);

      const bidAmount = 600;
      const result = await service.placeBid(userId, roomId, bidAmount);

      expect(prisma.auctionBid.create).toHaveBeenCalled();
      expect(result.currentHighestBid).toBe(bidAmount);
      expect(result.currentHighestBidder).toBe(teamId);
    });
  });

  describe("resolveCurrentBid", () => {
    const roomId = "room-1";

    beforeEach(() => {
      // Setup default auction state
      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 500,
        currentHighestBidder: "team-winner",
        timerEnd: Date.now() + 10000,
        yuchalCount: 0,
        maxYuchalCycles: 2,
        bidIncrement: 100,
      });
    });

    it("낙찰자가 있으면 DB에 기록하고 상태를 초기화한다 (Sold)", async () => {
      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        participants: [{ id: "p1", userId: "user-p1" }],
        teams: [],
      });
      prisma.team.findUnique.mockResolvedValue({
        id: "team-winner",
        remainingBudget: 1000,
      });
      prisma.$transaction = jest.fn((cb) => cb(prisma));
      prisma.team.update = jest.fn();
      prisma.teamMember.create = jest.fn();
      prisma.roomParticipant.update = jest.fn();

      const result = await service.resolveCurrentBid(roomId);

      expect(result.sold).toBe(true);
      expect(prisma.teamMember.create).toHaveBeenCalled();

      const state = (service as any).auctionStates.get(roomId);
      expect(state.currentHighestBid).toBe(0);
      expect(state.currentHighestBidder).toBeNull();
    });

    it("입찰자가 없으면 유찰 카운트를 올리고 재경매한다 (Yuchal - Re-auction)", async () => {
      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 0,
        currentHighestBidder: null,
        timerEnd: Date.now() + 10000,
        yuchalCount: 0,
        maxYuchalCycles: 2,
        bidIncrement: 100,
      });

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        minBidIncrement: 100,
        participants: [{ id: "p1", userId: "user-p1" }],
        teams: [{ id: "t1", remainingBudget: 1000, _count: { members: 0 } }],
      });

      const result = await service.resolveCurrentBid(roomId);

      expect(result.sold).toBe(false);
      const state = (service as any).auctionStates.get(roomId);
      expect(state.yuchalCount).toBe(1);
    });
  });
});
