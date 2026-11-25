import { RankingService } from "./ranking.service";
import {
  NO_TEST_BOT_MATCH_WHERE,
  TEST_BOT_USER_WHERE,
} from "../common/test-bot.util";

describe("RankingService", () => {
  let service: RankingService;
  let prisma: any;
  let balanceScores: any;

  beforeEach(() => {
    prisma = {
      // 기본은 "봇 아님". 봇 제외 테스트에서만 유저를 돌려준다.
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      matchParticipant: {
        findMany: jest.fn(),
        // 리더보드 지표(KDA·챔피언) — 기본은 수집된 경기 없음
        groupBy: jest.fn().mockResolvedValue([]),
      },
      match: {
        groupBy: jest.fn().mockResolvedValue([]),
        // 재계산 때 기록 기반 MVP·ACE 를 맞출 수집된 경기 — 기본은 없음
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      userCommendation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      matchRosterSnapshot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      nexusRanking: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      clanMember: {
        findMany: jest.fn(),
      },
      clanRanking: {
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      nexusRoleRecord: {
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
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
            // 봇을 채워 시험한 판은 사람 쪽 전적에서도 뺀다
            match: {
              isInternal: true,
              status: "COMPLETED",
              ...NO_TEST_BOT_MATCH_WHERE,
            },
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

  it("테스트 봇은 랭킹·라인기록·밸런스 점수 어디에도 쌓지 않는다", async () => {
    // 내전 테스트에 참여한 봇이 리더보드를 차지하던 문제의 회귀 방지.
    prisma.user.findFirst.mockResolvedValue({ id: "bot-1" });

    await service.updateRanking("bot-1");

    expect(prisma.matchRosterSnapshot.findMany).not.toHaveBeenCalled();
    expect(prisma.nexusRanking.upsert).not.toHaveBeenCalled();
    expect(prisma.nexusRoleRecord.upsert).not.toHaveBeenCalled();
    expect(balanceScores.refreshUser).not.toHaveBeenCalled();
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
        // 재계산 대상 모으기
        .mockResolvedValueOnce([{ userId: "stale-user" }])
        // 점수 재계산(refreshRatingScores) 이 점수를 쓸 행 읽기
        .mockResolvedValueOnce([])
        // 순위 번호 매기기
        .mockResolvedValueOnce([]);
      prisma.nexusRanking.upsert.mockResolvedValue({});
      prisma.nexusRanking.updateMany.mockResolvedValue({ count: 0 });
      prisma.clanMember.findMany.mockResolvedValue([]);

      const result = await service.recalculateAllRankings();

      expect(result).toEqual({ processed: 2, purgedBotRows: 0 });
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

    it("재계산 전에 봇이 남긴 랭킹·라인기록·클랜랭킹 행을 먼저 지운다", async () => {
      // 봇 차단 이전에 쌓인 행은 updateRanking 이 건너뛰므로 스스로 사라지지 않는다.
      prisma.nexusRanking.deleteMany.mockResolvedValue({ count: 19 });
      prisma.nexusRoleRecord.deleteMany.mockResolvedValue({ count: 30 });
      prisma.clanRanking.deleteMany.mockResolvedValue({ count: 2 });
      prisma.matchParticipant.findMany.mockResolvedValue([]);
      prisma.nexusRanking.findMany.mockResolvedValue([]);
      prisma.nexusRanking.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.recalculateAllRankings();

      expect(result).toEqual({ processed: 0, purgedBotRows: 51 });
      for (const model of ["nexusRanking", "nexusRoleRecord", "clanRanking"]) {
        expect(prisma[model].deleteMany).toHaveBeenCalledWith({
          where: { user: expect.objectContaining({ OR: expect.any(Array) }) },
        });
      }
      // 지운 뒤에 기존 랭킹 사용자를 읽어야 봇이 재계산 대상에 다시 안 들어간다.
      expect(
        prisma.nexusRanking.deleteMany.mock.invocationCallOrder[0],
      ).toBeLessThan(prisma.nexusRanking.findMany.mock.invocationCallOrder[0]);
    });
  });

  describe("getGlobalRanking 검색", () => {
    it("닉네임·소환사명으로 거르고, 순위는 전체 랭킹 기준으로 센다", async () => {
      prisma.nexusRanking.findMany.mockResolvedValue([
        { id: "r1", userId: "u1", totalGames: 3, winRate: 66.7, score: 56.3 },
      ]);
      prisma.nexusRanking.count = jest
        .fn()
        .mockResolvedValueOnce(1) // 검색 결과 총수
        .mockResolvedValueOnce(4); // 이 사람보다 위에 있는 인원

      const result = await service.getGlobalRanking(1, 50, " 철수 ");

      const where = prisma.nexusRanking.findMany.mock.calls[0][0].where;
      expect(where.user.OR[0].username).toEqual({
        contains: "철수",
        mode: "insensitive",
      });
      expect(where.user.OR[1].riotAccounts.some.gameName.contains).toBe("철수");
      expect(result.rankings[0].globalRank).toBe(5);
    });

    it("재계산 전에 남은 봇 행도 목록·순위 계산에서 뺀다", async () => {
      prisma.nexusRanking.findMany.mockResolvedValue([
        { id: "r1", userId: "u1", totalGames: 3, winRate: 66.7, score: 56.3 },
      ]);
      prisma.nexusRanking.count = jest.fn().mockResolvedValue(1);

      await service.getGlobalRanking(1, 50, "철수");

      const where = prisma.nexusRanking.findMany.mock.calls[0][0].where;
      expect(where.user.NOT).toEqual(TEST_BOT_USER_WHERE);
      // "나보다 위" 인원 수에서도 봇은 빠져야 순위 번호가 맞는다
      const aboveWhere = prisma.nexusRanking.count.mock.calls[1][0].where;
      expect(aboveWhere.user).toEqual({ NOT: TEST_BOT_USER_WHERE });
    });
  });

  describe("getGlobalRanking 점수·라인·지표", () => {
    it("종합은 보정 승률 점수 → 판수 순으로 줄 세운다", async () => {
      prisma.nexusRanking.findMany.mockResolvedValue([]);
      prisma.nexusRanking.count = jest.fn().mockResolvedValue(0);

      await service.getGlobalRanking(1, 50);

      expect(prisma.nexusRanking.findMany.mock.calls[0][0].orderBy).toEqual([
        { score: "desc" },
        { totalGames: "desc" },
      ]);
    });

    it("role 을 주면 라인 기록 테이블에서 그 라인만 읽고, 나보다 위 인원도 그 라인에서 센다", async () => {
      prisma.nexusRoleRecord.findMany.mockResolvedValue([
        { id: "rr1", userId: "u1", role: "MID", totalGames: 4, score: 61.1 },
      ]);
      prisma.nexusRoleRecord.count = jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);

      const result = await service.getGlobalRanking(1, 50, "철수", "MID");

      expect(prisma.nexusRoleRecord.findMany.mock.calls[0][0].where.role).toBe(
        "MID",
      );
      const aboveWhere = prisma.nexusRoleRecord.count.mock.calls[1][0].where;
      expect(aboveWhere.role).toBe("MID");
      expect(aboveWhere.OR).toEqual([
        { score: { gt: 61.1 } },
        { score: 61.1, totalGames: { gt: 4 } },
      ]);
      expect(result.rankings[0].globalRank).toBe(3);
      // KDA·챔피언도 그 라인 포지션으로 뛴 경기만 센다
      expect(
        prisma.matchParticipant.groupBy.mock.calls[0][0].where.position,
      ).toBe("MID");
    });

    it("KDA·MVP·칭찬·주력 챔피언을 행에 붙인다", async () => {
      prisma.nexusRanking.findMany.mockResolvedValue([
        { id: "r1", userId: "u1", totalGames: 3, score: 56.3 },
      ]);
      prisma.nexusRanking.count = jest.fn().mockResolvedValue(1);
      prisma.matchParticipant.groupBy
        .mockResolvedValueOnce([
          {
            userId: "u1",
            _sum: { kills: 12, deaths: 4, assists: 8 },
            _count: { _all: 2 },
          },
        ])
        .mockResolvedValueOnce([
          { userId: "u1", championName: "Ahri", _count: { _all: 1 } },
          { userId: "u1", championName: "Zed", _count: { _all: 2 } },
        ]);
      prisma.match.groupBy.mockResolvedValue([
        { mvpUserId: "u1", _count: { _all: 1 } },
      ]);
      prisma.userCommendation.findMany.mockResolvedValue([
        { targetUserId: "u1", tags: ["MANNER", "CARRY"] },
        { targetUserId: "u1", tags: ["MANNER"] },
      ]);

      const result = await service.getGlobalRanking(1, 50);

      expect(result.rankings[0].stats).toEqual({
        statGames: 2,
        avgKills: 6,
        avgDeaths: 2,
        avgAssists: 4,
        kda: 5,
        mvpCount: 1,
        commendations: {
          total: 2,
          topTags: [
            { tag: "MANNER", count: 2 },
            { tag: "CARRY", count: 1 },
          ],
        },
        topChampions: ["Zed", "Ahri"],
      });
    });
  });

  describe("랭킹 점수 재계산 (refreshRatingScores)", () => {
    it("모든 내전을 다시 돌려 이긴 쪽은 50 위, 진 쪽은 50 아래로 저장하고 순위를 매긴다", async () => {
      const roster = (userId: string, teamSlot: string) => ({
        userId,
        teamSlot,
        assignedRole: null,
      });
      prisma.match.findMany.mockResolvedValue([
        {
          id: "m1",
          completedAt: new Date("2026-11-01T00:00:00Z"),
          createdAt: new Date("2026-11-01T00:00:00Z"),
          winnerId: "tA",
          winnerIdSnapshot: null,
          teamAId: "tA",
          teamBId: "tB",
          teamAIdSnapshot: null,
          teamBIdSnapshot: null,
          mvpUserId: null,
          aceUserId: null,
          rosterSnapshots: [roster("win", "A"), roster("lose", "B")],
          participants: [],
          commendations: [],
        },
      ]);
      prisma.nexusRanking.findMany
        .mockResolvedValueOnce([
          { id: "r-win", userId: "win", score: 50 },
          { id: "r-lose", userId: "lose", score: 50 },
        ])
        .mockResolvedValueOnce([
          { id: "r-win", score: 55, totalGames: 1, globalRank: null },
          { id: "r-lose", score: 45, totalGames: 1, globalRank: null },
        ]);

      await service.refreshRatingScores();

      const written = Object.fromEntries(
        prisma.nexusRanking.update.mock.calls
          .filter((c: any) => c[0].data.score !== undefined)
          .map((c: any) => [c[0].where.id, c[0].data.score]),
      );
      expect(written["r-win"]).toBeGreaterThan(50);
      expect(written["r-lose"]).toBeLessThan(50);
      expect(prisma.nexusRanking.update).toHaveBeenCalledWith({
        where: { id: "r-win" },
        data: { globalRank: 1 },
      });
    });

    it("점수·판수가 같으면 공동 순위를 준다", async () => {
      prisma.nexusRanking.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: "x", score: 60, totalGames: 3, globalRank: null },
          { id: "y", score: 60, totalGames: 3, globalRank: null },
          { id: "z", score: 55, totalGames: 3, globalRank: null },
        ]);

      await service.refreshRatingScores();

      const ranks = Object.fromEntries(
        prisma.nexusRanking.update.mock.calls.map((c: any) => [
          c[0].where.id,
          c[0].data.globalRank,
        ]),
      );
      expect(ranks).toEqual({ x: 1, y: 1, z: 3 });
    });
  });
});
