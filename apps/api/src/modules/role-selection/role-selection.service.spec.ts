import { RoleSelectionService } from "./role-selection.service";
import { RoleSelectionGateway } from "./role-selection.gateway";
import { RoomStatus, TeamMode } from "@nexus/database";

describe("RoleSelectionService 자동 밸런스 역할 잠금", () => {
  it("자동 밸런스가 확정한 역할 선택을 취소할 수 없다", async () => {
    const prisma = {
      teamMember: {
        findFirst: jest.fn().mockResolvedValue({
          id: "member-1",
          assignedRole: "TOP",
          team: { room: { teamMode: TeamMode.AUTO_BALANCE } },
        }),
        update: jest.fn(),
      },
    };
    const service = new RoleSelectionService(prisma as any, {} as any);

    await expect(service.cancelRole("user-1", "room-1")).rejects.toThrow(
      "자동 밸런스로 확정된 역할은 변경할 수 없습니다.",
    );
    expect(prisma.teamMember.update).not.toHaveBeenCalled();
  });

  it("자동 밸런스 방에서는 다른 역할을 다시 선택할 수 없다", async () => {
    const prisma: any = {
      room: {
        findUnique: jest.fn().mockResolvedValue({
          id: "room-1",
          teamMode: TeamMode.AUTO_BALANCE,
          status: RoomStatus.ROLE_SELECTION,
          teams: [],
        }),
      },
    };
    prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) =>
      callback(prisma),
    );
    const service = new RoleSelectionService(prisma as any, {} as any);

    await expect(
      service.selectRole("user-1", "room-1", "MID" as any),
    ).rejects.toThrow("자동 밸런스로 확정된 역할은 변경할 수 없습니다.");
  });
});

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
    expect(service.getRemainingExtensions("user-1", roomId)).toBe(0);
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

describe("RoleSelectionService 편성 확정 — 게임별 경로", () => {
  const roomWithTeams = {
    id: "room-1",
    hostId: "host-1",
    teams: [{ id: "team-1", members: [] }],
  };

  const makePrisma = (gameTitle: string, pubgGameMode: string | null) => ({
    room: {
      // 1) 게임 판단용 조회 2) 팀 조회 3) 확정 후 재조회
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ gameTitle, pubgGameMode })
        .mockResolvedValueOnce(roomWithTeams)
        .mockResolvedValue(roomWithTeams),
      update: jest.fn().mockResolvedValue({}),
    },
    teamMember: { findMany: jest.fn().mockResolvedValue([]) },
  });

  it.each(["BATTLE_ROYALE", "KILL_MATCH", "FREE_MATCH"])(
    "배그 %s 방은 대진표를 만들지 않는다",
    async (mode) => {
      // 대진표는 2~8팀만 만들 수 있어 12팀 이상 배그 방은 여기서 막혔다.
      // 자유 매치는 결과를 남기지 않는 방이라 더더욱 만들 대진표가 없다.
      const prisma = makePrisma("PUBG", mode);
      const matchService = { generateBracket: jest.fn() };
      const service = new RoleSelectionService(
        prisma as any,
        matchService as any,
      );

      await service.completeRoleSelection("room-1");

      expect(matchService.generateBracket).not.toHaveBeenCalled();
      expect(prisma.room.update).toHaveBeenCalledWith({
        where: { id: "room-1" },
        data: { status: RoomStatus.IN_PROGRESS },
      });
    },
  );

  it("롤 방은 그대로 대진표를 만든다", async () => {
    const prisma = makePrisma("LOL", null);
    // 라인 검사를 통과시킨다 — 여기서 보려는 건 대진표 생성 여부다.
    prisma.teamMember.findMany.mockResolvedValue([]);
    const matchService = { generateBracket: jest.fn().mockResolvedValue({}) };
    const service = new RoleSelectionService(
      prisma as any,
      matchService as any,
    );

    await service.completeRoleSelection("room-1");

    expect(matchService.generateBracket).toHaveBeenCalledWith(
      "host-1",
      "room-1",
    );
  });
});

describe("RoleSelectionGateway.advanceAfterTeams — 게임별 다음 단계", () => {
  /**
   * 배그 방은 팀을 다 짜고도 "역할 선택 시작에 실패했습니다"로 끝났다.
   * 경매·드래프트·자유 팀 선택이 모두 `startRoleSelection` 을 직접 불렀는데
   * 그 메서드는 포지션 없는 게임이면 예외를 던지기 때문이다.
   */
  const makeGateway = (gameTitle: string) => {
    const prisma = {
      room: { findUnique: jest.fn().mockResolvedValue({ gameTitle }) },
    };
    const service = { startRoleSelection: jest.fn().mockResolvedValue({}) };
    const gateway = Object.create(RoleSelectionGateway.prototype);
    Object.assign(gateway, {
      prisma,
      roleSelectionService: service,
      emitRoleSelectionStarted: jest.fn(),
      completeRoleSelection: jest.fn().mockResolvedValue(undefined),
    });
    return { gateway, service };
  };

  it("롤은 역할 선택을 시작한다", async () => {
    const { gateway, service } = makeGateway("LOL");
    await gateway.advanceAfterTeams("room-1");
    expect(service.startRoleSelection).toHaveBeenCalledWith("room-1");
    expect(gateway.completeRoleSelection).not.toHaveBeenCalled();
  });

  it("배그는 역할 선택을 건너뛰고 곧바로 확정한다", async () => {
    const { gateway, service } = makeGateway("PUBG");
    await gateway.advanceAfterTeams("room-1");
    expect(service.startRoleSelection).not.toHaveBeenCalled();
    expect(gateway.completeRoleSelection).toHaveBeenCalledWith("room-1");
  });

  it("게임이 비어 있으면 기본 게임(롤)으로 본다", async () => {
    const { gateway, service } = makeGateway(null as never);
    await gateway.advanceAfterTeams("room-1");
    expect(service.startRoleSelection).toHaveBeenCalled();
  });
});
