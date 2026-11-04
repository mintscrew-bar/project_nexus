import { UserService } from "./user.service";

/**
 * 경매 매물 카드가 쓰는 호버 프로필의 내전 평균 지표.
 * 킬관여율은 2026-11-02 매물 카드 여덟 번째 칸으로 추가했다.
 */
describe("UserService.getHoverProfile — 내전 평균 지표", () => {
  const build = (killParticipationAvg: number | null) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          username: "철수",
          avatar: null,
          profileBanner: null,
          riotAccounts: [],
          pubgAccounts: [],
          clanMemberships: [],
          streamerProfiles: [],
          streamerLinks: [],
        }),
      },
      matchParticipant: {
        aggregate: jest.fn().mockResolvedValue({
          _avg: {
            kills: 5,
            deaths: 4,
            assists: 7,
            totalDamageDealtToChampions: 18000,
            totalMinionsKilled: 150,
            neutralMinionsKilled: 10,
            visionScore: 22.4,
            goldEarned: 11000,
            killParticipation: killParticipationAvg,
          },
          _count: { id: 6 },
        }),
      },
    };
    const reputation = {
      getUserReputationStats: jest
        .fn()
        .mockResolvedValue({ overallAverage: 0, totalRatings: 0 }),
    };
    const service = new UserService(
      prisma as any,
      {} as any,
      {} as any,
      reputation as any,
      {} as any,
      { readCached: jest.fn().mockReturnValue(null) } as any,
    );
    jest
      .spyOn(service, "getUserStats")
      .mockResolvedValue({ wins: 4, losses: 2, winRate: 66.7 } as any);
    return { service, prisma };
  };

  it("킬관여율을 퍼센트 정수로 내려준다", async () => {
    const { service, prisma } = build(0.5634);

    const profile = await service.getHoverProfile("user-1");

    expect(profile.kda?.killParticipation).toBe(56);
    expect(
      prisma.matchParticipant.aggregate.mock.calls[0][0]._avg,
    ).toMatchObject({ killParticipation: true });
  });

  it("킬관여 값이 있는 판이 없으면 0 이 아니라 null 이다", async () => {
    const { service } = build(null);

    const profile = await service.getHoverProfile("user-1");

    expect(profile.kda?.killParticipation).toBeNull();
  });

  it("방이 정리돼 팀이 지워진 판도 평균 지표에 넣는다(teamId 가 아니라 내전 여부로 거른다)", async () => {
    const { service, prisma } = build(0.5);

    await service.getHoverProfile("user-1");

    const where = prisma.matchParticipant.aggregate.mock.calls[0][0].where;
    expect(where.teamId).toBeUndefined();
    expect(where.match).toMatchObject({ isInternal: true });
  });
});

describe("UserService.getUserStats — 내전 승패", () => {
  const match = (over: Record<string, unknown>) => ({
    status: "COMPLETED",
    roomId: null,
    roomIdSnapshot: "room-1",
    // 방이 지워진 상태 — 살아 있는 팀 ID 는 없고 스냅샷만 남는다
    winnerId: null,
    teamAId: null,
    teamBId: null,
    winnerIdSnapshot: "team-a",
    teamAIdSnapshot: "team-a",
    teamBIdSnapshot: "team-b",
    ...over,
  });

  it("방이 지워져도 로스터 스냅샷으로 승패를 센다", async () => {
    const prisma = {
      matchRosterSnapshot: {
        findMany: jest.fn().mockResolvedValue([
          { teamSlot: "A", match: match({}) },
          { teamSlot: "B", match: match({}) },
          // 결과 미입력·진행 중 경기는 승패에 넣지 않는다
          { teamSlot: "A", match: match({ winnerIdSnapshot: null }) },
          {
            teamSlot: "A",
            match: match({ status: "IN_PROGRESS", roomIdSnapshot: "room-2" }),
          },
        ]),
      },
    };
    const service = new UserService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const stats = await service.getUserStats("user-1");

    expect(stats).toMatchObject({ wins: 1, losses: 1, gamesPlayed: 2 });
    // 같은 방의 여러 판은 참여 한 번
    expect(stats.participations).toBe(2);
    expect(
      prisma.matchRosterSnapshot.findMany.mock.calls[0][0].where.match,
    ).toMatchObject({ isInternal: true });
  });
});
