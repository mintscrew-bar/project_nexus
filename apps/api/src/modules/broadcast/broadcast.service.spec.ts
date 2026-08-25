import { BroadcastService } from "./broadcast.service";

/**
 * auto 장면 전환에서 "방금 끝난 경기의 결과"가 제 시간을 채우는지 본다.
 *
 * 실제로 방송에서 결과 화면이 뜨자마자 사라졌다. 다전제는 한 세트가 끝나도
 * 시리즈 슬롯이 IN_PROGRESS로 남아 있어 진행 중 경기가 계속 잡히는데,
 * 포커스 분기가 결과 분기보다 앞에 있어서 곧장 대진표·경기 소개로 넘어갔다.
 */
describe("BroadcastService auto 장면", () => {
  let prisma: any;
  let service: BroadcastService;

  const roomId = "room-1";
  const now = Date.now();

  /** match.findFirst 를 where 조건으로 갈라 응답한다 (진행 중 / 최근 완료). */
  const mockMatches = (opts: {
    live?: { id: string; startedAt: Date | null } | null;
    completed?: { id: string; completedAt: Date } | null;
  }) => {
    prisma.match.findFirst.mockImplementation((args: any) => {
      if (args?.where?.status === "IN_PROGRESS") {
        return Promise.resolve(opts.live ?? null);
      }
      if (args?.where?.status === "COMPLETED") {
        return Promise.resolve(opts.completed ?? null);
      }
      return Promise.resolve(null);
    });
  };

  const resolve = (room: any) =>
    (service as any).resolveControlledScene("auto", roomId, room);

  beforeEach(() => {
    prisma = { match: { findFirst: jest.fn().mockResolvedValue(null) } };
    service = new BroadcastService(prisma, {} as any);
  });

  it("경기가 끝나면 다음 경기가 진행 중이어도 결과를 먼저 보여준다", async () => {
    const completedAt = new Date(now - 2_000);
    mockMatches({
      live: { id: "set-2", startedAt: new Date(now - 1_000) },
      completed: { id: "set-1", completedAt },
    });

    const result = await resolve({
      // 방장이 경기 시작 전에 중계 대상을 골라둔 상태
      broadcastFocusChangedAt: new Date(now - 60_000),
    });

    expect(result.scene).toBe("result");
    // 12초를 채우고 전환하도록 전환 시각을 함께 준다.
    expect(result.nextChangeAt).toBe(completedAt.getTime() + 12_000);
  });

  it("결과 시간이 지나면 진행 중 경기로 넘어간다", async () => {
    mockMatches({
      live: { id: "set-2", startedAt: new Date(now - 300_000) },
      completed: { id: "set-1", completedAt: new Date(now - 30_000) },
    });

    const result = await resolve({ broadcastFocusChangedAt: null });

    expect(result.scene).toBe("match");
  });

  it("방장이 결과를 본 뒤 다음 경기를 고르면 그 선택을 따른다", async () => {
    mockMatches({
      live: { id: "match-2", startedAt: new Date(now - 1_000) },
      completed: { id: "match-1", completedAt: new Date(now - 5_000) },
    });

    // 경기 종료보다 나중에 포커스를 바꿨다 = 결과를 보고 넘긴 것
    const result = await resolve({
      broadcastFocusChangedAt: new Date(now - 2_000),
    });

    expect(result.scene).not.toBe("result");
  });

  it("중계 중인 경기는 속보로 다시 띄우지 않는다", async () => {
    // 지금 보고 있는 경기가 끝난 건 결과 화면이 맡는다. 속보는 "다른" 경기다.
    prisma.match.findFirst.mockResolvedValue(null);

    const result = await (service as any).recentOtherResult(
      roomId,
      "match-1",
      new Map(),
    );

    expect(result).toBeNull();
    const where = prisma.match.findFirst.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: "match-1" });
    expect(where.status).toBe("COMPLETED");
    // 방금 끝난 것만 — 오래된 결과가 뒤늦게 튀어나오면 안 된다.
    expect(where.completedAt.gte).toBeInstanceOf(Date);
  });

  it("다른 경기가 방금 끝났으면 걷을 시각과 함께 내보낸다", async () => {
    const completedAt = new Date(now - 1_000);
    prisma.match.findFirst.mockResolvedValue({
      id: "match-2",
      status: "COMPLETED",
      matchNumber: 3,
      round: 1,
      bracketRound: null,
      winnerId: "team-a",
      blueSideTeamId: null,
      bracketType: null,
      teamAId: "team-a",
      teamBId: "team-b",
      completedAt,
    });

    const result = await (service as any).recentOtherResult(
      roomId,
      "match-1",
      new Map([
        ["team-a", { id: "team-a", name: "A팀", members: [] }],
        ["team-b", { id: "team-b", name: "B팀", members: [] }],
      ]),
    );

    expect(result.id).toBe("match-2");
    expect(result.winnerId).toBe("team-a");
    expect(result.hideAt).toBe(completedAt.getTime() + 8_000);
  });

  it("고정 장면은 그대로 내보낸다", async () => {
    const result = await (service as any).resolveControlledScene(
      "result",
      roomId,
      {},
    );

    expect(result).toEqual({ scene: "result", nextChangeAt: null });
  });
});
