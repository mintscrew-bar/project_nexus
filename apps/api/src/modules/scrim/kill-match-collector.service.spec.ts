import {
  COLLECT_GRACE_AFTER_CUTOFF_MS,
  KillMatchCollectorService,
  MAX_CALLS_PER_CYCLE,
  POST_CUTOFF_INTERVAL_MS,
  TICK_MS,
} from "./kill-match-collector.service";
import { ScrimService } from "./scrim.service";
import {
  DEFAULT_PUBG_POINT_RULE,
  KILL_MATCH_POINT_RULE,
  sortScrimLeaderboard,
} from "@nexus/types";

describe("시간제 킬내기 자동 집계", () => {
  const startsAt = new Date("2026-09-08T01:00:00Z");
  const cutoffAt = new Date("2026-09-08T02:00:00Z");
  function fixture(createdAt: string, playerIds = ["a", "b", "c", "d"]) {
    const scrim = {
      id: "s",
      startsAt,
      cutoffAt,
      updatedAt: startsAt,
      pointRule: KILL_MATCH_POINT_RULE,
      collectorState: {
        roster: ["a", "b", "c", "d"].map((playerId) => ({
          playerId,
          teamId: "team",
          teamName: "A",
          platform: "STEAM",
        })),
        cursor: 0,
        pending: [{ id: "match", platform: "STEAM" }],
        seen: [],
      },
    };
    const db: any = {
      scrim: {
        findFirst: jest.fn().mockResolvedValue(scrim),
        // 사이클은 방을 고른 뒤 단계마다 다시 읽는다. 두 번째부터 null 을
        // 돌려 한 단계만 돌게 한다 — 여러 콜은 아래 전용 테스트에서 본다.
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(scrim)
          .mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      scrimRound: {
        findUnique: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { roundNumber: 0 } }),
        create: jest.fn(),
      },
    };
    db.$transaction = (fn: any) => fn(db);
    const api: any = {
      isEnabled: true,
      getMatch: jest.fn().mockResolvedValue({
        matchId: "match",
        createdAt,
        gameMode: "squad-fpp",
        teams: [{ playerIds, placement: 1, kills: 10, deaths: 2 }],
      }),
    };
    const redis: any = {
      acquireLock: jest.fn().mockResolvedValue("token"),
      extendLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn(),
    };
    const service = new KillMatchCollectorService(db, redis, api, {
      get: () => undefined,
    } as any);
    return { service, db, api, scrim, redis };
  }
  it.each(["2026-09-08T01:00:00Z", "2026-09-08T01:59:59Z"])(
    "종료 후 조회해도 기간 안에 시작한 %s 경기는 포함",
    async (time) => {
      const { service, db } = fixture(time);
      await service.tick();
      expect(db.scrimRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pubgMatchId: "match",
            results: {
              create: [
                expect.objectContaining({ kills: 10, deaths: 2, points: 12 }),
              ],
            },
          }),
        }),
      );
    },
  );
  it.each(["2026-09-08T00:59:59Z", "2026-09-08T02:00:00Z"])(
    "기간 밖 시작 %s 제외",
    async (time) => {
      const { service, db } = fixture(time);
      await service.tick();
      expect(db.scrimRound.create).not.toHaveBeenCalled();
    },
  );
  it("외부인이 낀 스쿼드의 킬은 집계하지 않는다", async () => {
    const { service, db } = fixture(startsAt.toISOString(), [
      "a",
      "b",
      "c",
      "outsider",
    ]);
    await service.tick();
    expect(db.scrimRound.create).not.toHaveBeenCalled();
  });
  it("다른 참가자 목록에서 같은 경기 발견 시 중복 생성하지 않는다", async () => {
    const { service, db } = fixture(startsAt.toISOString());
    db.scrimRound.findUnique.mockResolvedValue({ id: "existing" });
    await service.tick();
    expect(db.scrimRound.create).not.toHaveBeenCalled();
  });
  it("API 반영 지연은 재시도 대상으로 남긴다", async () => {
    const { service, db, api, scrim } = fixture(startsAt.toISOString());
    api.getMatch.mockResolvedValue(null);
    await service.tick();
    expect(db.scrimRound.create).not.toHaveBeenCalled();
    expect(scrim.collectorState.seen).toEqual([]);
    expect(scrim.collectorState.pending).toHaveLength(1);
  });
  it("락을 잃으면 결과를 기록하지 않는다", async () => {
    const { service, db, redis } = fixture(startsAt.toISOString());
    redis.extendLock.mockResolvedValue(false);
    await service.tick();
    expect(db.scrimRound.create).not.toHaveBeenCalled();
  });

  /**
   * 수집은 종료 시각 + 여유 시간까지만 돈다.
   *
   * 끝없이 돌면 참가자가 내전 뒤 다른 판을 돌릴 때마다 목록을 다시 읽어,
   * 호스트가 확정을 누르지 않는 한 PUBG 전역 예산을 무한정 먹는다.
   */
  it("종료 후 여유 시간이 지난 방은 조회 대상에서 뺀다", async () => {
    const now = new Date("2026-09-08T05:00:00Z");
    jest.useFakeTimers().setSystemTime(now);
    try {
      const { service, db } = fixture(startsAt.toISOString());
      await service.tick();

      const where = db.scrim.findFirst.mock.calls[0][0].where;
      expect(where.cutoffAt.gt).toEqual(
        new Date(now.getTime() - COLLECT_GRACE_AFTER_CUTOFF_MS),
      );
      // 종료(02:00)에 여유를 더해도 05:00 시점엔 대상이 아니다.
      expect(cutoffAt.getTime()).toBeLessThan(where.cutoffAt.gt.getTime());
    } finally {
      jest.useRealTimers();
    }
  });

  /**
   * 종료 뒤에는 느린 주기로만 본다.
   *
   * 예산이 앱 전체 9 req/분인데 10초 주기는 최대 6 req/분이다. 경기가 끝난
   * 방에 그걸 계속 쓰면 사용자가 기다리는 닉네임 조회가 429 를 맞는다.
   */
  it("진행 중인 방은 매 tick 본다", async () => {
    const now = new Date("2026-09-08T01:30:00Z"); // 종료(02:00) 전
    jest.useFakeTimers().setSystemTime(now);
    try {
      const { service, db } = fixture(startsAt.toISOString());
      await service.tick();

      const or = db.scrim.findFirst.mock.calls[0][0].where.OR;
      // 첫 갈래가 "아직 종료 전" — 주기 제한 없이 뽑힌다.
      expect(or[0]).toEqual({ cutoffAt: { gt: now } });
    } finally {
      jest.useRealTimers();
    }
  });

  it("종료된 방은 마지막 조회로부터 느린 주기가 지나야 본다", async () => {
    const now = new Date("2026-09-08T02:10:00Z"); // 종료 10분 뒤, 여유 시간 안
    jest.useFakeTimers().setSystemTime(now);
    try {
      const { service, db } = fixture(startsAt.toISOString());
      await service.tick();

      const or = db.scrim.findFirst.mock.calls[0][0].where.OR;
      // 종료 뒤에는 `lastCollectedAt` 이 느린 주기보다 오래됐을 때만 뽑힌다.
      const throttled = or.find((clause: any) => clause.lastCollectedAt?.lt);
      expect(throttled.lastCollectedAt.lt.getTime()).toBe(
        now.getTime() - POST_CUTOFF_INTERVAL_MS,
      );
      // 한 번도 조회 안 한 방은 기다리지 않는다.
      expect(or).toContainEqual({ lastCollectedAt: null });
    } finally {
      jest.useRealTimers();
    }
  });
});

