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
