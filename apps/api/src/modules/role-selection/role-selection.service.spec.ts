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

describe("RoleSelectionService timer extension", () => {
  let service: RoleSelectionService;
  const roomId = "room-1";
  const startTimerEnd = Date.now() + 90_000;

  beforeEach(() => {
    service = new RoleSelectionService({} as any, {} as any);
    (service as any).roleSelectionStates.set(roomId, {
      roomId,
      timerEnd: startTimerEnd,
      startedAt: Date.now(),
    });
  });

  it("인당 2회까지 연장을 허용하고 회당 15초를 더한다", () => {
    const first = service.extendTimer("user-1", roomId);
    expect(first.timerEnd).toBe(startTimerEnd + 15_000);
    expect(first.remainingExtensions).toBe(1);

    const second = service.extendTimer("user-1", roomId);
    expect(second.timerEnd).toBe(startTimerEnd + 30_000);
    expect(second.remainingExtensions).toBe(0);
  });

  it("3회째 연장은 거부한다", () => {
    service.extendTimer("user-1", roomId);
    service.extendTimer("user-1", roomId);

    expect(() => service.extendTimer("user-1", roomId)).toThrow(
      "연장은 인당 2회까지만 가능합니다.",
    );
    expect(service.hasExtended("user-1", roomId)).toBe(true);
  });

  it("연장 횟수는 유저별로 독립적으로 관리된다", () => {
    service.extendTimer("user-1", roomId);
    service.extendTimer("user-1", roomId);

    expect(service.getRemainingExtensions("user-1", roomId)).toBe(0);
    expect(service.getRemainingExtensions("user-2", roomId)).toBe(2);

    const other = service.extendTimer("user-2", roomId);
    expect(other.timerEnd).toBe(startTimerEnd + 45_000);
  });

  it("세션이 없으면 연장할 수 없다", () => {
    expect(() => service.extendTimer("user-1", "unknown-room")).toThrow(
      "역할 선택 세션이 없습니다.",
    );
  });
});
