import { AuctionGateway } from "../../modules/auction/auction.gateway";
import { MatchGateway } from "../../modules/match/match.gateway";
import { PresenceGateway } from "../../modules/presence/presence.gateway";
import { RoleSelectionGateway } from "../../modules/role-selection/role-selection.gateway";
import { RoomGateway } from "../../modules/room/room.gateway";
import {
  ACTION_RATE_LIMITS,
  actionRateLimitMessage,
  guardAction,
} from "./chat-rate-limit";

/**
 * 채팅이 아닌 쓰기 이벤트의 소켓 레이트 리밋 (소켓 점검 M5,
 * docs/status/SOCKET_AUDIT_2026-10.md). 경매 입찰·드래프트 픽·채팅 외에는 한도가 없어
 * 한 소켓이 초당 수백 번 보내도 막을 곳이 없었다.
 */

const blockedRedis = (resetIn = 7) => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ allowed: false, remaining: 0, resetIn }),
});
const allowedRedis = () => ({
  checkRateLimit: jest
    .fn()
    .mockResolvedValue({ allowed: true, remaining: 5, resetIn: 10 }),
});

describe("guardAction", () => {
  it("한도 안이면 null 을 돌려준다", async () => {
    await expect(
      guardAction(allowedRedis(), "room", "user-1"),
    ).resolves.toBeNull();
  });

  it("한도를 넘으면 남은 시간이 들어간 안내 문구를 돌려준다", async () => {
    await expect(guardAction(blockedRedis(7), "room", "user-1")).resolves.toBe(
      actionRateLimitMessage(7),
    );
    expect(actionRateLimitMessage(7)).toContain("7초");
  });

  it("남은 시간이 0 이어도 '0초'라고 안내하지 않는다", () => {
    expect(actionRateLimitMessage(0)).toContain("1초");
  });

  it("키는 그룹과 유저로 묶고 그룹별 한도를 쓴다", async () => {
    const redis = allowedRedis();

    await guardAction(redis, "rps", "user-9");

    expect(redis.checkRateLimit).toHaveBeenCalledWith(
      "ws:action:rps:user-9",
      ACTION_RATE_LIMITS.rps.limit,
      ACTION_RATE_LIMITS.rps.windowSeconds,
    );
  });

  it("다른 유저는 서로의 한도를 쓰지 않는다", async () => {
    const redis = allowedRedis();

    await guardAction(redis, "room", "user-1");
    await guardAction(redis, "room", "user-2");

    const keys = redis.checkRateLimit.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(2);
  });

  it("Redis 가 없거나 실패하면 통과시킨다 (남용 방지 장치지 정합성 장치가 아니다)", async () => {
    await expect(guardAction(undefined, "room", "u")).resolves.toBeNull();
    await expect(guardAction(null, "room", "u")).resolves.toBeNull();
    const broken = {
      checkRateLimit: jest.fn().mockRejectedValue(new Error("redis down")),
    };
    await expect(guardAction(broken, "room", "u")).resolves.toBeNull();
  });
});

/**
 * 게이트웨이마다 한도를 넘으면 서비스 호출 전에 막히는지 확인한다.
 * 생성자 의존성이 많아 prototype 에 필요한 필드만 붙여 쓴다.
 */
function bare<T extends object>(cls: { prototype: T }, fields: object): T {
  return Object.assign(Object.create(cls.prototype), fields);
}

const client = { id: "sock-1", userId: "user-1" } as any;

