import { ScrimCollectorService } from "./scrim-collector.service";

/**
 * 라운드가 막 끝나면 PUBG 매치 상세가 아직 안 나온다. "못 찾았습니다"를 본
 * 호스트는 당연히 다시 누르는데, 한 번이 최대 4콜(목록 1 + 상세 3)이라
 * 연속 세 번이면 분당 예산(9)을 넘긴다. 그 피해는 누른 사람에게만 가지
 * 않는다 — 수집 호출은 최대 90초를 기다리며 토큰을 집어가는 반면 사용자
 * 닉네임 조회는 2초 만에 429 를 낸다.
 */
describe("배틀로얄 결과 조회 쿨다운", () => {
  const roomId = "room-1";
  const hostId = "host-1";

  /** 라운드가 시작돼 조회할 수 있는 상태 */
  const prismaWithStartedRound = () => ({
    room: {
      findUnique: jest.fn().mockResolvedValue({
        id: roomId,
        hostId,
        gameTitle: "PUBG",
        pubgGameMode: "BATTLE_ROYALE",
        maxParticipants: 32,
        teams: [{ id: "t1", name: "A" }],
        participants: [
          {
            teamId: "t1",
            user: {
              pubgAccounts: [
                {
                  playerId: "acc-1",
                  playerName: "p1",
                  lastMatchShard: "STEAM",
                },
              ],
            },
          },
        ],
        scrim: { id: "s", status: "IN_PROGRESS", pointRule: null },
      }),
    },
    scrimRound: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "r1",
          roundNumber: 1,
          startedAt: new Date("2026-09-08T01:00:00Z"),
          pubgMatchId: null,
        },
      ]),
    },
  });

  const build = (locked: boolean, pttlMs = 42_000) => {
    const prisma: any = prismaWithStartedRound();
    const pubgApi: any = {
      isEnabled: true,
      getPlayerMatchIds: jest.fn().mockResolvedValue([]),
      getMatch: jest.fn(),
    };
    const redis: any = {
      // 잠겨 있으면 null — 이미 최근에 조회했다는 뜻이다.
      acquireLock: jest.fn().mockResolvedValue(locked ? null : "token"),
      pttl: jest.fn().mockResolvedValue(pttlMs),
    };
    const service = new ScrimCollectorService(
      prisma,
      pubgApi,
      { get: () => undefined } as any,
      redis,
    );
    return { service, pubgApi, redis };
  };

  it("쿨다운 중이면 PUBG 를 한 번도 호출하지 않는다", async () => {
    const { service, pubgApi } = build(true);

    const result: any = await service.collectRound(hostId, roomId, 1);

    expect(result.matched).toBe(false);
    expect(result.reason).toBe("COOLDOWN");
    // 예산을 지키는 게 이 기능의 전부다. 한 콜도 나가면 안 된다.
    expect(pubgApi.getPlayerMatchIds).not.toHaveBeenCalled();
    expect(pubgApi.getMatch).not.toHaveBeenCalled();
  });

  it("남은 시간을 초로 알려준다", async () => {
    const { service } = build(true, 42_000);

    const result: any = await service.collectRound(hostId, roomId, 1);

    expect(result.retryAfterSec).toBe(42);
    expect(result.message).toContain("42초");
  });

  it("쿨다운이 아니면 조회가 나간다", async () => {
    const { service, pubgApi, redis } = build(false);

    await service.collectRound(hostId, roomId, 1);

    expect(redis.acquireLock).toHaveBeenCalledWith(
      `pubg:collect:${roomId}:1`,
      60_000,
    );
    expect(pubgApi.getPlayerMatchIds).toHaveBeenCalledTimes(1);
  });

  it("라운드마다 따로 센다", async () => {
    const { service, redis } = build(false);

    await service.collectRound(hostId, roomId, 1);

    // 한 라운드를 조회했다고 다음 라운드가 막히면 안 된다.
    expect(redis.acquireLock.mock.calls[0][0]).toContain(":1");
  });
});
