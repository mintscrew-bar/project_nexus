import { PubgRankingService } from "./pubg-ranking.service";

/**
 * 배그 랭킹 검색.
 * 집계 자체는 pubg-ranking.util.spec 이 본다. 여기서는 검색해도 순위 번호가
 * 전체 기준으로 남는지, 검색 결과로만 페이지를 나누는지를 본다.
 */
describe("PubgRankingService 검색", () => {
  // 스크림 하나에 세 팀 — a(30점) > b(20점) > c(10점), 팀마다 한 명
  const scrims = [
    {
      id: "s1",
      room: {
        teams: [
          { id: "ta", members: [{ userId: "ua" }] },
          { id: "tb", members: [{ userId: "ub" }] },
          { id: "tc", members: [{ userId: "uc" }] },
        ],
      },
      rounds: [
        {
          results: [
            { teamId: "ta", points: 30, kills: 3, deaths: 0 },
            { teamId: "tb", points: 20, kills: 2, deaths: 0 },
            { teamId: "tc", points: 10, kills: 1, deaths: 0 },
          ],
        },
      ],
    },
  ];
  const users = [
    { id: "ua", username: "알파", avatar: null, pubgAccounts: [] },
    { id: "ub", username: "브라보", avatar: null, pubgAccounts: [] },
    { id: "uc", username: "찰리", avatar: null, pubgAccounts: [] },
  ];

  const build = (matchedIds: string[]) => {
    const prisma = {
      scrim: { findMany: jest.fn().mockResolvedValue(scrims) },
      user: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          // 검색 조회(OR 가 있는 쪽)는 일치한 id 만, 이름 조회는 요청한 id 전부
          if (where.OR) {
            return Promise.resolve(matchedIds.map((id) => ({ id })));
          }
          return Promise.resolve(
            users.filter((user) => where.id.in.includes(user.id)),
          );
        }),
      },
    };
    return { service: new PubgRankingService(prisma as any), prisma };
  };

  it("검색 결과도 순위 번호는 전체 랭킹 기준이다", async () => {
    const { service } = build(["uc"]);
    const result = await service.getRanking(1, 50, "찰리");

    expect(result.total).toBe(1);
    expect(result.rankings).toHaveLength(1);
    expect(result.rankings[0].userId).toBe("uc");
    // 검색 결과 안에서 1등이 아니라 전체 3위
    expect(result.rankings[0].rank).toBe(3);
    expect(result.rankings[0].user?.username).toBe("찰리");
  });

  it("검색어는 랭킹에 오른 사람 안에서만 닉네임·배그 닉네임으로 찾는다", async () => {
    const { service, prisma } = build([]);
    const result = await service.getRanking(1, 50, " 없음 ");

    expect(result.total).toBe(0);
    const searchCall = prisma.user.findMany.mock.calls[0][0];
    expect(searchCall.where.id.in.sort()).toEqual(["ua", "ub", "uc"]);
    expect(searchCall.where.OR).toEqual([
      { username: { contains: "없음", mode: "insensitive" } },
      {
        pubgAccounts: {
          some: { playerName: { contains: "없음", mode: "insensitive" } },
        },
      },
    ]);
  });

  it("검색어가 없으면 전체를 순서대로 매긴다", async () => {
    const { service } = build([]);
    const result = await service.getRanking(1, 2);

    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.rankings.map((row) => [row.userId, row.rank])).toEqual([
      ["ua", 1],
      ["ub", 2],
    ]);
  });
});