/**
 * 한 사이클에 목록과 상세를 이어서 처리한다.
 *
 * 한 콜만 하면 새 판 하나가 점수에 오르는 데 두 사이클(6분)이 걸리고,
 * 판이 몰려 끝나면 한 판씩 차례를 기다린다.
 */
describe("사이클당 여러 콜", () => {
  /** 목록에 새 경기 두 건이 있는 상태 */
  function burstFixture() {
    const startsAt = new Date("2026-09-08T01:00:00Z");
    const scrim: any = {
      id: "s",
      startsAt,
      cutoffAt: new Date("2026-09-08T02:00:00Z"),
      updatedAt: startsAt,
      pointRule: KILL_MATCH_POINT_RULE,
      collectorState: {
        roster: ["a", "b", "c", "d"].map((playerId) => ({
          playerId,
          teamId: "team",
          teamName: "A",
          platform: "STEAM",
        })),
        cursor: 0,
        pending: [],
        seen: [],
      },
    };
    const db: any = {
      scrim: {
        findFirst: jest.fn().mockResolvedValue({ id: "s" }),
        // 단계마다 다시 읽는다. 앞 단계가 쓴 상태를 그대로 물려준다.
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(scrim)),
        updateMany: jest.fn().mockImplementation(({ data }: any) => {
          if (data.collectorState) scrim.collectorState = data.collectorState;
          return Promise.resolve({ count: 1 });
        }),
        update: jest.fn().mockImplementation(({ data }: any) => {
          if (data.collectorState) scrim.collectorState = data.collectorState;
          return Promise.resolve(scrim);
        }),
      },
      scrimRound: {
        findUnique: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { roundNumber: 0 } }),
        create: jest.fn(),
      },
    };
    db.$transaction = (fn: any) => fn(db);
    const api: any = {
      isEnabled: true,
      getPlayerMatchIds: jest.fn().mockResolvedValue(["m1", "m2"]),
      getMatch: jest.fn().mockImplementation((_p: string, id: string) =>
        Promise.resolve({
          matchId: id,
          createdAt: "2026-09-08T01:30:00Z",
          gameMode: "squad-fpp",
          teams: [
            {
              playerIds: ["a", "b", "c", "d"],
              placement: 1,
              kills: 5,
              deaths: 1,
            },
          ],
        }),
      ),
    };
    const redis: any = {
      acquireLock: jest.fn().mockResolvedValue("token"),
      extendLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn(),
    };
    return {
      service: new KillMatchCollectorService(db, redis, api, {
        get: () => undefined,
      } as any),
      db,
      api,
    };
  }

  it("목록 한 번 + 상세 두 건을 한 사이클에 처리한다", async () => {
    const { service, db, api } = burstFixture();
    await service.tick();

    // 상한이 3콜이므로 목록 1 + 상세 2 다.
    expect(api.getPlayerMatchIds).toHaveBeenCalledTimes(1);
    expect(api.getMatch).toHaveBeenCalledTimes(2);
    expect(db.scrimRound.create).toHaveBeenCalledTimes(2);
  });

  it("상한을 넘겨 호출하지 않는다", async () => {
    const { service, api } = burstFixture();
    api.getPlayerMatchIds.mockResolvedValue(["m1", "m2", "m3", "m4", "m5"]);
    await service.tick();

    const calls =
      api.getPlayerMatchIds.mock.calls.length + api.getMatch.mock.calls.length;
    expect(calls).toBe(MAX_CALLS_PER_CYCLE);
  });
});

