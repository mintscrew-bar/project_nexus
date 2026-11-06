import { BroadcastService } from "./broadcast.service";

/** 결과 화면 기록 요약·선수 배지 */
describe("BroadcastService 결과 요약·선수 배지", () => {
  const make = (prisma: any) =>
    new BroadcastService(prisma, {} as any, {} as any, {} as any) as any;

  it("수집된 판이면 진영별 합계와 MVP·ACE 를 담는다", async () => {
    const p = (userId: string, team: string, kills: number, gold: number) => ({
      userId,
      puuid: `puuid-${userId}`,
      riotTeamId: team === "blue-team" ? 100 : 200,
      teamIdSnapshot: team,
      championName: "Ahri",
      kills,
      deaths: 1,
      assists: 2,
      goldEarned: gold,
      totalDamageDealtToChampions: 10000,
      totalMinionsKilled: 150,
      neutralMinionsKilled: 10,
      position: userId === "a" ? "MID" : "TOP",
      user: { username: userId },
      riotIdSnapshot: null,
    });
    const service = make({
      match: {
        findUnique: jest.fn().mockResolvedValue({
          dataCollected: true,
          riotMatchId: "KR_1",
          gameDuration: 1500,
          mvpUserId: "a",
          aceUserId: "c",
          participants: [
            p("a", "blue-team", 10, 12000),
            p("b", "blue-team", 2, 9000),
            p("c", "red-team", 5, 10000),
          ],
          teamStats: [
            {
              teamIdSnapshot: "blue-team",
              towerKills: 9,
              dragonKills: 3,
              baronKills: 1,
              riftHeraldKills: 1,
            },
          ],
        }),
      },
    });

    const result = await service.riotResult("m1", "blue-team", "red-team");

    expect(result.blue).toMatchObject({
      kills: 12,
      gold: 21000,
      towers: 9,
      dragons: 3,
      riotTeamId: 100,
    });
    expect(result.red).toMatchObject({
      kills: 5,
      gold: 10000,
      towers: 0,
      riotTeamId: 200,
    });
    expect(result.mvp).toMatchObject({ userId: "a", kills: 10 });
    expect(result.ace).toMatchObject({ userId: "c" });
    expect(result.riotMatchId).toBe("KR_1");
    // 스코어보드 — 라인 순서(탑 먼저), CS 는 미니언+정글
    expect(result.blue.players.map((p: any) => p.userId)).toEqual(["b", "a"]);
    expect(result.blue.players[0]).toMatchObject({ cs: 160, gold: 9000 });
  });

  it("수집되지 않은 판은 null", async () => {
    const service = make({
      match: {
        findUnique: jest.fn().mockResolvedValue({
          dataCollected: false,
          participants: [],
          teamStats: [],
        }),
      },
    });
    expect(await service.riotResult("m1", "a", "b")).toBeNull();
  });

  it("선수 배지 — 랭킹 순위·점수와 칭찬 수·대표 태그", async () => {
    const service = make({
      nexusRanking: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { userId: "a", globalRank: 2, score: 61.5, totalGames: 8 },
          ]),
      },
      userCommendation: {
        findMany: jest.fn().mockResolvedValue([
          { targetUserId: "a", tags: ["MANNER"] },
          { targetUserId: "a", tags: ["MANNER", "CARRY"] },
        ]),
      },
    });
    const badges = await service.playerBadges(["a", "b", null, "a"]);
    expect(badges.a).toEqual({
      rank: 2,
      score: 61.5,
      commendations: 2,
      topTag: "MANNER",
    });
    expect(badges.b).toEqual({
      rank: null,
      score: null,
      commendations: 0,
      topTag: null,
    });
  });
});
