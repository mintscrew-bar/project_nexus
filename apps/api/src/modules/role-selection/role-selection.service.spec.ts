import { RoleSelectionService } from "./role-selection.service";

describe("RoleSelectionService skip voting", () => {
  let service: RoleSelectionService;
  let prisma: {
    roomParticipant: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  const roomId = "room-1";
  const players = Array.from({ length: 20 }, (_, index) => ({
    userId: `user-${index + 1}`,
  }));

  beforeEach(() => {
    prisma = {
      roomParticipant: {
        findMany: jest.fn().mockResolvedValue(players),
        findFirst: jest.fn().mockResolvedValue({ id: "participant-1" }),
      },
    };
    service = new RoleSelectionService(prisma as any, {} as any);
    (service as any).roleSelectionStates.set(roomId, {
      roomId,
      timerEnd: Date.now() + 60_000,
      startedAt: Date.now(),
    });
  });

  it("counts one vote per player", async () => {
    await service.voteToSkip("user-1", roomId);
    const result = await service.voteToSkip("user-1", roomId);

    expect(result.voteCount).toBe(1);
    expect(result.requiredVotes).toBe(11);
    expect(result.passed).toBe(false);
  });

  it("passes when a strict majority of players vote", async () => {
    let result;
    for (let index = 1; index <= 11; index += 1) {
      result = await service.voteToSkip(`user-${index}`, roomId);
    }

    expect(result).toMatchObject({
      voteCount: 11,
      requiredVotes: 11,
      passed: true,
    });
  });

  it("rejects spectators and non-participants", async () => {
    prisma.roomParticipant.findFirst.mockResolvedValue(null);

    await expect(service.voteToSkip("spectator-1", roomId)).rejects.toThrow(
      "플레이어만 스킵 투표에 참여할 수 있습니다.",
    );
  });
});
