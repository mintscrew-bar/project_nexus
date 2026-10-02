import { ClanGateway } from "./clan.gateway";

/**
 * 클랜 소켓은 게임과 무관하게 클랜 ID 로 멤버를 확인한다.
 * 예전엔 getUserClan(userId) 가 게임을 안 받으면 롤로 조회해서 배그 클랜 멤버는
 * join-clan-chat 이 거부됐고, 메시지는 DB 에 저장되지만 방에 아무도 없어 아무에게도
 * 전달되지 않았다(2026-10-02 점검, docs/status/SOCKET_AUDIT_2026-10.md 후속).
 */

function build(memberOf: string[] = []) {
  const clanService = {
    getUserClanIds: jest.fn().mockResolvedValue(memberOf),
    isClanMember: jest
      .fn()
      .mockImplementation((_userId: string, clanId: string) =>
        Promise.resolve(memberOf.includes(clanId)),
      ),
    getChatMessages: jest.fn().mockResolvedValue({ messages: [] }),
    sendChatMessage: jest.fn().mockResolvedValue({ id: "msg-1" }),
  };
  const authService = {
    validateToken: jest
      .fn()
      .mockResolvedValue({ sub: "user-1", username: "tester" }),
  };
  const redis = {
    checkRateLimit: jest
      .fn()
      .mockResolvedValue({ allowed: true, remaining: 9, resetIn: 10 }),
  };
  const gateway = new ClanGateway(
    authService as any,
    clanService as any,
    redis as any,
  );
  const emit = jest.fn();
  (gateway as any).server = { to: jest.fn().mockReturnValue({ emit }) };
  return { gateway, clanService, authService, emit };
}

const socket = (over: Record<string, unknown> = {}) =>
  ({
    id: "sock-1",
    userId: "user-1",
    username: "tester",
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    handshake: { auth: { token: "jwt" }, headers: {} },
    ...over,
  }) as any;

afterEach(() => jest.clearAllTimers());

describe("연결 시 클랜 방 자동 입장", () => {
  it("롤 클랜과 배그 클랜에 모두 속하면 두 방에 입장한다", async () => {
    const { gateway } = build(["lol-clan", "pubg-clan"]);
    const client = socket({ userId: undefined });

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith("clan:lol-clan");
    expect(client.join).toHaveBeenCalledWith("clan:pubg-clan");
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("배그 클랜에만 속해도 입장한다", async () => {
    const { gateway } = build(["pubg-clan"]);
    const client = socket({ userId: undefined });

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith("clan:pubg-clan");
  });

  it("클랜이 없으면 어느 방에도 입장하지 않는다", async () => {
    const { gateway } = build([]);
    const client = socket({ userId: undefined });

    await gateway.handleConnection(client);

    expect(client.join).not.toHaveBeenCalled();
  });

  it("토큰이 없으면 끊는다", async () => {
    const { gateway } = build(["lol-clan"]);
    const client = socket({
      userId: undefined,
      handshake: { auth: {}, headers: {} },
    });

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });
});

describe("join-clan-chat", () => {
  it("배그 클랜 멤버도 채팅방에 들어가 기록을 받는다", async () => {
    const { gateway, clanService } = build(["pubg-clan"]);
    const client = socket();

    const result = await gateway.handleJoinClanChat(client, {
      clanId: "pubg-clan",
    });

    expect(result).toMatchObject({ success: true });
    expect(client.join).toHaveBeenCalledWith("clan:pubg-clan");
    expect(clanService.isClanMember).toHaveBeenCalledWith(
      "user-1",
      "pubg-clan",
    );
    expect(clanService.getChatMessages).toHaveBeenCalled();
  });

  it("양쪽 클랜에 속한 사람은 두 클랜 채팅 모두에 들어간다", async () => {
    const { gateway } = build(["lol-clan", "pubg-clan"]);
    const client = socket();

    await gateway.handleJoinClanChat(client, { clanId: "lol-clan" });
    await gateway.handleJoinClanChat(client, { clanId: "pubg-clan" });

    expect(client.join).toHaveBeenCalledWith("clan:lol-clan");
    expect(client.join).toHaveBeenCalledWith("clan:pubg-clan");
  });

  it("멤버가 아닌 클랜은 거부하고 방에 넣지 않는다", async () => {
    const { gateway, clanService } = build(["lol-clan"]);
    const client = socket();

    const result = await gateway.handleJoinClanChat(client, {
      clanId: "pubg-clan",
    });

    expect(result).toEqual({ error: "Unauthorized to join this clan chat" });
    expect(client.join).not.toHaveBeenCalled();
    expect(clanService.getChatMessages).not.toHaveBeenCalled();
  });

  it("로그인 정보가 없는 소켓은 거부한다", async () => {
    const { gateway, clanService } = build(["lol-clan"]);

    const result = await gateway.handleJoinClanChat(
      socket({ userId: undefined }),
      { clanId: "lol-clan" },
    );

    expect(result).toEqual({ error: "Unauthorized to join this clan chat" });
    expect(clanService.isClanMember).not.toHaveBeenCalled();
  });
});

describe("leave-clan-chat", () => {
  it("멤버가 나가면 방에서 뺀다", async () => {
    const { gateway } = build(["pubg-clan"]);
    const client = socket();

    await gateway.handleLeaveClanChat(client, { clanId: "pubg-clan" });

    expect(client.leave).toHaveBeenCalledWith("clan:pubg-clan");
  });

  it("멤버가 아니면 거부한다", async () => {
    const { gateway } = build(["lol-clan"]);
    const client = socket();

    const result = await gateway.handleLeaveClanChat(client, {
      clanId: "pubg-clan",
    });

    expect(result).toEqual({ error: "Unauthorized to leave this clan chat" });
    expect(client.leave).not.toHaveBeenCalled();
  });
});

describe("is-typing", () => {
  it("배그 클랜 멤버의 타이핑 표시가 클랜 방에 전달된다", async () => {
    jest.useFakeTimers();
    const { gateway, emit } = build(["pubg-clan"]);

    await gateway.handleIsTyping(socket(), {
      clanId: "pubg-clan",
      isTyping: true,
    });

    expect(emit).toHaveBeenCalledWith("user-typing", {
      userId: "user-1",
      username: "tester",
    });
    jest.useRealTimers();
  });

  it("멤버가 아니면 타이핑을 방송하지 않는다", async () => {
    const { gateway, emit } = build(["lol-clan"]);

    const result = await gateway.handleIsTyping(socket(), {
      clanId: "pubg-clan",
      isTyping: true,
    });

    expect(result).toEqual({
      error: "Unauthorized to send typing events in this clan",
    });
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("연결 해제", () => {
  it("속한 모든 클랜에서 타이핑 상태를 정리한다", async () => {
    jest.useFakeTimers();
    const { gateway, emit } = build(["lol-clan", "pubg-clan"]);
    const client = socket();
    await gateway.handleIsTyping(client, {
      clanId: "lol-clan",
      isTyping: true,
    });
    await gateway.handleIsTyping(client, {
      clanId: "pubg-clan",
      isTyping: true,
    });
    emit.mockClear();

    gateway.handleDisconnect(client);
    await Promise.resolve();
    await Promise.resolve();

    const stopped = emit.mock.calls.filter(
      (call) => call[0] === "user-stopped-typing",
    );
    expect(stopped).toHaveLength(2);
    jest.useRealTimers();
  });
});
