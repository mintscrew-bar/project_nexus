import {
  SnakeDraftService,
  reconcileDraftState,
  type SnakeDraftState,
} from "./snake-draft.service";
import { SnakeDraftGateway } from "./snake-draft.gateway";

/**
 * 스네이크 드래프트 재시작 복구 (소켓 점검 H2, docs/status/SOCKET_AUDIT_2026-10.md).
 * 상태가 인메모리 Map 뿐이라 배포(재시작)하면 차례·마감이 사라지고 방이 DRAFT 에 걸렸다.
 */

function makeState(over: Partial<SnakeDraftState> = {}): SnakeDraftState {
  return {
    roomId: "room-1",
    numTeams: 3,
    currentTeamIndex: 0,
    currentRound: 1,
    pickOrder: ["T1", "T2", "T3", "T3", "T2", "T1"],
    isReversing: false,
    availablePlayers: ["p1", "p2", "p3", "p4", "p5", "p6"],
    timerEnd: Date.now() + 30_000,
    ...over,
  };
}

describe("reconcileDraftState", () => {
  it("Redis 가 한 픽 뒤처졌으면 DB 픽 기록 기준으로 차례와 남은 선수를 바로잡는다", () => {
    const behind = makeState({ currentTeamIndex: 1, currentRound: 1 });

    const result = reconcileDraftState(behind, ["p1", "p2"]);

    expect(result.currentTeamIndex).toBe(2);
    expect(result.availablePlayers).toEqual(["p3", "p4", "p5", "p6"]);
  });

  it("라운드 경계를 넘으면 라운드가 오르고 방향이 뒤집힌다", () => {
    const afterOneRound = reconcileDraftState(makeState(), ["p1", "p2", "p3"]);
    expect(afterOneRound.currentRound).toBe(2);
    expect(afterOneRound.isReversing).toBe(true);

    const afterTwoRounds = reconcileDraftState(makeState(), [
      "p1",
      "p2",
      "p3",
      "p4",
      "p5",
      "p6",
    ]);
    expect(afterTwoRounds.currentRound).toBe(3);
    expect(afterTwoRounds.isReversing).toBe(false);
  });

  it("이미 일치하면 값이 변하지 않는다", () => {
    const consistent = makeState({
      currentTeamIndex: 2,
      currentRound: 1,
      availablePlayers: ["p3", "p4", "p5", "p6"],
    });

    expect(reconcileDraftState(consistent, ["p1", "p2"])).toEqual(consistent);
  });

  it("executePick 의 갱신 규칙과 같은 결과를 낸다", () => {
    // 한 픽씩 진행하며 갱신 규칙(index++, 경계에서 round++ / isReversing 반전)을 직접 돌린 값과 비교
    let live = makeState({ numTeams: 2 });
    const picked: string[] = [];
    for (const player of ["p1", "p2", "p3", "p4", "p5"]) {
      picked.push(player);
      live = {
        ...live,
        availablePlayers: live.availablePlayers.filter((id) => id !== player),
        currentTeamIndex: live.currentTeamIndex + 1,
      };
      if (live.currentTeamIndex % live.numTeams === 0) {
        live.currentRound++;
        live.isReversing = !live.isReversing;
      }
      const rebuilt = reconcileDraftState(makeState({ numTeams: 2 }), picked);
      expect(rebuilt.currentTeamIndex).toBe(live.currentTeamIndex);
      expect(rebuilt.currentRound).toBe(live.currentRound);
      expect(rebuilt.isReversing).toBe(live.isReversing);
      expect(rebuilt.availablePlayers).toEqual(live.availablePlayers);
    }
  });
});

