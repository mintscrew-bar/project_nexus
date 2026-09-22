import {
  RoomInviteService,
  parseStoredInvite,
  roomInviteKey,
} from "./room-invite.service";

/**
 * 친구 내전 초대 — 누가 누구를 부를 수 있는지, 받은 목록에서 무엇이 빠지는지.
 */
describe("RoomInviteService", () => {
  const waitingRoom = (overrides: Record<string, any> = {}) => ({
    id: "room-1",
    name: "금요 내전",
    gameTitle: "LOL",
    pubgPlatform: null,
    status: "WAITING",
    maxParticipants: 10,
    allowSpectators: true,
    participants: [{ userId: "host", role: "PLAYER" }],
    ...overrides,
  });

  const setup = (
    opts: { room?: any; friends?: boolean; hits?: number } = {},
  ) => {
    const hash = new Map<string, Map<string, string>>();
    const redis = {
      incr: jest.fn().mockResolvedValue(opts.hits ?? 1),
      expire: jest.fn().mockResolvedValue(undefined),
      hset: jest.fn(async (key: string, field: string, value: string) => {
        if (!hash.has(key)) hash.set(key, new Map());
        hash.get(key)!.set(field, value);
      }),
      hgetall: jest.fn(async (key: string) =>
        Object.fromEntries(hash.get(key) ?? new Map()),
      ),
      hdel: jest.fn(async (key: string, field: string) => {
        hash.get(key)?.delete(field);
      }),
    };
    const prisma = {
      room: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.room === undefined ? waitingRoom() : opts.room,
          ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      friendship: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.friends === false ? null : { id: "f-1" }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "host", username: "방장", avatar: null }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "host", username: "방장", avatar: null }]),
      },
    };
    const gateway = { sendRoomInvite: jest.fn() };
    const service = new RoomInviteService(
      prisma as any,
      redis as any,
      gateway as any,
    );
    return { service, prisma, redis, gateway, hash };
  };

  it("방 참가자가 친구를 부르면 초대를 남기고 친구 화면에 보낸다", async () => {
    const { service, gateway, hash } = setup();

    await service.invite("host", "room-1", "friend");

    expect(hash.get(roomInviteKey("friend"))?.has("room-1")).toBe(true);
    expect(gateway.sendRoomInvite).toHaveBeenCalledWith(
      "friend",
      expect.objectContaining({
        roomId: "room-1",
        playerCount: 1,
        inviter: expect.objectContaining({ username: "방장" }),
      }),
    );
  });

  it("방에 없는 사람은 초대할 수 없다", async () => {
    const { service, gateway } = setup();
    await expect(
      service.invite("stranger", "room-1", "friend"),
    ).rejects.toThrow("방에 참가한 사람만");
    expect(gateway.sendRoomInvite).not.toHaveBeenCalled();
  });

  it("친구가 아니면 초대할 수 없다", async () => {
    const { service, gateway } = setup({ friends: false });
    await expect(service.invite("host", "room-1", "friend")).rejects.toThrow(
      "친구만",
    );
    expect(gateway.sendRoomInvite).not.toHaveBeenCalled();
  });

  it("시작한 방에는 초대할 수 없다", async () => {
    const { service } = setup({ room: waitingRoom({ status: "IN_PROGRESS" }) });
    await expect(service.invite("host", "room-1", "friend")).rejects.toThrow(
      "이미 시작한",
    );
  });

  it("같은 친구를 쿨다운 안에 다시 부르면 막는다", async () => {
    const { service, gateway } = setup({ hits: 2 });
    await expect(service.invite("host", "room-1", "friend")).rejects.toThrow(
      "방금 초대를",
    );
    expect(gateway.sendRoomInvite).not.toHaveBeenCalled();
  });

  it("받은 목록에서 만료·시작·이미 들어간 방의 초대는 빼고 지운다", async () => {
    const { service, prisma, hash } = setup();
    const key = roomInviteKey("me");
    const live = (roomId: string, expiresAt = "2999-01-01T00:00:00.000Z") =>
      JSON.stringify({
        roomId,
        inviterId: "host",
        createdAt: "2026-09-22T00:00:00.000Z",
        expiresAt,
      });
    hash.set(
      key,
      new Map([
        ["ok", live("ok")],
        ["expired", live("expired", "2000-01-01T00:00:00.000Z")],
        ["started", live("started")],
        ["joined", live("joined")],
        ["gone", live("gone")],
      ]),
    );
    prisma.room.findMany.mockResolvedValue([
      waitingRoom({ id: "ok" }),
      waitingRoom({ id: "started", status: "IN_PROGRESS" }),
      waitingRoom({
        id: "joined",
        participants: [{ userId: "me", role: "PLAYER" }],
      }),
    ]);

    const result = await service.listReceived("me");

    expect(result.map((i) => i.roomId)).toEqual(["ok"]);
    expect([...hash.get(key)!.keys()]).toEqual(["ok"]);
  });

  it("거절하면 초대를 지운다", async () => {
    const { service, hash } = setup();
    await service.invite("host", "room-1", "friend");

    await service.decline("friend", "room-1");

    expect(hash.get(roomInviteKey("friend"))?.has("room-1")).toBe(false);
  });
});

describe("parseStoredInvite", () => {
  const raw = (expiresAt: string) =>
    JSON.stringify({ roomId: "r", inviterId: "u", createdAt: "", expiresAt });

  it("만료 전 초대만 유효하다 — 비공개 방 비밀번호 면제 기준", () => {
    const now = Date.parse("2026-09-22T12:00:00Z");
    expect(parseStoredInvite(raw("2026-09-22T12:10:00Z"), now)).not.toBeNull();
    expect(parseStoredInvite(raw("2026-09-22T11:59:00Z"), now)).toBeNull();
    expect(parseStoredInvite(null, now)).toBeNull();
    expect(parseStoredInvite("깨진 값", now)).toBeNull();
  });
});
