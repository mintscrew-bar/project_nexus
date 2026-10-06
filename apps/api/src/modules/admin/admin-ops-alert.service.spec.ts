import {
  AdminOpsAlertService,
  decideOpsIssues,
  LOL_STALLED_THRESHOLD,
} from "./admin-ops-alert.service";

describe("decideOpsIssues", () => {
  it("문제가 없으면 알릴 게 없다", () => {
    expect(decideOpsIssues({ lolStalled: 0, pubgErrors: 0 })).toEqual([]);
  });

  it("롤은 한두 건은 흔한 실패라 임계 건수부터 알린다", () => {
    expect(
      decideOpsIssues({ lolStalled: LOL_STALLED_THRESHOLD - 1, pubgErrors: 0 }),
    ).toEqual([]);
    const issues = decideOpsIssues({
      lolStalled: LOL_STALLED_THRESHOLD,
      pubgErrors: 0,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("LOL_STALLED");
  });

  it("배그는 진행 중 방이 멈추므로 한 건이어도 알린다", () => {
    const issues = decideOpsIssues({ lolStalled: 0, pubgErrors: 1 });
    expect(issues.map((i) => i.kind)).toEqual(["PUBG_ERROR"]);
  });

  it("둘 다 문제면 둘 다 알린다", () => {
    expect(
      decideOpsIssues({ lolStalled: 5, pubgErrors: 2 }).map((i) => i.kind),
    ).toEqual(["LOL_STALLED", "PUBG_ERROR"]);
  });
});

function make(counts: { lol: number; pubg: number }, gate = "tok") {
  const prisma: any = {
    match: { count: jest.fn().mockResolvedValue(counts.lol) },
    scrim: { count: jest.fn().mockResolvedValue(counts.pubg) },
  };
  const redis: any = {
    acquireLock: jest.fn().mockResolvedValue(gate),
    releaseLock: jest.fn().mockResolvedValue(undefined),
  };
  const alerts: any = {
    notifyCollectionIssue: jest.fn().mockResolvedValue(true),
  };
  return {
    service: new AdminOpsAlertService(prisma, redis, alerts),
    prisma,
    redis,
    alerts,
  };
}

describe("AdminOpsAlertService.check", () => {
  it("수집이 불가능한 경기(코드·매치 ID 없음)는 세지 않는다", async () => {
    const { service, prisma } = make({ lol: 0, pubg: 0 });
    await service.check();
    const where = prisma.match.count.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { tournamentCode: { not: null } },
      { riotMatchId: { not: null } },
    ]);
    expect(where.collectAttempts.gte).toBe(10);
  });

  it("문제가 있으면 보내고, 문 역할로 락을 6시간 잡아 둔다", async () => {
    const { service, redis, alerts } = make({ lol: 0, pubg: 2 });
    const res = await service.check();

    expect(alerts.notifyCollectionIssue).toHaveBeenCalledTimes(1);
    expect(redis.acquireLock).toHaveBeenCalledWith(
      "admin:ops-alert:PUBG_ERROR",
      6 * 60 * 60_000,
    );
    expect(redis.releaseLock).not.toHaveBeenCalled();
    expect(res.sent).toEqual(["PUBG_ERROR"]);
  });

  it("같은 사유를 최근에 보냈으면(락 못 잡음) 다시 보내지 않는다", async () => {
    const { service, redis, alerts } = make({ lol: 0, pubg: 2 });
    redis.acquireLock.mockResolvedValue(null);
    await service.check();
    expect(alerts.notifyCollectionIssue).not.toHaveBeenCalled();
  });

  it("전송이 실패하면 다음 점검에서 다시 시도하도록 문을 연다", async () => {
    const { service, redis, alerts } = make({ lol: 0, pubg: 2 });
    alerts.notifyCollectionIssue.mockResolvedValue(false);
    const res = await service.check();
    expect(redis.releaseLock).toHaveBeenCalledWith(
      "admin:ops-alert:PUBG_ERROR",
      "tok",
    );
    expect(res.sent).toEqual([]);
  });

  it("크론은 점검이 실패해도 던지지 않는다", async () => {
    const { service, prisma } = make({ lol: 0, pubg: 0 });
    prisma.match.count.mockRejectedValue(new Error("db"));
    await expect(service.handleHourly()).resolves.toBeUndefined();
  });
});
