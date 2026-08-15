import { RankingService } from "./ranking.service";

describe("RankingService", () => {
  let service: RankingService;
  let prisma: any;
  let balanceScores: any;

  beforeEach(() => {
    prisma = {
      matchParticipant: {
        findMany: jest.fn(),
      },
      matchRosterSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
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
      nexusRoleRecord: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    // 전적이 바뀌면 밸런스 점수 캐시도 갱신한다. 여기서는 호출 여부만 보면 된다.
    balanceScores = { refreshUser: jest.fn().mockResolvedValue(undefined) };
    service = new RankingService(prisma, balanceScores as any);
  });

  describe("updateRanking", () => {
    it("Riot 수집 없이 로스터 스냅샷과 경기 결과만으로 승패를 센다", async () => {
      // 수동 사설방은 match_participants 가 0건이다. 그래도 방장이 입력한
      // 승패는 랭킹에 반영돼야 한다.
      prisma.matchRosterSnapshot.findMany.mockResolvedValue([
        {
          teamSlot: "A",
          match: {
            completedAt: new Date("2026-05-01T00:00:00.000Z"),
            winnerId: null,
            winnerIdSnapshot: "team-a",
            teamAId: null,
            teamBId: null,
            teamAIdSnapshot: "team-a",
            teamBIdSnapshot: "team-b",
          },
        },
        {
          teamSlot: "B",
          match: {
            completedAt: new Date("2026-04-30T00:00:00.000Z"),
            winnerId: null,
            winnerIdSnapshot: "team-a",
            teamAId: null,
            teamBId: null,
            teamAIdSnapshot: "team-a",
            teamBIdSnapshot: "team-b",
          },
        },
      ]);
      prisma.nexusRanking.upsert.mockResolvedValue({});
      prisma.clanMember.findMany.mockResolvedValue([]);

      await service.updateRanking("user-1");

      // Riot 수집 결과는 더 이상 승패 근거가 아니다.
      expect(prisma.matchParticipant.findMany).not.toHaveBeenCalled();
      expect(prisma.matchRosterSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user-1",
            match: { isInternal: true, status: "COMPLETED" },
          },
        }),
      );
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

  describe("승패 판정", () => {
    const snapshot = (teamSlot: string, winnerIdSnapshot: string | null) => ({
      teamSlot,
      match: {
        completedAt: new Date("2026-05-01T00:00:00.000Z"),
        winnerId: null,
        winnerIdSnapshot,
        teamAId: null,
        teamBId: null,
        teamAIdSnapshot: "team-a",
        teamBIdSnapshot: "team-b",
      },
    });

    beforeEach(() => {
      prisma.nexusRanking.upsert.mockResolvedValue({});
      prisma.clanMember.findMany.mockResolvedValue([]);
    });

    it("결과가 입력되지 않은 경기는 집계에서 제외한다", async () => {
      prisma.matchRosterSnapshot.findMany.mockResolvedValue([
        snapshot("A", "team-a"),
        snapshot("A", null),
      ]);

      await service.updateRanking("user-1");

      expect(prisma.nexusRanking.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            totalGames: 1,
            wins: 1,
            losses: 0,
          }),
        }),
      );
    });

    it("진 팀 슬롯이면 패배로 센다", async () => {
      prisma.matchRosterSnapshot.findMany.mockResolvedValue([
        snapshot("B", "team-a"),
      ]);

      await service.updateRanking("user-1");

      expect(prisma.nexusRanking.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            totalGames: 1,
            wins: 0,
            losses: 1,
            winRate: 0,
          }),
        }),
      );
    });
  });

  describe("라인별 전적", () => {
    const roster = (
      teamSlot: string,
      assignedRole: string | null,
      winnerIdSnapshot: string | null = "team-a",
    ) => ({
      teamSlot,
      assignedRole,
      match: {
        completedAt: new Date("2026-05-01T00:00:00.000Z"),
        winnerId: null,
        winnerIdSnapshot,
        teamAId: null,
        teamBId: null,
        teamAIdSnapshot: "team-a",
        teamBIdSnapshot: "team-b",
      },
    });

    beforeEach(() => {
      prisma.nexusRanking.upsert.mockResolvedValue({});
      prisma.clanMember.findMany.mockResolvedValue([]);
    });

    it("배정 라인별로 승패를 나눠 저장한다", async () => {
      prisma.matchRosterSnapshot.findMany.mockResolvedValue([
        roster("A", "MID"), // 승
        roster("B", "MID"), // 패
        roster("A", "JUNGLE"), // 승
      ]);

      await service.updateRanking("user-1");

      const upserts = prisma.nexusRoleRecord.upsert.mock.calls.map(
        (call: any[]) => call[0],
      );
      const mid = upserts.find((u: any) => u.create.role === "MID");
      const jungle = upserts.find((u: any) => u.create.role === "JUNGLE");

      expect(mid.create).toMatchObject({
        totalGames: 2,
        wins: 1,
        losses: 1,
        winRate: 50,
      });
      expect(jungle.create).toMatchObject({
        totalGames: 1,
        wins: 1,
        losses: 0,
        winRate: 100,
      });
    });

    it("라인 정보가 없는 경기는 라인별 집계에서 뺀다", async () => {
      // 역할 선택을 거치지 않은 방(자유 팀 선택 등)
      prisma.matchRosterSnapshot.findMany.mockResolvedValue([
        roster("A", null),
        roster("A", "TOP"),
      ]);

      await service.updateRanking("user-1");

      const upserts = prisma.nexusRoleRecord.upsert.mock.calls;
      expect(upserts).toHaveLength(1);
      expect(upserts[0][0].create).toMatchObject({
        role: "TOP",
        totalGames: 1,
      });

      // 전체 전적에는 두 경기가 모두 반영된다
      expect(prisma.nexusRanking.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ totalGames: 2 }),
        }),
      );
    });

    it("더 이상 집계되지 않는 라인 기록은 지운다", async () => {
      prisma.matchRosterSnapshot.findMany.mockResolvedValue([
        roster("A", "ADC"),
      ]);

      await service.updateRanking("user-1");

      expect(prisma.nexusRoleRecord.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", role: { notIn: ["ADC"] } },
      });
    });
  });

  it("전적 갱신 후 밸런스 점수 캐시도 다시 계산한다", async () => {
    // 점수는 미리 계산해 저장하므로, 내전 전적이 바뀌면 무효화해야 한다.
    prisma.matchRosterSnapshot.findMany.mockResolvedValue([]);
    prisma.nexusRanking.upsert.mockResolvedValue({});
    prisma.clanMember.findMany.mockResolvedValue([]);

    await service.updateRanking("user-1");

    expect(balanceScores.refreshUser).toHaveBeenCalledWith("user-1");
    expect(prisma.nexusRanking.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      balanceScores.refreshUser.mock.invocationCallOrder[0],
    );
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
