import { AdminService } from "./admin.service";

/**
 * 관리자 화면의 게임 구분.
 *
 * 롤·배그는 방도 클랜도 완전히 다른 집단이라 섞어 보면 운영 판단이 틀린다.
 * 다만 **모든 지표를 나눌 수 있는 건 아니다.** 유저·신고는 게임과 무관하고,
 * `Match` 에는 게임 컬럼이 아예 없다(방이 지워지면 스냅샷만 남는데 거기에도
 * 없다). 그래서 "무엇이 좁혀졌는가" 를 응답이 스스로 밝혀야 화면이 합계를
 * 오해하지 않는다.
 */
function makeService(overrides: Record<string, any> = {}) {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(0) },
    room: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    match: { count: jest.fn().mockResolvedValue(0) },
    userReport: { count: jest.fn().mockResolvedValue(0) },
    postReport: { count: jest.fn().mockResolvedValue(0) },
    clan: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    scrim: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  const service = new AdminService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma };
}

describe("AdminService 게임 구분", () => {
  it("클랜 목록을 게임으로 좁힌다", async () => {
    const { service, prisma } = makeService();
    await service.getClans({ page: 1, limit: 20, gameTitle: "PUBG" as any });

    expect(prisma.clan.findMany.mock.calls[0][0].where).toEqual({
      gameTitle: "PUBG",
    });
  });

  it("게임을 안 주면 클랜 전체를 본다 — 관리자는 둘 다 봐야 할 때가 있다", async () => {
    const { service, prisma } = makeService();
    await service.getClans({ page: 1, limit: 20 });

    expect(prisma.clan.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("검색과 게임 필터를 함께 건다 — 한쪽이 다른 쪽을 덮으면 안 된다", async () => {
    const { service, prisma } = makeService();
    await service.getClans({
      page: 1,
      limit: 20,
      search: "넥서스",
      gameTitle: "LOL" as any,
    });

    expect(prisma.clan.findMany.mock.calls[0][0].where).toEqual({
      name: { contains: "넥서스", mode: "insensitive" },
      gameTitle: "LOL",
    });
  });

  it("방 목록도 상태와 게임을 함께 건다", async () => {
    const { service, prisma } = makeService();
    await service.getRooms({
      page: 1,
      limit: 20,
      status: "WAITING",
      gameTitle: "PUBG" as any,
    });

    expect(prisma.room.findMany.mock.calls[0][0].where).toEqual({
      status: "WAITING",
      gameTitle: "PUBG",
    });
  });

  describe("대시보드 통계", () => {
    it("나눌 수 있는 지표만 게임으로 좁힌다", async () => {
      const { service, prisma } = makeService();
      await service.getStats({ gameTitle: "PUBG" as any });

      // 방·클랜은 게임 컬럼이 있다
      expect(prisma.room.count).toHaveBeenCalledWith({
        where: { gameTitle: "PUBG" },
      });
      expect(prisma.clan.count).toHaveBeenCalledWith({
        where: { gameTitle: "PUBG" },
      });
      // 유저·신고·매치는 게임을 가릴 수 없으므로 전체를 센다
      expect(prisma.match.count).toHaveBeenCalledWith();
    });

    it("좁혀진 지표가 무엇인지 응답이 밝힌다", async () => {
      const { service } = makeService();
      const stats = await service.getStats({ gameTitle: "LOL" as any });

      expect(stats.gameTitle).toBe("LOL");
      expect(stats.scopedByGame).toEqual([
        "totalRooms",
        "activeRooms",
        "totalClans",
      ]);
    });

    it("게임을 안 주면 필터가 붙지 않는다", async () => {
      const { service, prisma } = makeService();
      const stats = await service.getStats();

      expect(prisma.room.count).toHaveBeenCalledWith({ where: {} });
      expect(stats.gameTitle).toBeNull();
    });
  });

  describe("스크림 목록 (배그)", () => {
    it("방 이름으로 찾는다 — 운영자가 아는 건 스크림 id 가 아니다", async () => {
      const { service, prisma } = makeService();
      await service.getScrims({ page: 1, limit: 20, search: "금요일" });

      expect(prisma.scrim.findMany.mock.calls[0][0].where).toEqual({
        room: { name: { contains: "금요일", mode: "insensitive" } },
      });
    });

    it("완료된 라운드 수를 세어 붙인다", async () => {
      const { service } = makeService({
        scrim: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([
            {
              id: "s1",
              rounds: [
                { id: "r1", roundNumber: 1, status: "COMPLETED" },
                { id: "r2", roundNumber: 2, status: "COMPLETED" },
                { id: "r3", roundNumber: 3, status: "PENDING" },
              ],
            },
          ]),
        },
      });

      const result = await service.getScrims({ page: 1, limit: 20 });

      expect(result.scrims[0].completedRounds).toBe(2);
    });
  });
});
