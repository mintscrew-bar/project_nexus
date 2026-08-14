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

  it("진행 중이며 Riot ID가 없는 내부 매치를 자동 탐색한다", async () => {
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
        riotMatchId: null,
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
