import { Test, TestingModule } from "@nestjs/testing";
import { MatchSeriesService } from "./match-series.service";
import { PrismaService } from "../prisma/prisma.service";

describe("MatchSeriesService", () => {
  let service: MatchSeriesService;
  let prisma: {
    match: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    matchSeries: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      match: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: "next-game" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      matchSeries: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchSeriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MatchSeriesService>(MatchSeriesService);
  });

  /** 시리즈 + 그 안의 게임들을 mock에 세팅한다. */
  const setup = (
    bestOf: number,
    games: { gameNumber: number; winnerId: string | null }[],
    justPlayedWinnerId: string,
    blueSideTeamId = "team-a",
  ) => {
    prisma.match.findUnique.mockResolvedValue({
      id: "match-current",
      seriesId: "series-1",
      winnerId: justPlayedWinnerId,
      blueSideTeamId,
    });
    prisma.matchSeries.findUnique.mockResolvedValue({
      id: "series-1",
      roomId: "room-1",
      round: 2,
      matchNumber: 3,
      bracketRound: null,
      bracketType: "SINGLE_ELIMINATION",
      teamAId: "team-a",
      teamBId: "team-b",
      bestOf,
      status: "IN_PROGRESS",
    });
    prisma.match.findMany.mockResolvedValue(
      games.map((g) => ({
        id: `game-${g.gameNumber}`,
        gameNumber: g.gameNumber,
        status: "COMPLETED",
        winnerId: g.winnerId,
      })),
    );
  };

  describe("applyGameResult - 단판 (Bo1)", () => {
    it("첫 게임에서 바로 시리즈가 끝난다", async () => {
      setup(1, [{ gameNumber: 1, winnerId: "team-a" }], "team-a");

      const progress = await service.applyGameResult("match-current");

      expect(progress).toMatchObject({
        clinched: true,
        seriesWinnerId: "team-a",
        teamAWins: 1,
        teamBWins: 0,
        nextMatchId: null,
      });
      // 다음 세트를 만들지 않는다.
      expect(prisma.match.create).not.toHaveBeenCalled();
    });
  });

  describe("applyGameResult - 3판 2선 (Bo3)", () => {
    it("1-0에서는 진출시키지 않고 2세트를 만든다", async () => {
      setup(3, [{ gameNumber: 1, winnerId: "team-a" }], "team-a");

      const progress = await service.applyGameResult("match-current");

      expect(progress).toMatchObject({
        clinched: false,
        seriesWinnerId: null,
        teamAWins: 1,
        teamBWins: 0,
        nextMatchId: "next-game",
        nextGameNumber: 2,
      });
      expect(prisma.match.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            seriesId: "series-1",
            gameNumber: 2,
            // 슬롯 정보는 시리즈에서 미러링한다.
            round: 2,
            matchNumber: 3,
            teamAId: "team-a",
            teamBId: "team-b",
            blueSideTeamId: "team-b",
            status: "PENDING",
          }),
        }),
      );
    });

    it("다음 세트는 직전 세트와 블루·레드 진영을 자동 교대한다", async () => {
      setup(3, [{ gameNumber: 1, winnerId: "team-a" }], "team-a");

      const progress = await service.applyGameResult("match-current");

      expect(progress?.nextBlueSideTeamId).toBe("team-b");
      expect(prisma.match.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ blueSideTeamId: "team-b" }),
        }),
      );
    });

    it("2-0이면 클린치하고 3세트를 만들지 않는다", async () => {
      setup(
        3,
        [
          { gameNumber: 1, winnerId: "team-a" },
          { gameNumber: 2, winnerId: "team-a" },
        ],
        "team-a",
      );

      const progress = await service.applyGameResult("match-current");

      expect(progress).toMatchObject({
        clinched: true,
        seriesWinnerId: "team-a",
        teamAWins: 2,
        teamBWins: 0,
        nextMatchId: null,
      });
      expect(prisma.match.create).not.toHaveBeenCalled();
      expect(prisma.matchSeries.update).toHaveBeenCalledWith({
        where: { id: "series-1" },
        data: { status: "COMPLETED", winnerId: "team-a" },
      });
    });

    it("1-1이면 3세트를 만든다", async () => {
      setup(
        3,
        [
          { gameNumber: 1, winnerId: "team-a" },
          { gameNumber: 2, winnerId: "team-b" },
        ],
        "team-b",
      );

      const progress = await service.applyGameResult("match-current");

      expect(progress).toMatchObject({
        clinched: false,
        teamAWins: 1,
        teamBWins: 1,
        nextGameNumber: 3,
        nextBlueSideTeamId: "team-b",
      });
    });

    it("직전 블루가 team-b이면 다음 세트 블루는 team-a다", async () => {
      setup(3, [{ gameNumber: 1, winnerId: "team-a" }], "team-a", "team-b");

      const progress = await service.applyGameResult("match-current");

      expect(progress?.nextBlueSideTeamId).toBe("team-a");
    });
  });

  describe("applyGameResult - 5판 3선 (Bo5)", () => {
    it("2-1에서는 아직 안 끝난다", async () => {
      setup(
        5,
        [
          { gameNumber: 1, winnerId: "team-a" },
          { gameNumber: 2, winnerId: "team-b" },
          { gameNumber: 3, winnerId: "team-a" },
        ],
        "team-a",
      );

      const progress = await service.applyGameResult("match-current");

      expect(progress).toMatchObject({
        clinched: false,
        teamAWins: 2,
        teamBWins: 1,
        nextGameNumber: 4,
      });
    });

    it("3승을 채우면 끝난다", async () => {
      setup(
        5,
        [
          { gameNumber: 1, winnerId: "team-b" },
          { gameNumber: 2, winnerId: "team-a" },
          { gameNumber: 3, winnerId: "team-b" },
          { gameNumber: 4, winnerId: "team-b" },
        ],
        "team-b",
      );

      const progress = await service.applyGameResult("match-current");

      expect(progress).toMatchObject({
        clinched: true,
        seriesWinnerId: "team-b",
        teamAWins: 1,
        teamBWins: 3,
      });
    });
  });

  describe("applyGameResult - 시리즈 없는 매치", () => {
    it("외부 인제스트/레거시 매치는 null을 반환한다", async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: "match-x",
        seriesId: null,
        winnerId: "team-a",
      });

      expect(await service.applyGameResult("match-x")).toBeNull();
      expect(prisma.match.create).not.toHaveBeenCalled();
    });
  });

  describe("markInProgress", () => {
    it("PENDING 시리즈만 진행 중으로 올린다", async () => {
      prisma.match.findUnique.mockResolvedValue({ seriesId: "series-1" });

      expect(await service.markInProgress("match-1")).toBe("series-1");
      // where에 status: PENDING을 걸어 이미 IN_PROGRESS거나 COMPLETED인
      // 시리즈는 건드리지 않는다.
      expect(prisma.matchSeries.updateMany).toHaveBeenCalledWith({
        where: { id: "series-1", status: "PENDING" },
        data: { status: "IN_PROGRESS" },
      });
    });

    it("시리즈 없는 매치는 null이고 아무것도 쓰지 않는다", async () => {
      prisma.match.findUnique.mockResolvedValue({ seriesId: null });

      expect(await service.markInProgress("match-x")).toBeNull();
      expect(prisma.matchSeries.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("assignTeam", () => {
    it("시리즈와 아직 시작 전인 세트에 함께 반영한다", async () => {
      await service.assignTeam("series-1", true, "team-a");

      expect(prisma.matchSeries.update).toHaveBeenCalledWith({
        where: { id: "series-1" },
        data: { teamAId: "team-a" },
      });
      expect(prisma.match.updateMany).toHaveBeenCalledWith({
        where: { seriesId: "series-1", status: "PENDING" },
        data: { teamAId: "team-a" },
      });
    });
  });

  describe("getRoomSeriesScores", () => {
    it("시리즈별 승수와 선취 승수를 계산한다", async () => {
      prisma.matchSeries.findMany.mockResolvedValue([
        {
          id: "series-1",
          teamAId: "team-a",
          teamBId: "team-b",
          bestOf: 3,
          status: "IN_PROGRESS",
          winnerId: null,
          matches: [
            { gameNumber: 1, winnerId: "team-a", status: "COMPLETED" },
            { gameNumber: 2, winnerId: "team-b", status: "COMPLETED" },
            { gameNumber: 3, winnerId: null, status: "PENDING" },
          ],
        },
      ]);

      const [score] = await service.getRoomSeriesScores("room-1");

      expect(score).toMatchObject({
        seriesId: "series-1",
        bestOf: 3,
        teamAWins: 1,
        teamBWins: 1,
        winsNeeded: 2,
        currentGameNumber: 3,
      });
    });
  });
});