/**
 * 주기와 사이클당 콜 수가 곧 예산 소비량이다.
 *
 * 예산은 앱 전체 9 req/분이고(`PubgRateLimiterService`, 무료 키 10 에서
 * 마진 1) 닉네임 조회 같은 사용자 대기 호출이 같은 예산을 쓴다. 주기를
 * 줄이거나 상한을 올리는 건 한 줄이면 되는데 그 비용이 코드에 드러나지
 * 않으므로, 산식을 여기 못박는다.
 */
describe("수집 주기와 전역 예산", () => {
  /** `PubgRateLimiterService` 의 기본값(PUBG_GLOBAL_RATE_MAX) */
  const BUDGET_PER_MIN = 9;
  const perMinute = (calls: number, intervalMs: number) =>
    (calls * 60_000) / intervalMs;

  it("새 판이 없는 사이클은 목록 확인 한 번으로 끝난다", () => {
    // 비용이 할 일에 따라 붙는다는 게 요점이다 — 노는 동안은 거의 안 쓴다.
    const idle = perMinute(1, TICK_MS);
    expect(idle).toBeCloseTo(0.33, 2);
    expect(idle / BUDGET_PER_MIN).toBeLessThan(1 / 20);
  });

  it("판이 끝난 사이클에도 예산의 6분의 1을 넘지 않는다", () => {
    const busy = perMinute(MAX_CALLS_PER_CYCLE, TICK_MS);
    expect(busy).toBe(1);
    expect(busy / BUDGET_PER_MIN).toBeLessThanOrEqual(1 / 6);
  });

  it("한 사이클에 목록과 상세를 같이 받을 수 있다", () => {
    // 1콜이면 새 판 하나가 점수에 오르는 데 두 사이클이 든다.
    // 목록 한 번 + 상세 두 건은 돼야 판이 몰려 끝나도 따라간다.
    expect(MAX_CALLS_PER_CYCLE).toBeGreaterThanOrEqual(2);
  });

  it("종료 뒤에는 더 느리게 본다", () => {
    expect(POST_CUTOFF_INTERVAL_MS).toBeGreaterThan(TICK_MS);
    const after = perMinute(MAX_CALLS_PER_CYCLE, POST_CUTOFF_INTERVAL_MS);
    expect(after / BUDGET_PER_MIN).toBeLessThan(1 / 20);
  });

  it("여유 시간 전체가 쓰는 콜 수는 한 줌이다", () => {
    const cycles = COLLECT_GRACE_AFTER_CUTOFF_MS / POST_CUTOFF_INTERVAL_MS;
    expect(cycles).toBeLessThanOrEqual(5);
    expect(cycles * MAX_CALLS_PER_CYCLE).toBeLessThanOrEqual(15);
  });

  it("여유 시간은 마지막 한 판이 들어올 만큼 길다", () => {
    // 킬내기는 핫드랍 급사가 잦아 판이 짧게 끝난다. 종료 직전에 시작한
    // 판이 넉넉잡아 30분 뒤 상세로 나오고, 목록·상세 두 사이클이 더 든다.
    const lastMatchVisibleMs = 30 * 60_000 + POST_CUTOFF_INTERVAL_MS;
    expect(COLLECT_GRACE_AFTER_CUTOFF_MS).toBeGreaterThanOrEqual(
      lastMatchVisibleMs,
    );
  });
});

