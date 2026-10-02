import {
  MatchGateway,
  deserializeRps,
  serializeRps,
  type RpsState,
} from "./match.gateway";

/**
 * 가위바위보 재시작 복구 (소켓 점검 M4, docs/status/SOCKET_AUDIT_2026-10.md).
 * 상태가 인메모리 Map 뿐이라 배포(재시작)하면 진행 중이던 판이 사라지고 모달이 멈췄다.
 */

function makeState(over: Partial<RpsState> = {}): RpsState {
  return {
    matchId: "match-1",
    teamAId: "team-a",
    teamBId: "team-b",
    captainAId: "cap-a",
    captainBId: "cap-b",
    captainAIsBot: false,
    captainBIsBot: false,
    hostId: "host-1",
    phase: "throw",
    submissions: new Map(),
    gameNumber: 1,
    ...over,
  };
}

function build(opts: { redisValue?: string | null; withRedis?: boolean } = {}) {
  const matchService = {
    findById: jest
      .fn()
      .mockResolvedValue({ roomId: "room-1", status: "PENDING" }),
    getRpsContext: jest.fn(),
    setBlueSide: jest.fn().mockResolvedValue(undefined),
    startMatch: jest.fn().mockResolvedValue({ tournamentCode: null }),
  };
  const redis = {
    get: jest.fn().mockResolvedValue(opts.redisValue ?? null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    checkRateLimit: jest
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 9, resetIn: 10 }),
  };
  const gateway = new MatchGateway(
    {} as any,
    matchService as any,
    {} as any,
    {} as any,
    opts.withRedis === false ? undefined : (redis as any),
  );
  const emit = jest.fn();
  (gateway as any).server = { to: jest.fn().mockReturnValue({ emit }) };
  (gateway as any).emitMatchStarted = jest.fn().mockResolvedValue(undefined);
  return { gateway: gateway as any, matchService, redis, emit };
}

const client = (userId: string) =>
  ({ id: `sock-${userId}`, userId, join: jest.fn(), emit: jest.fn() }) as any;

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("RPS 상태 직렬화", () => {
  it("제출 내용(Map)을 보존한다", () => {
    const state = makeState({
      submissions: new Map([
        ["cap-a", "rock"],
        ["cap-b", "paper"],
      ]),
    });

    const restored = deserializeRps(serializeRps(state))!;

    expect(restored.submissions).toBeInstanceOf(Map);
    expect(restored.submissions.get("cap-a")).toBe("rock");
    expect(restored.submissions.get("cap-b")).toBe("paper");
    expect(restored.captainAId).toBe("cap-a");
    expect(restored.phase).toBe("throw");
  });

  it("진영 선택 단계의 승자·세트 번호도 보존한다", () => {
    const state = makeState({
      phase: "side",
      winnerTeamId: "team-b",
      gameNumber: 2,
    });

    const restored = deserializeRps(serializeRps(state))!;

    expect(restored).toMatchObject({
      phase: "side",
      winnerTeamId: "team-b",
      gameNumber: 2,
    });
  });

  it.each([
    ["JSON 이 아님", "{not json"],
    ["빈 값", ""],
    ["null", "null"],
    ["matchId 없음", JSON.stringify({ phase: "throw", submissions: [] })],
    [
      "알 수 없는 단계",
      JSON.stringify({ matchId: "m", phase: "weird", submissions: [] }),
    ],
    [
      "제출이 배열이 아님",
      JSON.stringify({ matchId: "m", phase: "throw", submissions: {} }),
    ],
    [
      "알 수 없는 손",
      JSON.stringify({
        matchId: "m",
        phase: "throw",
        submissions: [["cap-a", "lizard"]],
      }),
    ],
  ])("손상된 값은 null: %s", (_name, raw) => {
    expect(deserializeRps(raw)).toBeNull();
  });
});

