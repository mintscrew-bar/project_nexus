import { AuctionGateway } from "./auction.gateway";

/**
 * 경매 종료 뒤 역할 선택 시작 실패 → 호스트 수동 재시도 흐름.
 * 소켓 점검 H1(docs/status/SOCKET_AUDIT_2026-10.md):
 * 예전엔 재시도가 또 실패해도 `success: true` 를 돌려줘서 클라이언트가 오류 표시를 지웠다.
 */
describe("AuctionGateway retry-role-selection", () => {
  const roomId = "room-1";

  function build(opts: {
    isHost: boolean;
    advance: jest.Mock;
    status?: string | null;
  }) {
    const auctionService = {
      isRoomHost: jest.fn().mockResolvedValue(opts.isHost),
    };
    const roleSelectionGateway = {
      advanceAfterTeams: opts.advance,
      emitRoleSelectionError: jest.fn(),
    };
    const prisma = {
      room: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.status === null
              ? null
              : { status: opts.status ?? "DRAFT_COMPLETED" },
          ),
      },
    };
    const gateway = new AuctionGateway(
      {} as any,
      auctionService as any,
      {} as any,
      roleSelectionGateway as any,
      prisma as any,
    );
    const emit = jest.fn();
    (gateway as any).server = { to: jest.fn().mockReturnValue({ emit }) };
    // 재시도 사이 500ms 대기를 없앤다.
    jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as any;
    }) as any);
    return { gateway, emit, roleSelectionGateway, auctionService, prisma };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const client = { userId: "host-1" } as any;

  it("호스트가 아니면 거부하고 역할 선택을 시도하지 않는다", async () => {
    const advance = jest.fn();
    const { gateway } = build({ isHost: false, advance });

    const result = await gateway.handleRetryRoleSelection(client, { roomId });

    expect(result).toEqual({
      error: "호스트만 역할 선택을 재시작할 수 있습니다.",
      retryable: false,
    });
    expect(advance).not.toHaveBeenCalled();
  });

  it("로그인하지 않았으면 거부한다", async () => {
    const { gateway } = build({ isHost: true, advance: jest.fn() });

    const result = await gateway.handleRetryRoleSelection({} as any, {
      roomId,
    });

    expect(result).toEqual({ error: "Unauthorized" });
  });

  it("시작에 성공하면 success 를 돌려주고 오류를 방송하지 않는다", async () => {
    const advance = jest.fn().mockResolvedValue(undefined);
    const { gateway, emit } = build({ isHost: true, advance });

    const result = await gateway.handleRetryRoleSelection(client, { roomId });

    expect(result).toEqual({ success: true });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalledWith("auction-error", expect.anything());
    // 오류 배너가 떠 있던 사람들이 이동을 재개하도록 해소를 알린다.
    expect(emit).toHaveBeenCalledWith("auction-error-cleared", { roomId });
  });

  it("재시도가 모두 실패하면 error 를 돌려주고 retryable 오류를 방송한다", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const advance = jest.fn().mockRejectedValue(new Error("boom"));
    const { gateway, emit, roleSelectionGateway } = build({
      isHost: true,
      advance,
    });

    const result = await gateway.handleRetryRoleSelection(client, { roomId });

    // 서버 내부 재시도 3회
    expect(advance).toHaveBeenCalledTimes(3);
    // 클라이언트가 오류 표시를 지우지 않도록 success 가 아니어야 한다.
    expect(result).toEqual({
      error: "역할 선택을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.",
      retryable: true,
    });
    expect(emit).not.toHaveBeenCalledWith(
      "auction-error-cleared",
      expect.anything(),
    );
    expect(emit).toHaveBeenCalledWith(
      "auction-error",
      expect.objectContaining({ retryable: true }),
    );
    expect(roleSelectionGateway.emitRoleSelectionError).toHaveBeenCalledWith(
      roomId,
      expect.objectContaining({ retryable: true }),
    );
  });

  it("두 번째 시도에서 성공하면 오류를 방송하지 않는다", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const advance = jest
      .fn()
      .mockRejectedValueOnce(new Error("일시 오류"))
      .mockResolvedValueOnce(undefined);
    const { gateway, emit } = build({ isHost: true, advance });

    const result = await gateway.handleRetryRoleSelection(client, { roomId });

    expect(result).toEqual({ success: true });
    expect(advance).toHaveBeenCalledTimes(2);
    expect(emit).not.toHaveBeenCalledWith("auction-error", expect.anything());
  });

  it.each(["ROLE_SELECTION", "IN_PROGRESS", "COMPLETED"])(
    "이미 %s 단계면 다시 시작하지 않고 성공으로 알린다(더블클릭·유실된 응답)",
    async (status) => {
      const advance = jest.fn().mockRejectedValue(new Error("이미 시작됨"));
      const { gateway, emit } = build({ isHost: true, advance, status });

      const result = await gateway.handleRetryRoleSelection(client, {
        roomId,
      });

      expect(result).toEqual({ success: true, alreadyStarted: true });
      // 3번 실패해 전원에게 오류를 다시 방송하던 것이 리뷰에서 나온 결함이었다.
      expect(advance).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalledWith("auction-error", expect.anything());
      expect(emit).toHaveBeenCalledWith("auction-error-cleared", { roomId });
    },
  );

  it.each(["WAITING", "TEAM_SELECTION", "DRAFT"])(
    "아직 %s 단계면 재시도할 수 없다고 알린다",
    async (status) => {
      const advance = jest.fn();
      const { gateway } = build({ isHost: true, advance, status });

      const result = await gateway.handleRetryRoleSelection(client, {
        roomId,
      });

      expect(result).toEqual({
        error: "역할 선택을 시작할 수 있는 단계가 아닙니다.",
        retryable: false,
      });
      expect(advance).not.toHaveBeenCalled();
    },
  );

  it("방이 없으면 재시도 불가로 알린다", async () => {
    const advance = jest.fn();
    const { gateway } = build({ isHost: true, advance, status: null });

    const result = await gateway.handleRetryRoleSelection(client, { roomId });

    expect(result).toEqual({
      error: "방을 찾을 수 없습니다.",
      retryable: false,
    });
    expect(advance).not.toHaveBeenCalled();
  });
});