describe("게이트웨이 쓰기 이벤트 레이트 리밋", () => {
  it("방: toggle-ready 가 한도를 넘으면 서비스를 부르지 않는다", async () => {
    const roomService = { toggleReady: jest.fn() };
    const redis = blockedRedis();
    const gateway: any = bare(RoomGateway, {
      redisService: redis,
      roomService,
    });

    const result = await gateway.handleToggleReady(client, { roomId: "r1" });

    expect(result).toEqual({ error: actionRateLimitMessage(7) });
    expect(roomService.toggleReady).not.toHaveBeenCalled();
    expect(redis.checkRateLimit.mock.calls[0][0]).toBe("ws:action:room:user-1");
  });

  it("방: 한도 안이면 평소처럼 동작한다", async () => {
    const roomService = {
      toggleReady: jest.fn().mockResolvedValue({ isReady: true }),
      checkAllReady: jest.fn().mockResolvedValue(false),
    };
    const gateway: any = bare(RoomGateway, {
      redisService: allowedRedis(),
      roomService,
      server: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) },
    });

    const result = await gateway.handleToggleReady(client, { roomId: "r1" });

    expect(roomService.toggleReady).toHaveBeenCalled();
    expect(result).toMatchObject({ success: true, isReady: true });
  });

  it("방: 이벤트를 번갈아 보내도 같은 한도를 센다", async () => {
    const redis = blockedRedis();
    const gateway: any = bare(RoomGateway, {
      redisService: redis,
      roomService: {},
    });

    await gateway.handleToggleReady(client, { roomId: "r1" });
    await gateway.handleAutoBalanceSwap(client, {
      roomId: "r1",
      userIdA: "a",
      userIdB: "b",
    });

    const keys = redis.checkRateLimit.mock.calls.map((c: any[]) => c[0]);
    expect(new Set(keys)).toEqual(new Set(["ws:action:room:user-1"]));
  });

  it("역할 선택: select-role 이 한도를 넘으면 서비스를 부르지 않는다", async () => {
    const roleSelectionService = { selectRole: jest.fn() };
    const gateway: any = bare(RoleSelectionGateway, {
      redisService: blockedRedis(),
      roleSelectionService,
    });

    const result = await gateway.handleSelectRole(client, {
      roomId: "r1",
      role: "TOP",
    });

    expect(result).toEqual({ error: actionRateLimitMessage(7) });
    expect(roleSelectionService.selectRole).not.toHaveBeenCalled();
  });

  it("가위바위보: rps:start 가 한도를 넘으면 success:false 로 막는다", async () => {
    const matchService = { getRpsContext: jest.fn() };
    const gateway: any = bare(MatchGateway, {
      redisService: blockedRedis(),
      matchService,
      rpsStates: new Map(),
    });

    const result = await gateway.handleRpsStart(client, { matchId: "m1" });

    expect(result).toEqual({
      success: false,
      error: actionRateLimitMessage(7),
    });
    expect(matchService.getRpsContext).not.toHaveBeenCalled();
  });

  it("가위바위보: rps:submit 도 같은 한도를 쓴다", async () => {
    const redis = blockedRedis();
    const gateway: any = bare(MatchGateway, {
      redisService: redis,
      rpsStates: new Map(),
    });

    const result = await gateway.handleRpsSubmit(client, {
      matchId: "m1",
      hand: "rock",
    });

    expect(result).toMatchObject({ success: false });
    expect(redis.checkRateLimit.mock.calls[0][0]).toBe("ws:action:rps:user-1");
  });

  it("프레즌스: set-status 가 한도를 넘으면 상태를 바꾸지 않는다", async () => {
    const presenceService = { updateStatus: jest.fn() };
    const gateway: any = bare(PresenceGateway, {
      redisService: blockedRedis(),
      presenceService,
    });

    const result = await gateway.handleSetStatus(client, { status: "AWAY" });

    expect(result).toEqual({
      success: false,
      error: actionRateLimitMessage(7),
    });
    expect(presenceService.updateStatus).not.toHaveBeenCalled();
  });

  it("경매: vote-item-skip 이 한도를 넘으면 서비스를 부르지 않는다", async () => {
    const auctionService = { voteItemSkip: jest.fn() };
    const gateway: any = bare(AuctionGateway, {
      redisService: blockedRedis(),
      auctionService,
    });

    const result = await gateway.handleVoteItemSkip(client, { roomId: "r1" });

    expect(result).toEqual({ error: actionRateLimitMessage(7) });
    expect(auctionService.voteItemSkip).not.toHaveBeenCalled();
  });

  it("Redis 가 주입되지 않은 환경에서도 핸들러가 동작한다", async () => {
    const roleSelectionService = {
      selectRole: jest.fn().mockRejectedValue(new Error("service reached")),
    };
    const gateway: any = bare(RoleSelectionGateway, {
      redisService: undefined,
      roleSelectionService,
    });

    const result = await gateway.handleSelectRole(client, {
      roomId: "r1",
      role: "TOP",
    });

    expect(roleSelectionService.selectRole).toHaveBeenCalled();
    expect(result).toEqual({ error: "service reached" });
  });
});
