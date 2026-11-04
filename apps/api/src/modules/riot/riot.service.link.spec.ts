import { Logger } from "@nestjs/common";
import { RiotService } from "./riot.service";

/**
 * 주인 없는 내전 기록 연결.
 * 부계정·대타로 뛴 사람은 userId 없이 저장된다. 그 Riot 계정이 등록되면 잇는다.
 */
describe("RiotService.linkUnclaimedMatchParticipants", () => {
  const makeService = (count: number) => {
    const prisma = {
      matchParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count }),
        // 연결할 경기 목록 — 자동 MVP·ACE 재계산 대상
        findMany: jest
          .fn()
          .mockResolvedValueOnce(
            Array.from({ length: count }, () => ({ matchId: "m1" })),
          )
          .mockResolvedValue([]),
      },
      match: { update: jest.fn().mockResolvedValue(undefined) },
      statsRecomputeQueue: { upsert: jest.fn().mockResolvedValue(undefined) },
    };
    // 생성자 의존성이 많아 프로토타입으로 만들고 필요한 것만 꽂는다
    const service = Object.create(RiotService.prototype) as RiotService;
    Object.assign(service, { prisma, logger: new Logger("test") });
    return { service, prisma };
  };

  it("주인 없는 내전 행만 골라 userId 를 채우고 통계를 다시 계산한다", async () => {
    const { service, prisma } = makeService(2);

    await expect(
      service.linkUnclaimedMatchParticipants("user-1", "puuid-alt"),
    ).resolves.toBe(2);

    expect(prisma.matchParticipant.updateMany).toHaveBeenCalledWith({
      // 외부 랭크 인제스트 행(isInternal=false)과 이미 주인 있는 행은 건드리지 않는다
      where: { puuid: "puuid-alt", userId: null, match: { isInternal: true } },
      data: { userId: "user-1" },
    });
    expect(prisma.statsRecomputeQueue.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    ); // 같은 경기는 한 번만 MVP·ACE 를 다시 매긴다 (참가자 기록이 비어 있어 갱신은 없음)
    expect(prisma.matchParticipant.findMany).toHaveBeenCalledTimes(2);
  });

  it("연결할 기록이 없으면 통계 재계산을 걸지 않는다", async () => {
    const { service, prisma } = makeService(0);
    await service.linkUnclaimedMatchParticipants("user-1", "puuid-x");
    expect(prisma.statsRecomputeQueue.upsert).not.toHaveBeenCalled();
  });
});
