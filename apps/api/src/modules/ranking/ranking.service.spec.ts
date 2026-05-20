import { RankingService } from "./ranking.service";

describe("RankingService", () => {
  let service: RankingService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      matchParticipant: {
        findMany: jest.fn(),
      },
      nexusRanking: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      clanMember: {
        findMany: jest.fn(),
      },
      clanRanking: {
        upsert: jest.fn(),
      },
    };

    service = new RankingService(prisma);
  });

  describe("updateRanking", () => {
    it("외부 Riot 인제스트 매치를 제외하고 Nexus 내전만 랭킹에 반영한다", async () => {
      prisma.matchParticipant.findMany.mockResolvedValue([
        { win: true, createdAt: new Date("2026-05-01T00:00:00.000Z") },
        { win: false, createdAt: new Date("2026-04-30T00:00:00.000Z") },
      ]);
      prisma.nexusRanking.upsert.mockResolvedValue({});
      prisma.clanMember.findMany.mockResolvedValue([]);

      await service.updateRanking("user-1");

      expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          match: {
            roomId: { not: null },
          },
        },
        select: { win: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      expect(prisma.nexusRanking.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            totalGames: 2,
            wins: 1,
            losses: 1,
            winRate: 50,
          }),
          update: expect.objectContaining({
            totalGames: 2,
            wins: 1,
            losses: 1,
            winRate: 50,
          }),
        }),
      );
    });
  });

  describe("recalculateAllRankings", () => {
    it("기존 오염된 랭킹 사용자도 재계산 대상에 포함해 0게임으로 정정한다", async () => {
      prisma.matchParticipant.findMany
        .mockResolvedValueOnce([{ userId: "custom-user" }])
        .mockResolvedValueOnce([
          { win: true, createdAt: new Date("2026-05-01T00:00:00.000Z") },
        ])
        .mockResolvedValueOnce([]);
      prisma.nexusRanking.findMany
        .mockResolvedValueOnce([{ userId: "stale-user" }])
        .mockResolvedValueOnce([]);
      prisma.nexusRanking.upsert.mockResolvedValue({});
      prisma.nexusRanking.updateMany.mockResolvedValue({ count: 0 });
      prisma.clanMember.findMany.mockResolvedValue([]);

      const result = await service.recalculateAllRankings();

      expect(result).toEqual({ processed: 2 });
      expect(prisma.nexusRanking.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "stale-user" },
          create: expect.objectContaining({
            userId: "stale-user",
            totalGames: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
          }),
          update: expect.objectContaining({
            totalGames: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
          }),
        }),
      );
    });
  });
});
