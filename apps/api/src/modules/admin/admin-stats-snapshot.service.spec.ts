import { AdminStatsSnapshotService } from "./admin-stats-snapshot.service";

function make(opts: { firstOutcomeAt?: Date | null; existing?: number } = {}) {
  const prisma: any = {
    user: { count: jest.fn().mockResolvedValue(5) },
    roomOutcome: {
      count: jest.fn().mockResolvedValue(2),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.firstOutcomeAt ? { endedAt: opts.firstOutcomeAt } : null,
        ),
    },
    match: { count: jest.fn().mockResolvedValue(3) },
    scrim: { count: jest.fn().mockResolvedValue(1) },
    adminDailyStat: {
      count: jest.fn().mockResolvedValue(opts.existing ?? 0),
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const redis: any = {
    acquireLock: jest.fn().mockResolvedValue("tok"),
    releaseLock: jest.fn().mockResolvedValue(undefined),
  };
  return {
    service: new AdminStatsSnapshotService(prisma, redis),
    prisma,
    redis,
  };
}

const DAY = new Date("2026-10-05T00:00:00Z");
const rowOf = (prisma: any, scope: string) =>
  prisma.adminDailyStat.upsert.mock.calls
    .map((c: any[]) => c[0])
    .find((arg: any) => arg.where.date_scope.scope === scope);

describe("AdminStatsSnapshotService.captureDay", () => {
  it("범위 세 줄(ALL·LOL·PUBG)을 같은 날짜로 기록한다", async () => {
    const { service, prisma } = make({
      firstOutcomeAt: new Date("2026-09-01"),
    });
    await service.captureDay(DAY, { live: true });

    const scopes = prisma.adminDailyStat.upsert.mock.calls.map(
      (c: any[]) => c[0].where.date_scope.scope,
    );
    expect(scopes.sort()).toEqual(["ALL", "LOL", "PUBG"]);
    expect(rowOf(prisma, "ALL").where.date_scope.date).toEqual(DAY);
  });

  it("live 면 활성 유저를 세고, 아니면(백필) 활성 칼럼을 건드리지 않는다", async () => {
    const live = make({ firstOutcomeAt: new Date("2026-09-01") });
    await live.service.captureDay(DAY, { live: true });
    expect(rowOf(live.prisma, "ALL").create.active7d).toBe(5);

    const back = make({ firstOutcomeAt: new Date("2026-09-01") });
    await back.service.captureDay(DAY, { live: false });
    const all = rowOf(back.prisma, "ALL");
    expect(all.update.active1d).toBeUndefined();
    expect(all.create.active30d).toBeUndefined();
  });

  it("게임 줄에는 유저 지표를 넣지 않는다 — 접속은 게임과 무관하다", async () => {
    const { service, prisma } = make({
      firstOutcomeAt: new Date("2026-09-01"),
    });
    await service.captureDay(DAY, { live: true });
    expect(rowOf(prisma, "LOL").create.totalUsers).toBeUndefined();
    expect(rowOf(prisma, "PUBG").create.active1d).toBeUndefined();
  });

  it("RoomOutcome 이 쌓이기 전 날의 방 지표는 0 이 아니라 null 이다", async () => {
    const { service, prisma } = make({
      firstOutcomeAt: new Date("2026-10-20"),
    });
    await service.captureDay(DAY, { live: false });
    expect(rowOf(prisma, "ALL").create.roomsEnded).toBeNull();
    expect(rowOf(prisma, "LOL").create.roomsStarted).toBeNull();
    // 기록 수는 과거를 다시 셀 수 있어 그대로 채운다
    expect(rowOf(prisma, "LOL").create.records).toBe(3);

    const none = make({ firstOutcomeAt: null });
    await none.service.captureDay(DAY, { live: false });
    expect(rowOf(none.prisma, "ALL").create.roomsEnded).toBeNull();
  });

  it("방 지표는 봇이 연 방을 뺀다", async () => {
    const { service, prisma } = make({
      firstOutcomeAt: new Date("2026-09-01"),
    });
    await service.captureDay(DAY, { live: true });
    for (const call of prisma.roomOutcome.count.mock.calls) {
      expect(call[0].where.hostIsBot).toBe(false);
    }
  });

  it("집계 구간은 KST 하루다", async () => {
    const { service, prisma } = make({
      firstOutcomeAt: new Date("2026-09-01"),
    });
    await service.captureDay(DAY, { live: false });
    const newUsersWhere = prisma.user.count.mock.calls[1][0].where.createdAt;
    expect(newUsersWhere.gte.toISOString()).toBe("2026-10-04T15:00:00.000Z");
    expect(newUsersWhere.lt.toISOString()).toBe("2026-10-05T15:00:00.000Z");
  });
});

describe("AdminStatsSnapshotService 실행", () => {
  it("크론: 락을 못 잡으면 아무것도 하지 않는다 (중복 실행 방지)", async () => {
    const { service, prisma, redis } = make();
    redis.acquireLock.mockResolvedValue(null);
    await service.handleDaily();
    expect(prisma.adminDailyStat.upsert).not.toHaveBeenCalled();
  });

  it("크론: 끝나면 락을 푼다, 실패해도 푼다", async () => {
    const { service, prisma, redis } = make();
    prisma.user.count.mockRejectedValue(new Error("db"));
    await service.handleDaily();
    expect(redis.releaseLock).toHaveBeenCalledWith("admin:daily-stat", "tok");
  });

  it("기동 시 비어 있으면 백필하고, 이미 있으면 하지 않는다", async () => {
    const empty = make({ existing: 0 });
    await empty.service.onApplicationBootstrap();
    expect(empty.prisma.adminDailyStat.upsert).toHaveBeenCalled();

    const filled = make({ existing: 10 });
    await filled.service.onApplicationBootstrap();
    expect(filled.prisma.adminDailyStat.upsert).not.toHaveBeenCalled();
  });

  it("기동 시 백필이 실패해도 던지지 않는다", async () => {
    const { service, prisma } = make();
    prisma.adminDailyStat.count.mockRejectedValue(new Error("no table"));
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it("백필은 오늘을 뺀 지난 N일을 채운다", async () => {
    const { service, prisma } = make({
      firstOutcomeAt: new Date("2026-09-01"),
    });
    const res = await service.backfill(3);
    expect(res.days).toBe(3);
    // 하루 3줄 × 3일
    expect(prisma.adminDailyStat.upsert).toHaveBeenCalledTimes(9);
  });
});

describe("AdminStatsSnapshotService.getCohortSurvival", () => {
  it("주 단위 코호트를 오래된 주부터 돌려주고, 봇을 뺀다", async () => {
    const { service, prisma } = make();
    prisma.user.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(3);

    const cohorts = await service.getCohortSurvival(2);

    expect(cohorts).toHaveLength(2);
    expect(cohorts[0].weekStart.getTime()).toBeLessThan(
      cohorts[1].weekStart.getTime(),
    );
    expect(cohorts[0]).toMatchObject({ signups: 10, activeNow: 4 });
    expect(cohorts[1]).toMatchObject({ signups: 6, activeNow: 3 });
    expect(prisma.user.count.mock.calls[0][0].where.NOT).toBeDefined();
  });

  it("코호트 시작은 월요일이다", async () => {
    const { service } = make();
    const cohorts = await service.getCohortSurvival(3);
    for (const c of cohorts) expect(c.weekStart.getUTCDay()).toBe(1);
  });

  it("주 수는 1~26 으로 보정한다", async () => {
    const { service } = make();
    expect(await service.getCohortSurvival(0)).toHaveLength(1);
    expect(await service.getCohortSurvival(999)).toHaveLength(26);
  });
});
