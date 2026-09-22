import { AdminService } from "./admin.service";

/**
 * 관리자 봇 채우기.
 *
 * 정원은 선수 자리다. 관전자(운영자 방장 포함)는 세지 않는다 — joinRoom 과
 * 같은 기준이어야 "봇 채우기"가 정원을 정확히 채운다.
 */
describe("AdminService.addBotToRoom", () => {
  const bot = (n: number) => ({
    id: `bot-${n}`,
    username: `testbot_${String(n).padStart(2, "0")}`,
  });

  function setup(room: {
    maxParticipants: number;
    participants: Array<{
      userId: string;
      role: "PLAYER" | "SPECTATOR";
      username: string;
    }>;
  }) {
    const tx = {
      room: {
        findUnique: jest.fn().mockResolvedValue({
          id: "room-1",
          status: "WAITING",
          maxParticipants: room.maxParticipants,
          participants: room.participants.map((p) => ({
            userId: p.userId,
            role: p.role,
            user: { username: p.username },
          })),
        }),
      },
      roomParticipant: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
      user: { findUnique: jest.fn().mockResolvedValue({ username: "admin" }) },
      room: { findUnique: jest.fn().mockResolvedValue({ name: "테스트 방" }) },
    };
    const adminAlerts = {
      notifyAdminOperation: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminService(
      prisma as any,
      {} as any,
      adminAlerts as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    // 봇 계정 생성은 DB 세부사항이라 여기서는 순서대로 돌려준다.
    const ensureBotUsers = jest
      .spyOn(service, "ensureBotUsers")
      .mockImplementation(async (count: number) =>
        Array.from({ length: count }, (_, i) => bot(i + 1)),
      );
    return { service, tx, ensureBotUsers };
  }

  it("운영자(관전) 방장 방은 선수 정원을 전부 봇으로 채운다", async () => {
    const { service, tx } = setup({
      maxParticipants: 10,
      participants: [{ userId: "host", role: "SPECTATOR", username: "host" }],
    });

    const result = await service.addBotToRoom("room-1", "admin", 10);

    expect(result.addedCount).toBe(10);
    const created = tx.roomParticipant.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(10);
    expect(created.every((row: any) => row.role === "PLAYER")).toBe(true);
  });

  it("관전자가 있어도 선수 방장 몫은 한 자리로 센다", async () => {
    const { service, tx } = setup({
      maxParticipants: 10,
      participants: [
        { userId: "host", role: "PLAYER", username: "host" },
        { userId: "viewer", role: "SPECTATOR", username: "viewer" },
      ],
    });

    await service.addBotToRoom("room-1", "admin", 10);

    expect(tx.roomParticipant.createMany.mock.calls[0][0].data).toHaveLength(9);
  });

  it("40명을 넘는 정원도 끝까지 채운다(예전에는 봇 39개 상한)", async () => {
    const { service, tx, ensureBotUsers } = setup({
      maxParticipants: 100,
      participants: [{ userId: "host", role: "SPECTATOR", username: "host" }],
    });

    await service.addBotToRoom("room-1", "admin", 100);

    expect(ensureBotUsers).toHaveBeenCalledWith(100, tx);
    expect(tx.roomParticipant.createMany.mock.calls[0][0].data).toHaveLength(
      100,
    );
  });

  it("이미 들어간 봇은 건너뛰고 빈 봇으로 나머지를 채운다", async () => {
    const { service, tx, ensureBotUsers } = setup({
      maxParticipants: 10,
      participants: [
        { userId: "host", role: "SPECTATOR", username: "host" },
        { userId: "bot-1", role: "PLAYER", username: "testbot_01" },
        { userId: "bot-2", role: "PLAYER", username: "testbot_02" },
      ],
    });

    const result = await service.addBotToRoom("room-1", "admin", 10);

    expect(result.addedCount).toBe(8);
    expect(ensureBotUsers).toHaveBeenCalledWith(10, tx);
    const ids = tx.roomParticipant.createMany.mock.calls[0][0].data.map(
      (row: any) => row.userId,
    );
    expect(ids).not.toContain("bot-1");
    expect(ids).not.toContain("bot-2");
  });

  it("선수 정원이 찼으면 거절한다", async () => {
    const { service } = setup({
      maxParticipants: 2,
      participants: [
        { userId: "a", role: "PLAYER", username: "a" },
        { userId: "b", role: "PLAYER", username: "b" },
        { userId: "c", role: "SPECTATOR", username: "c" },
      ],
    });

    await expect(service.addBotToRoom("room-1", "admin", 1)).rejects.toThrow(
      "방이 가득 찼습니다.",
    );
  });
});
