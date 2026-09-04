import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PubgKillMatchService } from "./pubg-kill-match.service";

/**
 * 킬내기는 승패·다전제·대진표를 기존 2팀 흐름에 얹는다.
 * 여기서 검증하는 건 "킬 수로 승자를 정하는 규칙"과 입력 방어다.
 */
describe("PubgKillMatchService", () => {
  const match = {
    id: "m1",
    teamAId: "tA",
    teamBId: "tB",
    room: { id: "r1", hostId: "host", gameTitle: "PUBG" },
    teamA: { id: "tA", name: "A팀", captainId: "capA" },
    teamB: { id: "tB", name: "B팀", captainId: "capB" },
  };

  const makePrisma = (over: any = {}) => ({
    match: {
      findUnique: jest.fn().mockResolvedValue(match),
      update: jest.fn(),
    },
    roomParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    pubgMatchTeamKills: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    pubgMatchPlayerKills: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (fn: any) => fn(txOf(over))),
    ...over,
  });

  const txCalls: any = {};
  const txOf = (_over: any) => ({
    pubgMatchTeamKills: {
      deleteMany: jest.fn(),
      createMany: jest.fn((args: any) => {
        txCalls.teamKills = args.data;
      }),
    },
    pubgMatchPlayerKills: {
      deleteMany: jest.fn(),
      createMany: jest.fn((args: any) => {
        txCalls.playerKills = args.data;
      }),
    },
    match: {
      update: jest.fn((args: any) => {
        txCalls.matchUpdate = args.data;
      }),
    },
  });

  beforeEach(() => {
    for (const key of Object.keys(txCalls)) delete txCalls[key];
  });

  it("승자를 안 넣으면 킬이 많은 팀이 이긴다", async () => {
    const prisma = makePrisma();
    const service = new PubgKillMatchService(prisma as any);

    await service.reportKills("host", "m1", {
      teams: [
        { teamId: "tA", kills: 12 },
        { teamId: "tB", kills: 9 },
      ],
    });

    expect(txCalls.matchUpdate.winnerId).toBe("tA");
    expect(txCalls.matchUpdate.status).toBe("COMPLETED");
  });

  it("킬이 같으면 기계가 정하지 않고 되묻는다", async () => {
    const service = new PubgKillMatchService(makePrisma() as any);
    await expect(
      service.reportKills("host", "m1", {
        teams: [
          { teamId: "tA", kills: 10 },
          { teamId: "tB", kills: 10 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("동점이어도 승자를 직접 고르면 통과한다", async () => {
    const service = new PubgKillMatchService(makePrisma() as any);
    await service.reportKills("host", "m1", {
      winnerId: "tB",
      teams: [
        { teamId: "tA", kills: 10 },
        { teamId: "tB", kills: 10 },
      ],
    });
    expect(txCalls.matchUpdate.winnerId).toBe("tB");
  });

  it("팀장도 보고할 수 있다", async () => {
    const service = new PubgKillMatchService(makePrisma() as any);
    await service.reportKills("capB", "m1", {
      teams: [
        { teamId: "tA", kills: 3 },
        { teamId: "tB", kills: 8 },
      ],
    });
    expect(txCalls.matchUpdate.winnerId).toBe("tB");
  });

  it("무관한 사람은 보고할 수 없다", async () => {
    const service = new PubgKillMatchService(makePrisma() as any);
    await expect(
      service.reportKills("stranger", "m1", {
        teams: [
          { teamId: "tA", kills: 3 },
          { teamId: "tB", kills: 8 },
        ],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("같은 팀을 두 번 넣으면 막는다", async () => {
    const service = new PubgKillMatchService(makePrisma() as any);
    await expect(
      service.reportKills("host", "m1", {
        teams: [
          { teamId: "tA", kills: 3 },
          { teamId: "tA", kills: 8 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("팀 이름을 스냅샷으로 남긴다 — 팀이 지워져도 전적이 읽혀야 한다", async () => {
    const service = new PubgKillMatchService(makePrisma() as any);
    await service.reportKills("host", "m1", {
      teams: [
        { teamId: "tA", kills: 5 },
        { teamId: "tB", kills: 2 },
      ],
    });
    expect(txCalls.teamKills.map((row: any) => row.teamName)).toEqual([
      "A팀",
      "B팀",
    ]);
  });

  it("롤 매치에는 킬내기 결과를 넣을 수 없다", async () => {
    const prisma = makePrisma();
    prisma.match.findUnique.mockResolvedValue({
      ...match,
      room: { ...match.room, gameTitle: "LOL" },
    });
    const service = new PubgKillMatchService(prisma as any);
    await expect(
      service.reportKills("host", "m1", {
        teams: [
          { teamId: "tA", kills: 3 },
          { teamId: "tB", kills: 8 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
