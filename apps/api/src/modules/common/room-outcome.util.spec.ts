import { recordRoomOutcome } from "./room-outcome.util";

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