describe("킬내기 확정과 자동 수집", () => {
  const cutoffAt = new Date("2026-09-08T02:00:00Z");

  /** 수집할 게 남은 채로 종료된 킬내기 */
  const db = (now: Date) => {
    jest.useFakeTimers().setSystemTime(now);
    return {
      room: {
        findUnique: jest.fn().mockResolvedValue({
          hostId: "host",
          teams: [],
          scrim: {
            id: "s",
            status: "IN_PROGRESS",
            totalRounds: 2,
            cutoffAt,
            collectorState: { pending: [{ id: "m", platform: "STEAM" }] },
          },
        }),
        update: jest.fn(),
      },
      scrimRound: { count: jest.fn().mockResolvedValue(2) },
      // 확정이 통과했을 때 이어지는 호출들 — 여기서 막히면 안 된다.
      scrim: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: "s",
          status: "COMPLETED",
          cutoffAt,
          rounds: [],
          pointRule: KILL_MATCH_POINT_RULE,
        }),
      },
      team: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    } as any;
  };

  afterEach(() => jest.useRealTimers());

  it("수집이 도는 동안에는 확정을 미룬다", async () => {
    // 종료 10분 뒤 — 아직 여유 시간 안이다. 마지막 판이 들어오는 중일 수 있다.
    const prisma = db(new Date("2026-09-08T02:10:00Z"));
    await expect(
      new ScrimService(prisma).completeScrim("host", "room"),
    ).rejects.toThrow("수집 중인 경기 기록이 있습니다");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  /**
   * 여유 시간이 지나면 수집기는 이 방을 더 보지 않으므로 `pending` 이 영영
   * 줄지 않는다. 수집 상태만 보고 막으면 방을 확정할 방법이 없어진다.
   */
  it("수집이 끝난 뒤에는 남은 pending 이 확정을 막지 않는다", async () => {
    const prisma = db(new Date("2026-09-08T03:00:00Z"));
    await new ScrimService(prisma).completeScrim("host", "room");
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

describe("100명 25팀 3판 누적", () => {
  it("25팀 중 한 팀이라도 빠진 경기 결과를 저장하지 않는다", async () => {
    const teams = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`,
      name: `팀${i}`,
    }));
    const db: any = {
      room: {
        findUnique: jest.fn().mockResolvedValue({
          hostId: "host",
          teams,
          scrim: { id: "s", status: "IN_PROGRESS", totalRounds: 3 },
        }),
      },
      scrimRound: { findUnique: jest.fn().mockResolvedValue({ id: "round" }) },
      $transaction: jest.fn(),
    };
    await expect(
      new ScrimService(db).submitRoundResult("host", "room", 1, {
        results: teams.slice(0, 24).map((team, i) => ({
          teamId: team.id,
          placement: i + 1,
          kills: 0,
          deaths: 4,
        })),
      }),
    ).rejects.toThrow("매 경기 모든 팀");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("세 판 중 두 판만 완료됐으면 대회를 확정하지 않는다", async () => {
    const db: any = {
      room: {
        findUnique: jest.fn().mockResolvedValue({
          hostId: "host",
          teams: [],
          scrim: { id: "s", status: "IN_PROGRESS", totalRounds: 3 },
        }),
      },
      scrimRound: { count: jest.fn().mockResolvedValue(2) },
      $transaction: jest.fn(),
    };
    await expect(
      new ScrimService(db).completeScrim("host", "room"),
    ).rejects.toThrow("모든 경기");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("탈락 없이 25팀 모두 세 경기의 킬·데스·순위를 누적한다", () => {
    const teams = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`,
      name: `팀${i}`,
    }));
    const rounds = Array.from({ length: 3 }, (_, i) => ({
      roundNumber: i + 1,
      results: teams.map((team, j) => ({
        teamId: team.id,
        teamName: team.name,
        placement: j + 1,
        kills: 2,
        deaths: 4,
        points: 2 + (DEFAULT_PUBG_POINT_RULE.placementPoints[j] ?? 0),
        damage: 100,
      })),
    }));
    const rows = (new ScrimService({} as any) as any).buildLeaderboard(
      { rounds, pointRule: DEFAULT_PUBG_POINT_RULE },
      teams,
    );
    expect(rows).toHaveLength(25);
    expect(rows[0]).toMatchObject({
      totalPoints: 36,
      totalKills: 6,
      totalDeaths: 12,
      wins: 3,
      roundPoints: [12, 12, 12],
    });
    expect(rows[24].roundPoints).toEqual([2, 2, 2]);
  });
  it("대회 동점은 총킬보다 누적 순위 점수를 먼저 비교한다", () => {
    const a: any = {
      teamName: "A",
      totalPoints: 20,
      totalKills: 15,
      totalPlacementPoints: 5,
      roundPoints: [20],
    };
    const b: any = {
      teamName: "B",
      totalPoints: 20,
      totalKills: 10,
      totalPlacementPoints: 10,
      roundPoints: [20],
    };
    expect(sortScrimLeaderboard([a, b])[0].teamName).toBe("B");
  });
});