describe("RPS 상태 저장", () => {
  it("상태가 바뀌어 알릴 때마다 Redis 에 저장한다", () => {
    const { gateway, redis } = build();

    gateway.broadcastRpsState(makeState());

    expect(redis.set).toHaveBeenCalledWith(
      "rps:state:match-1",
      expect.stringContaining('"phase":"throw"'),
      expect.any(Number),
    );
  });

  it("진영이 확정되면(done) 저장본을 지운다 — 진영은 DB 가 사실이다", () => {
    const { gateway, redis } = build();

    gateway.broadcastRpsState(makeState({ phase: "done" }));

    expect(redis.del).toHaveBeenCalledWith("rps:state:match-1");
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("Redis 저장이 실패해도 진행은 막히지 않는다", async () => {
    const { gateway, redis, emit } = build();
    redis.set.mockRejectedValue(new Error("redis down"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => gateway.broadcastRpsState(makeState())).not.toThrow();
    await Promise.resolve();

    expect(emit).toHaveBeenCalledWith("rps:state", expect.anything());
  });

  it("Redis 가 없는 환경에서도 알림은 나간다", () => {
    const { gateway, emit } = build({ withRedis: false });

    gateway.broadcastRpsState(makeState());

    expect(emit).toHaveBeenCalledWith("rps:state", expect.anything());
  });
});

describe("RPS 상태 복원", () => {
  it("제출 단계: 복원하고 제출 타이머와 봇 진행을 다시 시작한다", async () => {
    const saved = makeState({ submissions: new Map([["cap-a", "rock"]]) });
    const { gateway, redis } = build({ redisValue: serializeRps(saved) });
    const arm = jest
      .spyOn(gateway, "armRpsThrowTimeout")
      .mockImplementation(() => undefined);
    const bots = jest
      .spyOn(gateway, "autoAdvanceBotRpsThrow")
      .mockResolvedValue(undefined);

    const restored = await gateway.restoreRps("match-1");

    expect(redis.get).toHaveBeenCalledWith("rps:state:match-1");
    expect(restored.submissions.get("cap-a")).toBe("rock");
    expect(gateway.rpsStates.get("match-1")).toBe(restored);
    expect(arm).toHaveBeenCalledWith("match-1");
    expect(bots).toHaveBeenCalledWith("match-1");
  });

  it("진영 선택 단계: 복원하고 진영 선택 단계를 다시 시작한다", async () => {
    const saved = makeState({ phase: "side", winnerTeamId: "team-a" });
    const { gateway } = build({ redisValue: serializeRps(saved) });
    const begin = jest
      .spyOn(gateway, "beginSidePhase")
      .mockResolvedValue(undefined);

    await gateway.restoreRps("match-1");

    expect(begin).toHaveBeenCalledWith("match-1");
  });

  it("이미 메모리에 있으면 Redis 를 읽지 않는다", async () => {
    const { gateway, redis } = build();
    const live = makeState();
    gateway.rpsStates.set("match-1", live);

    await expect(gateway.restoreRps("match-1")).resolves.toBe(live);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("저장본이 없으면 undefined", async () => {
    const { gateway } = build({ redisValue: null });

    await expect(gateway.restoreRps("match-1")).resolves.toBeUndefined();
    expect(gateway.rpsStates.has("match-1")).toBe(false);
  });

  it("손상된 값·다른 매치 값·끝난 판은 복원하지 않는다", async () => {
    for (const raw of [
      "{not json",
      serializeRps(makeState({ matchId: "other" })),
      serializeRps(makeState({ phase: "done" })),
    ]) {
      const { gateway } = build({ redisValue: raw });
      await expect(gateway.restoreRps("match-1")).resolves.toBeUndefined();
      expect(gateway.rpsStates.has("match-1")).toBe(false);
    }
  });

  it("Redis 조회가 실패해도 던지지 않는다", async () => {
    const { gateway, redis } = build();
    redis.get.mockRejectedValue(new Error("redis down"));
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(gateway.restoreRps("match-1")).resolves.toBeUndefined();
  });

  it("Redis 가 없으면 복원하지 않는다", async () => {
    const { gateway } = build({ withRedis: false });

    await expect(gateway.restoreRps("match-1")).resolves.toBeUndefined();
  });

  it("같은 매치를 동시에 복원해도 한 번만 읽고 타이머도 한 번만 건다", async () => {
    const { gateway, redis } = build({ redisValue: serializeRps(makeState()) });
    const arm = jest
      .spyOn(gateway, "armRpsThrowTimeout")
      .mockImplementation(() => undefined);
    jest.spyOn(gateway, "autoAdvanceBotRpsThrow").mockResolvedValue(undefined);

    const [a, b] = await Promise.all([
      gateway.restoreRps("match-1"),
      gateway.restoreRps("match-1"),
    ]);

    expect(a).toBe(b);
    expect(redis.get).toHaveBeenCalledTimes(1);
    expect(arm).toHaveBeenCalledTimes(1);
  });
});

describe("재시작 뒤 핸들러가 Redis 에서 이어받는다", () => {
  it("join-match: 복원한 상태를 입장한 클라이언트에 보내고 준비 흐름을 새로 시작하지 않는다", async () => {
    const saved = makeState({ submissions: new Map([["cap-a", "rock"]]) });
    const { gateway, matchService } = build({
      redisValue: serializeRps(saved),
    });
    jest
      .spyOn(gateway, "armRpsThrowTimeout")
      .mockImplementation(() => undefined);
    jest.spyOn(gateway, "autoAdvanceBotRpsThrow").mockResolvedValue(undefined);
    const c = client("cap-b");

    const result = await gateway.handleJoinMatch(c, { matchId: "match-1" });

    expect(result).toMatchObject({ success: true });
    expect(c.emit).toHaveBeenCalledWith(
      "rps:state",
      expect.objectContaining({ phase: "throw", submitted: ["cap-a"] }),
    );
    // 이미 진행 중인 판이 있으니 준비 흐름(getRpsContext)을 다시 타지 않는다.
    expect(matchService.getRpsContext).not.toHaveBeenCalled();
  });

  it("join-match: 이미 시작된 매치는 복원하지 않는다", async () => {
    const { gateway, redis, matchService } = build({
      redisValue: serializeRps(makeState()),
    });
    matchService.findById.mockResolvedValue({
      roomId: "room-1",
      status: "IN_PROGRESS",
    });

    await gateway.handleJoinMatch(client("cap-b"), { matchId: "match-1" });

    expect(redis.get).not.toHaveBeenCalled();
  });

  it("rps:submit: 재시작 뒤 첫 제출도 받고 다시 저장한다", async () => {
    const { gateway, redis } = build({ redisValue: serializeRps(makeState()) });
    jest
      .spyOn(gateway, "armRpsThrowTimeout")
      .mockImplementation(() => undefined);
    jest.spyOn(gateway, "autoAdvanceBotRpsThrow").mockResolvedValue(undefined);

    const result = await gateway.handleRpsSubmit(client("cap-a"), {
      matchId: "match-1",
      hand: "rock",
    });

    expect(result).toEqual({ success: true });
    const saved = redis.set.mock.calls
      .map((c: any[]) => JSON.parse(c[1]))
      .find((s: any) => s.submissions.length === 1);
    expect(saved.submissions).toEqual([["cap-a", "rock"]]);
  });

  it("rps:submit: 저장본이 없으면 예전처럼 '제출 단계가 아닙니다'", async () => {
    const { gateway } = build({ redisValue: null });

    const result = await gateway.handleRpsSubmit(client("cap-a"), {
      matchId: "match-1",
      hand: "rock",
    });

    expect(result).toEqual({ success: false, error: "제출 단계가 아닙니다." });
  });

  it("rps:choose-side: 재시작 뒤에도 승자 팀장이 진영을 고르면 확정된다", async () => {
    const saved = makeState({ phase: "side", winnerTeamId: "team-a" });
    const { gateway, matchService, redis } = build({
      redisValue: serializeRps(saved),
    });

    const result = await gateway.handleRpsChooseSide(client("cap-a"), {
      matchId: "match-1",
      side: "blue",
    });

    expect(result).toEqual({ success: true });
    expect(matchService.setBlueSide).toHaveBeenCalledWith("match-1", "team-a");
    // 확정되면 저장본을 지운다
    expect(redis.del).toHaveBeenCalledWith("rps:state:match-1");
  });

  it("rps:choose-side: 승자가 아닌 팀장은 복원된 상태에서도 거부된다", async () => {
    const saved = makeState({ phase: "side", winnerTeamId: "team-a" });
    const { gateway, matchService } = build({
      redisValue: serializeRps(saved),
    });

    const result = await gateway.handleRpsChooseSide(client("cap-b"), {
      matchId: "match-1",
      side: "red",
    });

    expect(result).toMatchObject({ success: false });
    expect(matchService.setBlueSide).not.toHaveBeenCalled();
  });

  it("rps:start: 복원할 수 있는 판이 있으면 새로 만들지 않는다", async () => {
    const { gateway, matchService } = build({
      redisValue: serializeRps(makeState()),
    });
    jest
      .spyOn(gateway, "armRpsThrowTimeout")
      .mockImplementation(() => undefined);
    jest.spyOn(gateway, "autoAdvanceBotRpsThrow").mockResolvedValue(undefined);

    const result = await gateway.handleRpsStart(client("host-1"), {
      matchId: "match-1",
    });

    expect(result).toEqual({ success: true, alreadyRunning: true });
    expect(matchService.getRpsContext).not.toHaveBeenCalled();
  });
});
