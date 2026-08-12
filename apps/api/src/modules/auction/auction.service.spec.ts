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
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ remainingBudget: 1000 }),
        update: jest.fn(),
      },
      teamMember: {
        count: jest.fn(),
        create: jest.fn(),
      },
      roomParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: "p1", teamId: null }),
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

  describe("auction participant ordering", () => {
    it("uses MMR descending and joinedAt as the stable tie breaker", () => {
      const participants = [
        {
          userId: "gold-late",
          joinedAt: new Date("2026-01-02T00:00:00Z"),
          user: {
            riotAccounts: [{ tier: "GOLD", rank: "I", lp: 0 }],
          },
        },
        {
          userId: "diamond",
          joinedAt: new Date("2026-01-03T00:00:00Z"),
          user: {
            riotAccounts: [{ tier: "DIAMOND", rank: "IV", lp: 0 }],
          },
        },
        {
          userId: "gold-early",
          joinedAt: new Date("2026-01-01T00:00:00Z"),
          user: {
            riotAccounts: [{ tier: "GOLD", rank: "I", lp: 0 }],
          },
        },
      ];

      const sorted = (service as any)._sortAuctionParticipants(participants);

      expect(sorted.map((participant: any) => participant.userId)).toEqual([
        "diamond",
        "gold-early",
        "gold-late",
      ]);
      expect(participants[0].userId).toBe("gold-late");
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
      const now = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockReturnValue(now);

      const state: AuctionState = {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 500,
        currentHighestBidder: "other-team",
        timerEnd: now + 10000,
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
        return Promise.resolve({
          id: roomId,
          minBidIncrement: 100,
          bidTimeLimit: 30,
        });
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
      expect(result.timerEnd).toBe(now + 10000);
    });

    it("마감 임박 입찰이면 타이머를 연장한다", async () => {
      const now = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockReturnValue(now);

      const state: AuctionState = {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 500,
        currentHighestBidder: "other-team",
        timerEnd: now + 3000,
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
        return Promise.resolve({
          id: roomId,
          minBidIncrement: 100,
          bidTimeLimit: 30,
        });
      });

      prisma.team.findFirst.mockResolvedValue({
        id: teamId,
        remainingBudget: 1000,
        _count: { members: 0 },
        captain: { username: "Captain1" },
      });
      prisma.team.findUnique.mockResolvedValue({ remainingBudget: 1000 });
      prisma.teamMember.count.mockResolvedValue(0);

      const result = await service.placeBid(userId, roomId, 600);

      expect(result.timerEnd).toBe(now + 5000);
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
      const now = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockReturnValue(now);

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        bidTimeLimit: 30,
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
      expect(state.timerEnd).toBe(0);
    });

    it("다음 매물 시작 시 방 설정 시간으로 타이머를 재시작한다", async () => {
      const now = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockReturnValue(now);

      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 0,
        currentHighestBidder: null,
        timerEnd: 0,
        yuchalCount: 0,
        maxYuchalCycles: 2,
        bidIncrement: 100,
        botCaptainIds: [],
      });

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        bidTimeLimit: 30,
      });

      const state = await service.restartBidTimer(roomId);

      expect(state?.timerEnd).toBe(now + 30000);
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
        teams: [
          { id: "t1", remainingBudget: 1000, _count: { members: 2 } },
          { id: "t2", remainingBudget: 900, _count: { members: 2 } },
        ],
      });

      const result = await service.resolveCurrentBid(roomId);

      expect(result.sold).toBe(false);
      const state = (service as any).auctionStates.get(roomId);
      expect(state.yuchalCount).toBe(1);
    });

    it("여러 팀이 아직 입찰 가능하면 유찰 한도에 도달해도 0원 자동배정하지 않고 다음 선수로 넘긴다", async () => {
      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 0,
        currentHighestBidder: null,
        timerEnd: Date.now() + 10000,
        yuchalCount: 1,
        maxYuchalCycles: 2,
        bidIncrement: 100,
      });

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        minBidIncrement: 100,
        participants: [
          { id: "p1", userId: "user-p1" },
          { id: "p2", userId: "user-p2" },
        ],
        teams: [
          { id: "t1", remainingBudget: 1000, _count: { members: 2 } },
          { id: "t2", remainingBudget: 900, _count: { members: 2 } },
        ],
      });

      const result = await service.resolveCurrentBid(roomId);

      expect(result.sold).toBe(false);
      expect(result.player?.userId).toBe("user-p1");
      expect(result.yuchalCount).toBe(2);
      expect(prisma.teamMember.create).not.toHaveBeenCalled();
      expect(prisma.roomParticipant.update).not.toHaveBeenCalled();
      expect(prisma.auctionBid.create).not.toHaveBeenCalled();

      const state = (service as any).auctionStates.get(roomId);
      expect(state.currentPlayerIndex).toBe(1);
      expect(state.yuchalCount).toBe(0);
      expect(state.currentHighestBidder).toBeNull();
    });

    it("shows every player once before starting the next unsold cycle", async () => {
      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 0,
        currentHighestBidder: null,
        timerEnd: Date.now() + 10000,
        yuchalCount: 0,
        maxYuchalCycles: 2,
        bidIncrement: 100,
        deferredPlayerIds: [],
        yuchalCountsByPlayer: {},
      });

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        minBidIncrement: 100,
        participants: [
          { id: "p1", userId: "user-p1" },
          { id: "p2", userId: "user-p2" },
          { id: "p3", userId: "user-p3" },
        ],
        teams: [
          { id: "t1", remainingBudget: 1000, _count: { members: 2 } },
          { id: "t2", remainingBudget: 900, _count: { members: 2 } },
        ],
      });

      const seenPlayers: string[] = [];
      for (let index = 0; index < 4; index += 1) {
        const result = await service.resolveCurrentBid(roomId);
        seenPlayers.push(result.player?.userId);
      }

      expect(seenPlayers).toEqual(["user-p1", "user-p2", "user-p3", "user-p1"]);
      const state = (service as any).auctionStates.get(roomId);
      expect(state.yuchalCountsByPlayer).toEqual({ p1: 2, p2: 1, p3: 1 });
      expect(state.currentPlayerIndex).toBe(1);
    });

    it("keeps earlier unsold players deferred when a later player is sold", async () => {
      (service as any).auctionStates.set(roomId, {
        roomId,
        currentPlayerIndex: 0,
        currentHighestBid: 0,
        currentHighestBidder: null,
        timerEnd: Date.now() + 10000,
        yuchalCount: 0,
        maxYuchalCycles: 2,
        bidIncrement: 100,
        deferredPlayerIds: [],
        yuchalCountsByPlayer: {},
      });

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        minBidIncrement: 100,
        participants: [
          { id: "p1", userId: "user-p1" },
          { id: "p2", userId: "user-p2" },
          { id: "p3", userId: "user-p3" },
        ],
        teams: [
          { id: "t1", remainingBudget: 1000, _count: { members: 2 } },
          { id: "t2", remainingBudget: 900, _count: { members: 2 } },
        ],
      });

      const firstResult = await service.resolveCurrentBid(roomId);
      expect(firstResult.player?.userId).toBe("user-p1");

      const state = (service as any).auctionStates.get(roomId);
      state.currentHighestBid = 500;
      state.currentHighestBidder = "t1";
      prisma.team.findUnique.mockResolvedValue({
        id: "t1",
        remainingBudget: 1000,
      });

      const soldResult = await service.resolveCurrentBid(roomId);

      expect(soldResult.player?.userId).toBe("user-p2");
      expect(state.deferredPlayerIds).toEqual(["p1"]);
      expect(state.currentPlayerIndex).toBe(1);
    });
  });
});
