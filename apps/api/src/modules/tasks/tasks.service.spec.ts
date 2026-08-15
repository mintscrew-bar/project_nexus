import { TasksService } from "./tasks.service";

describe("TasksService pending custom match collection lock", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("작업 중 락 TTL을 갱신하고 종료 시 heartbeat를 해제한다", async () => {
    jest.useFakeTimers();
    let finishCollection!: () => void;
    const collectionDone = new Promise<void>((resolve) => {
      finishCollection = resolve;
    });
    const redis = {
      acquireLock: jest.fn().mockResolvedValue("lock-token"),
      extendLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const matchDataCollectionService = {
      collectPendingMatches: jest.fn().mockReturnValue(collectionDone),
    };
    const service = Object.create(TasksService.prototype) as TasksService;
    Object.assign(service as object, {
      redis,
      matchDataCollectionService,
      logger: { warn: jest.fn(), error: jest.fn() },
    });

    const run = service.handlePendingCustomMatchCollection();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(redis.extendLock).toHaveBeenCalledWith(
      "tasks:pending-custom-match-collection",
      "lock-token",
      30 * 60 * 1000,
    );

    finishCollection();
    await run;
    expect(redis.releaseLock).toHaveBeenCalledWith(
      "tasks:pending-custom-match-collection",
      "lock-token",
    );

    redis.extendLock.mockClear();
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(redis.extendLock).not.toHaveBeenCalled();
  });

  it("픽/밴 미캡처 상태인 진행 중 내부 매치를 자동 탐색한다", async () => {
    const redis = {
      acquireLock: jest.fn().mockResolvedValue("discovery-token"),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      match: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "match-1" }, { id: "match-2" }]),
      },
    };
    const matchService = {
      getLiveMatchStatus: jest.fn().mockResolvedValue({ isLive: false }),
    };
    const service = Object.create(TasksService.prototype) as TasksService;
    Object.assign(service as object, {
      redis,
      prisma,
      matchService,
      logger: { log: jest.fn(), error: jest.fn() },
    });

    await service.handleActiveCustomMatchDiscovery();

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: {
        status: "IN_PROGRESS",
        isInternal: true,
        draftCapturedAt: null,
      },
      select: { id: true },
      take: 10,
    });
    expect(matchService.getLiveMatchStatus).toHaveBeenCalledTimes(2);
    expect(redis.releaseLock).toHaveBeenCalledWith(
      "tasks:active-custom-match-discovery",
      "discovery-token",
    );
  });
});

describe("TasksService 챔피언 시즌 스캔", () => {
  const makeService = (statsService: any, redis: any) =>
    new TasksService(
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      redis as any,
      statsService as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it("큐를 비우고 락을 반납한다", async () => {
    // 이 크론이 사라져 있던 동안 큐가 계속 쌓이기만 했다.
    const redis = {
      acquireLock: jest.fn().mockResolvedValue("token"),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const statsService = {
      processChampionScanQueue: jest.fn().mockResolvedValue(2),
    };

    await makeService(statsService, redis).handleChampionSeasonScan();

    expect(statsService.processChampionScanQueue).toHaveBeenCalledWith(2);
    expect(redis.releaseLock).toHaveBeenCalledWith(
      "tasks:champion-season-scan",
      "token",
    );
  });

  it("락을 못 잡으면 큐를 건드리지 않는다", async () => {
    const redis = {
      acquireLock: jest.fn().mockResolvedValue(null),
      releaseLock: jest.fn(),
    };
    const statsService = { processChampionScanQueue: jest.fn() };

    await makeService(statsService, redis).handleChampionSeasonScan();

    expect(statsService.processChampionScanQueue).not.toHaveBeenCalled();
  });

  it("스캔이 실패해도 락은 반납한다", async () => {
    const redis = {
      acquireLock: jest.fn().mockResolvedValue("token"),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const statsService = {
      processChampionScanQueue: jest.fn().mockRejectedValue(new Error("riot")),
    };

    await expect(
      makeService(statsService, redis).handleChampionSeasonScan(),
    ).resolves.toBeUndefined();
    expect(redis.releaseLock).toHaveBeenCalled();
  });
});

describe("TasksService 밸런스 점수 복구", () => {
  it("12시간 작업에서 전체 점수를 갱신하고 락을 반납한다", async () => {
    const redis = {
      acquireLock: jest.fn().mockResolvedValue("balance-token"),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const balanceScores = {
      refreshAllAccounts: jest
        .fn()
        .mockResolvedValue({ updated: 12, failed: 1 }),
    };
    const service = Object.create(TasksService.prototype) as TasksService;
    Object.assign(service as object, {
      redis,
      balanceScores,
      logger: { log: jest.fn(), error: jest.fn() },
    });

    await service.handleBalanceScoreRefresh();

    expect(balanceScores.refreshAllAccounts).toHaveBeenCalledTimes(1);
    expect(redis.releaseLock).toHaveBeenCalledWith(
      "tasks:balance-score-refresh",
      "balance-token",
    );
  });
});
