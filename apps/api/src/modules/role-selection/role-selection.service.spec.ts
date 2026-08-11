import { RoleSelectionService } from "./role-selection.service";

describe("RoleSelectionService captain readiness", () => {
  let service: RoleSelectionService;
  let prisma: {
    team: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  const roomId = "room-1";
  const teams = Array.from({ length: 4 }, (_, index) => ({
    captainId: `captain-${index + 1}`,
  }));

  beforeEach(() => {
    prisma = {
      team: {
        findMany: jest.fn().mockResolvedValue(teams),
        findFirst: jest.fn().mockResolvedValue({ id: "team-1" }),
      },
    };
    service = new RoleSelectionService(prisma as any, {} as any);
    (service as any).roleSelectionStates.set(roomId, {
      roomId,
      timerEnd: Date.now() + 60_000,
      startedAt: Date.now(),
    });
  });

  it("counts one ready response per captain", async () => {
    await service.markCaptainReady("captain-1", roomId);
    const result = await service.markCaptainReady("captain-1", roomId);

    expect(result.readyCount).toBe(1);
    expect(result.requiredCount).toBe(4);
    expect(result.allReady).toBe(false);
  });

  it("finishes only after every captain is ready", async () => {
    let result;
    for (let index = 1; index <= 4; index += 1) {
      result = await service.markCaptainReady(`captain-${index}`, roomId);
    }

    expect(result).toMatchObject({
      readyCount: 4,
      requiredCount: 4,
      allReady: true,
    });
  });

  it("rejects non-captains", async () => {
    prisma.team.findFirst.mockResolvedValue(null);

    await expect(service.markCaptainReady("player-1", roomId)).rejects.toThrow(
      "팀장만 다음 단계 준비를 완료할 수 있습니다.",
    );
  });
});
