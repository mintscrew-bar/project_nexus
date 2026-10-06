import { AdminService } from "./admin.service";

function make() {
  const prisma: any = {
    adminAuditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const service = new AdminService(
    prisma,
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

describe("AdminService.getAuditLogs", () => {
  it("필터가 없으면 전체를 최신순으로 읽는다", async () => {
    const { service, prisma } = make();
    await service.getAuditLogs({ page: 1, limit: 50 });

    const arg = prisma.adminAuditLog.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({});
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.include.admin.select).toEqual({ id: true, username: true });
  });

  it("작업·관리자·대상 종류로 좁힌다", async () => {
    const { service, prisma } = make();
    await service.getAuditLogs({
      page: 1,
      limit: 50,
      action: "USER_BAN" as any,
      adminId: "a1",
      targetType: "user",
    });

    expect(prisma.adminAuditLog.findMany.mock.calls[0][0].where).toEqual({
      action: "USER_BAN",
      adminId: "a1",
      targetType: "user",
    });
  });

  it("기간은 from·to 를 각각 따로 걸 수 있다", async () => {
    const { service, prisma } = make();
    await service.getAuditLogs({
      page: 1,
      limit: 50,
      from: "2026-10-01T00:00:00Z",
    });
    expect(
      prisma.adminAuditLog.findMany.mock.calls[0][0].where.createdAt,
    ).toEqual({ gte: new Date("2026-10-01T00:00:00Z") });

    await service.getAuditLogs({
      page: 1,
      limit: 50,
      to: "2026-10-02T00:00:00Z",
    });
    expect(
      prisma.adminAuditLog.findMany.mock.calls[1][0].where.createdAt,
    ).toEqual({ lte: new Date("2026-10-02T00:00:00Z") });
  });

  it("페이지 번호로 건너뛴다", async () => {
    const { service, prisma } = make();
    await service.getAuditLogs({ page: 3, limit: 20 });
    const arg = prisma.adminAuditLog.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(40);
    expect(arg.take).toBe(20);
  });
});

describe("AdminService.exportDataset", () => {
  function makeExport() {
    const prisma: any = {
      adminDailyStat: { findMany: jest.fn().mockResolvedValue([]) },
      roomOutcome: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AdminService(
      prisma,
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

  it("일별 지표는 범위를 골라 머리글과 함께 내보낸다", async () => {
    const { service, prisma } = makeExport();
    prisma.adminDailyStat.findMany.mockResolvedValue([
      {
        date: new Date("2026-10-05T00:00:00Z"),
        scope: "ALL",
        totalUsers: 10,
        newUsers: 1,
        active1d: null,
        active7d: 3,
        active30d: 5,
        roomsEnded: null,
        roomsStarted: null,
        records: 2,
      },
    ]);
    const file = await service.exportDataset("daily-stats", {});

    expect(prisma.adminDailyStat.findMany.mock.calls[0][0].where.scope).toBe(
      "ALL",
    );
    expect(file.filename).toMatch(/^daily-stats-all-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.csv).toContain("2026-10-05,ALL,10,1,,3,5,,,2");
  });

  it("방 기록에는 유저 식별 정보가 없다", async () => {
    const { service } = makeExport();
    const file = await service.exportDataset("room-outcomes", {});
    expect(file.csv).not.toMatch(/userId|username|hostId/);
  });

  it("모르는 데이터셋은 404", async () => {
    const { service } = makeExport();
    await expect(service.exportDataset("users", {})).rejects.toThrow(
      "내보낼 수 없는",
    );
  });
});
