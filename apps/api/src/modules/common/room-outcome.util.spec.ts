import { bumpRoomPeakHumans, recordRoomOutcome } from "./room-outcome.util";

const human = (name: string) => ({
  user: { username: name, email: null, riotAccounts: [] },
});
const bot = (name: string) => ({
  user: { username: name, email: null, riotAccounts: [] },
});

function makeRoom(over: Record<string, any> = {}) {
  return {
    gameTitle: "LOL",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    startedAt: new Date("2026-10-01T00:20:00Z"),
    completedAt: null,
    status: "IN_PROGRESS",
    maxParticipants: 10,
    isPrivate: false,
    scheduledAt: null,
    peakHumanCount: 0,
    host: { username: "alice", email: null, riotAccounts: [] },
    participants: [human("a"), human("b"), bot("testbot_01")],
    matches: [],
    scrim: null,
    ...over,
  };
}

function makePrisma(room: any) {
  return {
    room: { findUnique: jest.fn().mockResolvedValue(room) },
    roomOutcome: { upsert: jest.fn().mockResolvedValue({}) },
  } as any;
}

describe("recordRoomOutcome", () => {
  it("참가자 수와 봇을 뺀 사람 수를 따로 남긴다", async () => {
    const prisma = makePrisma(makeRoom());
    await recordRoomOutcome(prisma, "r1");

    const data = prisma.roomOutcome.upsert.mock.calls[0][0].create;
    expect(data).toMatchObject({
      roomId: "r1",
      participantCount: 3,
      humanCount: 2,
      hostIsBot: false,
      finalStatus: "IN_PROGRESS",
    });
  });

  it("봇이 연 방은 표시한다", async () => {
    const prisma = makePrisma(
      makeRoom({
        host: { username: "concbot_007", email: null, riotAccounts: [] },
      }),
    );
    await recordRoomOutcome(prisma, "r1");
    expect(prisma.roomOutcome.upsert.mock.calls[0][0].create.hostIsBot).toBe(
      true,
    );
  });

  it("완료 경기(롤)나 완료 라운드(배그)가 있으면 결과가 있는 방이다", async () => {
    const lol = makePrisma(makeRoom({ matches: [{ id: "m" }] }));
    await recordRoomOutcome(lol, "r1");
    expect(lol.roomOutcome.upsert.mock.calls[0][0].create.hadResult).toBe(true);

    const pubg = makePrisma(makeRoom({ scrim: { rounds: [{ id: "x" }] } }));
    await recordRoomOutcome(pubg, "r1");
    expect(pubg.roomOutcome.upsert.mock.calls[0][0].create.hadResult).toBe(
      true,
    );

    const none = makePrisma(makeRoom());
    await recordRoomOutcome(none, "r1");
    expect(none.roomOutcome.upsert.mock.calls[0][0].create.hadResult).toBe(
      false,
    );
  });

  it("두 번 불려도 같은 방은 한 줄만 남는다 (upsert, update 는 비어 있다)", async () => {
    const prisma = makePrisma(makeRoom());
    await recordRoomOutcome(prisma, "r1");
    expect(prisma.roomOutcome.upsert.mock.calls[0][0]).toMatchObject({
      where: { roomId: "r1" },
      update: {},
    });
  });

  it("방이 없으면 아무것도 쓰지 않는다", async () => {
    const prisma = makePrisma(null);
    await recordRoomOutcome(prisma, "gone");
    expect(prisma.roomOutcome.upsert).not.toHaveBeenCalled();
  });

  it("기록이 실패해도 던지지 않는다 — 방 삭제를 막으면 안 된다", async () => {
    const prisma = makePrisma(makeRoom());
    prisma.roomOutcome.upsert.mockRejectedValue(new Error("db down"));
    await expect(recordRoomOutcome(prisma, "r1")).resolves.toBeUndefined();

    const broken = { room: {}, roomOutcome: {} } as any;
    await expect(recordRoomOutcome(broken, "r1")).resolves.toBeUndefined();
  });
});

describe("최고 인원", () => {
  it("방이 지워질 때 최고 인원을 옮겨 담는다", async () => {
    const prisma = makePrisma(makeRoom({ peakHumanCount: 9 }));
    await recordRoomOutcome(prisma, "r1");
    const data = prisma.roomOutcome.upsert.mock.calls[0][0].create;
    expect(data.peakHumanCount).toBe(9);
    expect(data.humanCount).toBe(2);
  });

  it("갱신을 놓쳐 최고 인원이 지금 인원보다 작으면 지금 인원을 쓴다", async () => {
    const prisma = makePrisma(makeRoom({ peakHumanCount: 0 }));
    await recordRoomOutcome(prisma, "r1");
    expect(
      prisma.roomOutcome.upsert.mock.calls[0][0].create.peakHumanCount,
    ).toBe(2);
  });

  it("지금 사람 수가 저장값보다 클 때만 올린다 (봇 제외 조건으로 센다)", async () => {
    const prisma = {
      roomParticipant: { count: jest.fn().mockResolvedValue(7) },
      room: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as any;
    await bumpRoomPeakHumans(prisma, "r1");

    const countArgs = prisma.roomParticipant.count.mock.calls[0][0];
    expect(countArgs.where.roomId).toBe("r1");
    expect(countArgs.where.user.NOT).toBeDefined();
    expect(prisma.room.updateMany).toHaveBeenCalledWith({
      where: { id: "r1", peakHumanCount: { lt: 7 } },
      data: { peakHumanCount: 7 },
    });
  });

  it("갱신이 실패해도 던지지 않는다 (입장을 막지 않는다)", async () => {
    const prisma = {
      roomParticipant: { count: jest.fn().mockRejectedValue(new Error("db")) },
      room: { updateMany: jest.fn() },
    } as any;
    await expect(bumpRoomPeakHumans(prisma, "r1")).resolves.toBeUndefined();
    expect(prisma.room.updateMany).not.toHaveBeenCalled();
  });
});
