import {
  ROLE_SELECTION_EXTENSION_MS,
  ROLE_SELECTION_MAX_EXTENSIONS_PER_USER,
  ROLE_SELECTION_TIME_MS,
} from "@nexus/types";
import { RoleSelectionService } from "./role-selection.service";
import { RoleSelectionGateway } from "./role-selection.gateway";

/**
 * 역할 선택 재시작 복구 (소켓 점검 H3, docs/status/SOCKET_AUDIT_2026-10.md).
 * 상태·준비·연장 횟수가 인메모리 Map 뿐이라 재시작하면 "진행 중이 아닙니다"로 막히고
 * 방이 ROLE_SELECTION 에 고정됐다.
 */

const KEY = "role-selection:state:room-1";

function persisted(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    state: {
      roomId: "room-1",
      startedAt: Date.now() - 60_000,
      timerEnd: Date.now() + 40_000,
    },
    extended: { "user-a": 1 },
    ready: ["cap-1"],
    ...over,
  });
}

function build(opts: {
  redisValue?: string | null;
  rooms?: { id: string }[];
  withRedis?: boolean;
}) {
  const prisma: any = {
    room: {
      findMany: jest.fn().mockResolvedValue(opts.rooms ?? [{ id: "room-1" }]),
    },
    team: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ captainId: "cap-1" }, { captainId: "cap-2" }]),
      findFirst: jest.fn().mockResolvedValue({ id: "team-2" }),
    },
  };
  const redis = {
    get: jest.fn().mockResolvedValue(opts.redisValue ?? null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RoleSelectionService(
    prisma,
    {} as any,
    opts.withRedis === false ? undefined : (redis as any),
  );
  return { service, prisma, redis };
}

describe("RoleSelectionService 복원", () => {
  it("Redis 에 저장된 상태·준비·연장 횟수를 부팅 때 복원한다", async () => {
    const { service, redis } = build({ redisValue: persisted() });

    await service.onModuleInit();

    expect(redis.get).toHaveBeenCalledWith(KEY);
    expect(service.getRoleSelectionState("room-1")).toBeDefined();
    // user-a 는 이미 1회 썼다
    expect(service.getRemainingExtensions("user-a", "room-1")).toBe(
      ROLE_SELECTION_MAX_EXTENSIONS_PER_USER - 1,
    );
    expect(service.getRemainingExtensions("user-b", "room-1")).toBe(
      ROLE_SELECTION_MAX_EXTENSIONS_PER_USER,
    );
    const ready = await service.getCaptainReadyState("room-1");
    expect(ready.readyCaptainIds).toEqual(["cap-1"]);
    expect(ready.allReady).toBe(false);
  });

  it("복원 뒤 연장·준비가 '진행 중이 아닙니다'로 막히지 않는다", async () => {
    const { service } = build({ redisValue: persisted() });
    await service.onModuleInit();

    expect(() => service.extendTimer("user-b", "room-1")).not.toThrow();
    await expect(
      service.markCaptainReady("cap-2", "room-1"),
    ).resolves.toMatchObject({ allReady: true });
  });

  it("마감이 이미 지났어도 복원 직후 최소 남은 시간을 보장한다", async () => {
    const { service } = build({
      redisValue: persisted({
        state: {
          roomId: "room-1",
          startedAt: Date.now() - 300_000,
          timerEnd: Date.now() - 60_000,
        },
      }),
    });

    await service.onModuleInit();

    expect(service.getTimeRemaining("room-1")).toBeGreaterThanOrEqual(14_000);
  });

  it("마감이 넉넉히 남았으면 그대로 둔다", async () => {
    const timerEnd = Date.now() + 50_000;
    const { service } = build({
      redisValue: persisted({
        state: { roomId: "room-1", startedAt: 1, timerEnd },
      }),
    });

    await service.onModuleInit();

    expect(service.getRoleSelectionState("room-1")!.timerEnd).toBe(timerEnd);
  });

  it("저장본이 없는 방은 새 타이머로 이어간다(영구 정지 방지)", async () => {
    const { service } = build({ redisValue: null });
    const before = Date.now();

    await service.onModuleInit();

    const state = service.getRoleSelectionState("room-1");
    expect(state).toBeDefined();
    expect(state!.timerEnd).toBeGreaterThanOrEqual(
      before + ROLE_SELECTION_TIME_MS - 1000,
    );
    // 연장은 처음부터 센다
    expect(service.getRemainingExtensions("user-a", "room-1")).toBe(
      ROLE_SELECTION_MAX_EXTENSIONS_PER_USER,
    );
  });

  it("손상된 저장본도 새 타이머로 이어가고 서버 시작을 막지 않는다", async () => {
    const { service } = build({ redisValue: "{not json" });

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(service.getRoleSelectionState("room-1")).toBeDefined();
  });

  it("state 모양이 틀린 저장본도 새 타이머로 이어간다", async () => {
    const { service } = build({
      redisValue: JSON.stringify({ extended: {}, ready: [] }),
    });

    await service.onModuleInit();

    expect(service.getRoleSelectionState("room-1")!.timerEnd).toBeGreaterThan(
      Date.now() + ROLE_SELECTION_TIME_MS - 2000,
    );
  });

  it("Redis 조회가 실패해도 서버 시작을 막지 않는다", async () => {
    const { service, redis } = build({});
    redis.get.mockRejectedValue(new Error("redis down"));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it("역할 선택 중인 방이 없으면 아무것도 복원하지 않는다", async () => {
    const { service, redis } = build({ rooms: [] });

    await service.onModuleInit();

    expect(redis.get).not.toHaveBeenCalled();
    expect(service.getRoleSelectionState("room-1")).toBeUndefined();
  });

  it("복원한 상태를 다시 Redis 에 저장한다", async () => {
    const { service, redis } = build({ redisValue: persisted() });

    await service.onModuleInit();

    expect(redis.set).toHaveBeenCalledWith(
      KEY,
      expect.stringContaining('"user-a":1'),
      expect.any(Number),
    );
  });
});

describe("RoleSelectionService 저장", () => {
  it("연장하면 새 마감과 사용 횟수를 Redis 에 저장한다", async () => {
    const { service, redis } = build({ redisValue: persisted() });
    await service.onModuleInit();
    const before = service.getRoleSelectionState("room-1")!.timerEnd;
    redis.set.mockClear();

    service.extendTimer("user-b", "room-1");

    expect(redis.set).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(redis.set.mock.calls[0][1]);
    expect(saved.extended["user-b"]).toBe(1);
    expect(saved.state.timerEnd).toBe(before + ROLE_SELECTION_EXTENSION_MS);
  });

  it("팀장이 준비하면 준비 목록을 Redis 에 저장한다", async () => {
    const { service, redis } = build({ redisValue: persisted() });
    await service.onModuleInit();
    redis.set.mockClear();

    await service.markCaptainReady("cap-2", "room-1");

    const saved = JSON.parse(redis.set.mock.calls[0][1]);
    expect(saved.ready.sort()).toEqual(["cap-1", "cap-2"]);
  });

  it("상태를 지우면 Redis 키도 지운다", async () => {
    const { service, redis } = build({ redisValue: persisted() });
    await service.onModuleInit();

    service.clearRoleSelectionState("room-1");

    expect(service.getRoleSelectionState("room-1")).toBeUndefined();
    expect(service.getRemainingExtensions("user-a", "room-1")).toBe(
      ROLE_SELECTION_MAX_EXTENSIONS_PER_USER,
    );
    expect(redis.del).toHaveBeenCalledWith(KEY);
  });

  it("Redis 저장이 실패해도 연장은 그대로 동작한다", async () => {
    const { service, redis } = build({ redisValue: persisted() });
    await service.onModuleInit();
    redis.set.mockRejectedValue(new Error("redis down"));

    const result = service.extendTimer("user-b", "room-1");

    expect(result.usedExtensions).toBe(1);
  });
});

describe("RoleSelectionGateway 타이머 재무장", () => {
  function buildGateway(hasState: boolean) {
    const roleSelectionService = {
      getRoleSelectionState: jest
        .fn()
        .mockReturnValue(
          hasState
            ? { roomId: "room-1", timerEnd: Date.now() + 30_000 }
            : undefined,
        ),
      getRoleSelectionData: jest.fn().mockResolvedValue({ teams: [] }),
      getRemainingExtensions: jest.fn().mockReturnValue(2),
    };
    const prisma = {
      roomParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: "part-1" }),
      },
    };
    const gateway = new RoleSelectionGateway(
      {} as any,
      prisma as any,
      roleSelectionService as any,
      {} as any,
      {} as any,
    );
    const startTimer = jest
      .spyOn(gateway, "startTimer")
      .mockImplementation(() => undefined);
    return { gateway, startTimer };
  }

  const client = (over: Record<string, unknown> = {}) =>
    ({ id: "sock-1", userId: "user-1", join: jest.fn(), ...over }) as any;

  afterEach(() => jest.restoreAllMocks());

  it("복원된 세션에 첫 참가자가 들어오면 타이머를 다시 건다", async () => {
    const { gateway, startTimer } = buildGateway(true);

    const result = await gateway.handleJoinRoom(client(), { roomId: "room-1" });

    expect(result).toMatchObject({ success: true });
    expect(startTimer).toHaveBeenCalledWith("room-1");
  });

  it("타이머가 이미 돌고 있으면 건드리지 않는다", async () => {
    const { gateway, startTimer } = buildGateway(true);
    (gateway as any).roomResolveTimers.set(
      "room-1",
      setTimeout(() => undefined, 1),
    );

    await gateway.handleJoinRoom(client(), { roomId: "room-1" });

    expect(startTimer).not.toHaveBeenCalled();
    clearTimeout((gateway as any).roomResolveTimers.get("room-1"));
  });

  it("완료 처리 중이면 타이머를 새로 걸지 않는다", async () => {
    const { gateway, startTimer } = buildGateway(true);
    (gateway as any).completingRooms.add("room-1");

    await gateway.handleJoinRoom(client(), { roomId: "room-1" });

    expect(startTimer).not.toHaveBeenCalled();
  });

  it("방송(읽기 전용) 연결은 타이머를 건드리지 않는다", async () => {
    const { gateway, startTimer } = buildGateway(true);

    await gateway.handleJoinRoom(
      client({
        userId: undefined,
        isBroadcast: true,
        broadcastRoomId: "room-1",
      }),
      { roomId: "room-1" },
    );

    expect(startTimer).not.toHaveBeenCalled();
  });

  it("진행 중인 역할 선택이 없으면 아무것도 하지 않는다", async () => {
    const { gateway, startTimer } = buildGateway(false);

    await gateway.handleJoinRoom(client(), { roomId: "room-1" });

    expect(startTimer).not.toHaveBeenCalled();
  });
});