describe("SnakeDraftService 복원", () => {
  function build(opts: {
    redisValue?: string | null;
    picks?: string[];
    rooms?: { id: string }[];
    withRedis?: boolean;
  }) {
    const prisma = {
      room: {
        findMany: jest.fn().mockResolvedValue(opts.rooms ?? [{ id: "room-1" }]),
      },
      snakeDraftPick: {
        findMany: jest
          .fn()
          .mockResolvedValue((opts.picks ?? []).map((userId) => ({ userId }))),
      },
    };
    const redis = {
      get: jest.fn().mockResolvedValue(opts.redisValue ?? null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SnakeDraftService(
      prisma as any,
      undefined,
      undefined,
      opts.withRedis === false ? undefined : (redis as any),
    );
    return { service, prisma, redis };
  }

  it("Redis 에 저장된 상태를 부팅 때 복원한다", async () => {
    const saved = makeState({ currentTeamIndex: 2, currentRound: 1 });
    const { service, redis } = build({
      redisValue: JSON.stringify(saved),
      picks: ["p1", "p2"],
    });

    await service.onModuleInit();

    const restored = service.getDraftState("room-1");
    expect(restored?.pickOrder).toEqual(saved.pickOrder);
    expect(restored?.currentTeamIndex).toBe(2);
    expect(redis.get).toHaveBeenCalledWith("snake-draft:state:room-1");
  });

  it("DB 픽 기록이 Redis 보다 앞서 있으면 DB 를 따른다", async () => {
    const saved = makeState({ currentTeamIndex: 1 });
    const { service } = build({
      redisValue: JSON.stringify(saved),
      picks: ["p1", "p2", "p3"],
    });

    await service.onModuleInit();

    const restored = service.getDraftState("room-1");
    expect(restored?.currentTeamIndex).toBe(3);
    expect(restored?.currentRound).toBe(2);
    expect(restored?.availablePlayers).toEqual(["p4", "p5", "p6"]);
  });

  it("복원 직후 팀장이 자동 픽당하지 않도록 최소 남은 시간을 보장한다", async () => {
    const expired = makeState({ timerEnd: Date.now() - 60_000 });
    const { service } = build({ redisValue: JSON.stringify(expired) });
    const before = Date.now();

    await service.onModuleInit();

    const restored = service.getDraftState("room-1");
    expect(restored!.timerEnd).toBeGreaterThanOrEqual(before + 14_000);
  });

  it("마감이 넉넉히 남아 있으면 그대로 둔다", async () => {
    const timerEnd = Date.now() + 50_000;
    const { service } = build({
      redisValue: JSON.stringify(makeState({ timerEnd })),
    });

    await service.onModuleInit();

    expect(service.getDraftState("room-1")!.timerEnd).toBe(timerEnd);
  });

  it("복원한 상태를 다시 Redis 에 저장한다(보정값 반영)", async () => {
    const { service, redis } = build({
      redisValue: JSON.stringify(makeState()),
      picks: ["p1"],
    });

    await service.onModuleInit();

    expect(redis.set).toHaveBeenCalledWith(
      "snake-draft:state:room-1",
      expect.stringContaining('"currentTeamIndex":1'),
      expect.any(Number),
    );
  });

  it("저장된 상태가 없는 방은 복원하지 않고 넘어간다", async () => {
    const { service } = build({ redisValue: null });

    await service.onModuleInit();

    expect(service.getDraftState("room-1")).toBeUndefined();
  });

  it("손상된 값은 무시하고 다른 방 복원을 막지 않는다", async () => {
    const { service, redis } = build({
      rooms: [{ id: "bad" }, { id: "room-1" }],
    });
    redis.get.mockImplementation((key: string) =>
      Promise.resolve(
        key.endsWith("bad") ? "{not json" : JSON.stringify(makeState()),
      ),
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(service.getDraftState("bad")).toBeUndefined();
    expect(service.getDraftState("room-1")).toBeDefined();
  });

  it("Redis 조회가 실패해도 서버 시작을 막지 않는다", async () => {
    const { service, redis } = build({});
    redis.get.mockRejectedValue(new Error("redis down"));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it("Redis 가 없는 환경(테스트 등)에서는 아무것도 하지 않는다", async () => {
    const { service, prisma } = build({ withRedis: false });

    await service.onModuleInit();

    expect(prisma.room.findMany).not.toHaveBeenCalled();
  });

  it("상태를 지우면 Redis 키도 지운다", async () => {
    const { service, redis } = build({
      redisValue: JSON.stringify(makeState()),
    });
    await service.onModuleInit();

    service.clearDraftState("room-1");

    expect(service.getDraftState("room-1")).toBeUndefined();
    expect(redis.del).toHaveBeenCalledWith("snake-draft:state:room-1");
  });
});

describe("SnakeDraftService 픽 저장", () => {
  it("픽을 마칠 때마다 갱신된 상태를 Redis 에 저장한다", async () => {
    const prisma: any = {
      room: {
        findMany: jest.fn().mockResolvedValue([{ id: "room-1" }]),
        findUnique: jest.fn().mockResolvedValue({ pickTimeLimit: 60 }),
      },
      snakeDraftPick: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      team: {
        findUnique: jest.fn().mockResolvedValue({ id: "T1", captainId: "c1" }),
      },
      roomParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: "part-1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      teamMember: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify(makeState())),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SnakeDraftService(
      prisma,
      undefined,
      undefined,
      redis as any,
    );
    await service.onModuleInit();
    redis.set.mockClear();

    await service.autoPick("room-1");

    expect(redis.set).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(redis.set.mock.calls[0][1]) as SnakeDraftState;
    expect(saved.currentTeamIndex).toBe(1);
    expect(saved.availablePlayers).toHaveLength(5);
    expect(redis.set.mock.calls[0][0]).toBe("snake-draft:state:room-1");
  });

  it("Redis 저장이 실패해도 픽 진행은 막히지 않는다", async () => {
    const prisma: any = {
      room: {
        findMany: jest.fn().mockResolvedValue([{ id: "room-1" }]),
        findUnique: jest.fn().mockResolvedValue({ pickTimeLimit: 60 }),
      },
      snakeDraftPick: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      team: {
        findUnique: jest.fn().mockResolvedValue({ id: "T1", captainId: "c1" }),
      },
      roomParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: "part-1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      teamMember: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
    };
    const redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify(makeState())),
      set: jest.fn().mockRejectedValue(new Error("redis down")),
      del: jest.fn(),
    };
    const service = new SnakeDraftService(
      prisma,
      undefined,
      undefined,
      redis as any,
    );
    await service.onModuleInit();

    const state = await service.autoPick("room-1");

    expect(state.currentTeamIndex).toBe(1);
  });
});

describe("SnakeDraftGateway 픽 타이머 재무장", () => {
  function build(state: SnakeDraftState | undefined) {
    const snakeDraftService = {
      getDraftState: jest.fn().mockReturnValue(state),
      getClientDraftState: jest.fn().mockResolvedValue({ teams: [] }),
      completeDraft: jest.fn().mockResolvedValue(undefined),
    };
    const roleSelectionGateway = {
      advanceAfterTeams: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      roomParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: "part-1" }),
      },
    };
    const gateway = new SnakeDraftGateway(
      {} as any,
      prisma as any,
      snakeDraftService as any,
      {} as any,
      roleSelectionGateway as any,
    );
    const emit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit }) };
    const schedule = jest
      .spyOn(gateway as any, "_schedulePickTimer")
      .mockImplementation(() => undefined);
    return { gateway, snakeDraftService, roleSelectionGateway, schedule, emit };
  }

  const client = (over: Record<string, unknown> = {}) =>
    ({ id: "sock-1", userId: "user-1", join: jest.fn(), ...over }) as any;

  afterEach(() => jest.restoreAllMocks());

  it("복원된 드래프트에 첫 참가자가 들어오면 timerEnd 로 타이머를 건다", async () => {
    const state = makeState();
    const { gateway, schedule } = build(state);

    await gateway.handleJoinDraftRoom(client(), { roomId: "room-1" });

    expect(schedule).toHaveBeenCalledWith("room-1", state.timerEnd);
  });

  it("타이머가 이미 걸려 있으면 정상 진행 중인 타이머를 건드리지 않는다", async () => {
    const { gateway, schedule } = build(makeState());
    (gateway as any).pickTimers.set(
      "room-1",
      setTimeout(() => undefined, 1),
    );

    await gateway.handleJoinDraftRoom(client(), { roomId: "room-1" });

    expect(schedule).not.toHaveBeenCalled();
    clearTimeout((gateway as any).pickTimers.get("room-1"));
  });

  it("자동 픽이나 수동 픽을 처리 중이면 타이머를 새로 걸지 않는다", async () => {
    const { gateway, schedule } = build(makeState());
    (gateway as any).autoPickingRooms.add("room-1");

    await gateway.handleJoinDraftRoom(client(), { roomId: "room-1" });

    expect(schedule).not.toHaveBeenCalled();
  });

  it("정상 완료 처리 중이면 타이머를 새로 걸지 않는다", async () => {
    const { gateway, schedule } = build(makeState());
    (gateway as any).completingDrafts.add("room-1");

    await gateway.handleJoinDraftRoom(client(), { roomId: "room-1" });

    expect(schedule).not.toHaveBeenCalled();
  });

  it("방송(읽기 전용) 연결은 타이머를 건드리지 않는다", async () => {
    const { gateway, schedule } = build(makeState());

    await gateway.handleJoinDraftRoom(
      client({
        userId: undefined,
        isBroadcast: true,
        broadcastRoomId: "room-1",
      }),
      { roomId: "room-1" },
    );

    expect(schedule).not.toHaveBeenCalled();
  });

  it("드래프트 상태가 없으면 아무것도 하지 않는다", async () => {
    const { gateway, schedule } = build(undefined);

    await gateway.handleJoinDraftRoom(client(), { roomId: "room-1" });

    expect(schedule).not.toHaveBeenCalled();
  });

  it("남은 선수가 없는 복원 상태는 완료 처리를 이어서 한다", async () => {
    const { gateway, snakeDraftService, roleSelectionGateway, schedule, emit } =
      build(makeState({ availablePlayers: [] }));

    await gateway.handleJoinDraftRoom(client(), { roomId: "room-1" });
    // _completeRecoveredDraft 는 join 응답을 기다리지 않고 도는 비동기 작업이다.
    await new Promise((resolve) => setImmediate(resolve));

    expect(schedule).not.toHaveBeenCalled();
    expect(snakeDraftService.completeDraft).toHaveBeenCalledWith("room-1");
    expect(emit).toHaveBeenCalledWith("draft-complete", { teams: [] });
    expect(roleSelectionGateway.advanceAfterTeams).toHaveBeenCalledWith(
      "room-1",
    );
  });
});
