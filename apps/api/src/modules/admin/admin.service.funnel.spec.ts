import { AdminService } from "./admin.service";

function makeService(rows: any[], first: Date | null = null) {
  const prisma: any = {
    roomOutcome: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest.fn().mockResolvedValue(first ? { endedAt: first } : null),
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

const row = () => ({
  createdAt: new Date("2026-10-01T00:00:00Z"),
  startedAt: null,
  maxParticipants: 10,
  participantCount: 1,
  humanCount: 1,
  hadResult: false,
  hostIsBot: false,
});

describe("AdminService.getRoomFunnel", () => {
  it("게임과 기간으로 좁혀 읽는다", async () => {
    const { service, prisma } = makeService([]);
    await service.getRoomFunnel({ gameTitle: "PUBG" as any, days: 7 });

    const where = prisma.roomOutcome.findMany.mock.calls[0][0].where;
    expect(where.gameTitle).toBe("PUBG");
    const days = (Date.now() - where.endedAt.gte.getTime()) / 86_400_000;
    expect(days).toBeCloseTo(7, 1);
  });

  it("기간은 1~90일로 보정한다", async () => {
    const { service } = makeService([]);
    expect((await service.getRoomFunnel({ days: 999 })).days).toBe(90);
    expect((await service.getRoomFunnel({ days: 0 })).days).toBe(1);
    expect((await service.getRoomFunnel({})).days).toBe(30);
  });

  it("기록이 아직 기간을 못 채웠음을 첫 기록 시각으로 알린다", async () => {
    const first = new Date("2026-10-05T00:00:00Z");
    const { service } = makeService([row()], first);
    const res = await service.getRoomFunnel({ days: 30 });

    expect(res.firstRecordAt).toEqual(first);
    expect(res.created).toBe(1);
  });

  it("행이 상한을 넘으면 잘렸다고 알리고 상한까지만 센다", async () => {
    const rows = Array.from({ length: 5001 }, row);
    const { service } = makeService(rows);
    const res = await service.getRoomFunnel({});

    expect(res.truncated).toBe(true);
    expect(res.created).toBe(5000);
  });
});
