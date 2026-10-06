import { AdminService } from "./admin.service";

function make() {
  const prisma: any = {
    room: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    match: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const roomService: any = {
    deleteRoomData: jest.fn().mockResolvedValue(undefined),
  };
  // 생성자 순서: prisma, discordBot, adminAlerts, discordVoice, roomService, ...
  const service = new AdminService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    roomService,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, prisma, roomService };
}

describe("봇 정리", () => {
  it("미리보기는 지우지 않고 건수만 센다", async () => {
    const { service, prisma } = make();
    prisma.room.count.mockResolvedValue(4);
    prisma.match.count.mockResolvedValue(9);

    await expect(service.getBotCleanupPreview()).resolves.toEqual({
      rooms: 4,
      matches: 9,
    });
    expect(prisma.match.deleteMany).not.toHaveBeenCalled();
  });

  it("봇만 한 내전의 조건: 스냅샷이 있고 전부 봇 유저다 — 모르면 지우지 않는다", async () => {
    const { service, prisma } = make();
    await service.getBotCleanupPreview();

    const where = prisma.match.count.mock.calls[0][0].where;
    expect(where.isInternal).toBe(true);
    // 하나도 없는 경우를 막는 some, 사람이 섞인 경우를 막는 every
    expect(where.rosterSnapshots.some).toEqual({});
    expect(where.rosterSnapshots.every.user.is).toBeDefined();
  });

  it("고른 것만 지운다: 방만 고르면 기록은 건드리지 않는다", async () => {
    const { service, prisma, roomService } = make();
    prisma.room.findMany.mockResolvedValue([{ id: "r1" }, { id: "r2" }]);

    const res = await service.cleanupBotData(
      { rooms: true, matches: false },
      "admin-1",
    );

    expect(roomService.deleteRoomData).toHaveBeenCalledTimes(2);
    expect(prisma.match.findMany).not.toHaveBeenCalled();
    expect(res.roomsDeleted).toBe(2);
    expect(res.matchesDeleted).toBe(0);
  });

  it("기록만 고르면 방은 건드리지 않고, 찾은 id 만 지운다", async () => {
    const { service, prisma, roomService } = make();
    prisma.match.findMany.mockResolvedValue([{ id: "m1" }, { id: "m2" }]);
    prisma.match.deleteMany.mockResolvedValue({ count: 2 });

    const res = await service.cleanupBotData(
      { rooms: false, matches: true },
      "admin-1",
    );

    expect(roomService.deleteRoomData).not.toHaveBeenCalled();
    expect(prisma.match.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["m1", "m2"] } },
    });
    expect(res.matchesDeleted).toBe(2);
  });

  it("한 번에 처리하는 양에 상한이 있고, 남은 건수를 알려 준다", async () => {
    const { service, prisma } = make();
    prisma.room.findMany.mockResolvedValue([]);
    prisma.room.count.mockResolvedValue(350);

    const res = await service.cleanupBotData(
      { rooms: true, matches: false },
      "a",
    );

    expect(prisma.room.findMany.mock.calls[0][0].take).toBe(200);
    expect(res.remaining.rooms).toBe(350);
  });

  it("실행하면 감사 로그를 남긴다", async () => {
    const { service, prisma } = make();
    await service.cleanupBotData({ rooms: true, matches: true }, "admin-1");

    expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
      adminId: "admin-1",
      action: "BOT_CLEANUP",
      details: { roomsDeleted: 0, matchesDeleted: 0 },
    });
  });
});
