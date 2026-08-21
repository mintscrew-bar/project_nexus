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
});

describe("TasksService 챔피언 시즌 스캔", () => {
  const makeService = (statsService: any, redis: any, onlineCount = 0) =>
    new TasksService(
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      redis as any,
      statsService as any,
      {} as any,
      {} as any,
      { getOnlineUserCount: () => onlineCount } as any,
    );

  const makeStatsService = () => ({
    processChampionScanQueue: jest.fn().mockResolvedValue(2),
    enqueueChampionScanBackfill: jest.fn().mockResolvedValue(0),
  });

  it("큐를 비우고 락을 반납한다", async () => {
    // 이 크론이 사라져 있던 동안 큐가 계속 쌓이기만 했다.
    const redis = {
      acquireLock: jest.fn().mockResolvedValue("token"),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const statsService = makeStatsService();

    await makeService(statsService, redis).handleChampionSeasonScan();

    expect(statsService.processChampionScanQueue).toHaveBeenCalledWith(
      2,
      undefined,
    );
    expect(redis.releaseLock).toHaveBeenCalledWith(
      "tasks:champion-season-scan",
      "token",
    );
  });

  it("접속자가 적으면 아직 수집 안 된 계정을 백필 큐에 채운다", async () => {
    // 수집이 "누가 전적을 열어봤을 때"만 돌던 탓에 대부분의 계정이 비어 있었다.
    const redis = {
      acquireLock: jest.fn().mockResolvedValue("token"),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const statsService = makeStatsService();
    statsService.enqueueChampionScanBackfill.mockResolvedValue(3);

    await makeService(statsService, redis, 0).handleChampionSeasonScan();

    expect(statsService.enqueueChampionScanBackfill).toHaveBeenCalledWith(4);
    // 한가할 때는 백필 작업(음수 우선순위)도 처리 대상이다.
    expect(statsService.processChampionScanQueue).toHaveBeenCalledWith(
      2,
      undefined,
    );
  });

  it("접속자가 많으면 백필을 걸지도, 집지도 않는다", async () => {
    // Riot 예산은 하나뿐이라, 사람이 붙어 있으면 전적 검색이 먼저 써야 한다.
    const redis = {
      acquireLock: jest.fn().mockResolvedValue("token"),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const statsService = makeStatsService();

    await makeService(statsService, redis, 20).handleChampionSeasonScan();

    expect(statsService.enqueueChampionScanBackfill).not.toHaveBeenCalled();
    expect(statsService.processChampionScanQueue).toHaveBeenCalledWith(2, 0);
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
