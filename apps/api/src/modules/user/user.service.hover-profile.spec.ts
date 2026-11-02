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
});
