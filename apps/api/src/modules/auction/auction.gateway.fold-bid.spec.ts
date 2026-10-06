import { AuctionGateway } from "./auction.gateway";

/**
 * 상대가 먼저 입찰을 포기한 뒤 내가 입찰하면 바로 낙찰돼 다음 매물로 넘어가야 한다
 * (2026-10-06 제보). 예전에는 마감 판정이 포기할 때만 돌아서, 이 순서에서는 입찰로
 * 연장된 타이머가 끝날 때까지 기다렸다.
 */
function bare(overrides: Record<string, unknown> = {}) {
  const emit = jest.fn();
  const gateway: any = Object.assign(Object.create(AuctionGateway.prototype), {
    server: { to: jest.fn().mockReturnValue({ emit }) },
    redisService: {
      checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
    },
    resolvingRooms: new Set<string>(),
    bidRateLimits: new Map(),
    auctionService: {
      isSpectator: jest.fn().mockResolvedValue(false),
      placeBid: jest.fn().mockResolvedValue({
        currentHighestBidder: "team-1",
        timerEnd: Date.now() + 30_000,
      }),
      closeIfOthersFolded: jest.fn().mockResolvedValue(false),
    },
    ...overrides,
  });
  // 락은 그냥 실행만 한다
  gateway._withRoomBidLock = jest.fn((_room: string, fn: () => unknown) =>
    fn(),
  );
  gateway._closeFoldedItem = jest.fn();
  gateway._scheduleBidResolve = jest.fn();
  return { gateway, emit };
}

const client: any = { userId: "captain-1", username: "팀장1", id: "s1" };

describe("입찰 직후 포기 정족수 판정", () => {
  it("다른 팀이 모두 포기한 상태면 입찰 즉시 마감한다 (타이머를 기다리지 않는다)", async () => {
    const { gateway, emit } = bare();
    gateway.auctionService.closeIfOthersFolded.mockResolvedValue(true);

    const res = await gateway.handleBid(client, { roomId: "r1", amount: 100 });

    expect(res).toMatchObject({ success: true });
    expect(emit).toHaveBeenCalledWith("bid-placed", expect.any(Object));
    expect(gateway._closeFoldedItem).toHaveBeenCalledWith("r1");
    expect(gateway._scheduleBidResolve).not.toHaveBeenCalled();
  });

  it("경쟁 팀이 남아 있으면 평소처럼 마감 타이머를 건다", async () => {
    const { gateway } = bare();

    await gateway.handleBid(client, { roomId: "r1", amount: 100 });

    expect(gateway._closeFoldedItem).not.toHaveBeenCalled();
    expect(gateway._scheduleBidResolve).toHaveBeenCalledWith(
      "r1",
      expect.any(Number),
    );
  });

  it("판정은 입찰과 같은 락 안에서 한다 — 사이에 다른 입찰이 끼지 않게", async () => {
    const { gateway } = bare();
    const order: string[] = [];
    gateway._withRoomBidLock = jest.fn(
      async (_r: string, fn: () => unknown) => {
        order.push("lock-start");
        const out = await fn();
        order.push("lock-end");
        return out;
      },
    );
    gateway.auctionService.placeBid.mockImplementation(async () => {
      order.push("placeBid");
      return { currentHighestBidder: "team-1", timerEnd: Date.now() };
    });
    gateway.auctionService.closeIfOthersFolded.mockImplementation(async () => {
      order.push("closeCheck");
      return false;
    });

    await gateway.handleBid(client, { roomId: "r1", amount: 100 });

    expect(order).toEqual(["lock-start", "placeBid", "closeCheck", "lock-end"]);
  });

  it("입찰이 실패하면 마감 판정도 하지 않는다", async () => {
    const { gateway } = bare();
    gateway.auctionService.placeBid.mockRejectedValue(
      new Error("이번 매물 입찰을 포기했습니다."),
    );

    const res = await gateway.handleBid(client, { roomId: "r1", amount: 100 });

    expect(res).toEqual({ error: "이번 매물 입찰을 포기했습니다." });
    expect(gateway.auctionService.closeIfOthersFolded).not.toHaveBeenCalled();
    expect(gateway._closeFoldedItem).not.toHaveBeenCalled();
  });
});
