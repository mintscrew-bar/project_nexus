import { makeAdminService } from "./__tests__/make-admin-service";

/**
 * 스크림 관리자 조치. 잘못 붙은 라운드를 되돌리고, 수집을 다시 걸고, 취소하는 일.
 * 되돌릴 때 수집기의 "이미 본 매치" 기록까지 지우지 않으면 같은 매치를 다시 안 가져온다.
 */
function makeService(overrides: Record<string, any> = {}) {
  const prisma: any = {
    match: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    scrim: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    scrimRound: {
      findFirst: jest.fn(),
      update: jest.fn().mockReturnValue("round-update"),
    },
    scrimTeamResult: {
      deleteMany: jest.fn().mockReturnValue("delete-results"),
    },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  const service = makeAdminService({ prisma });
  return { service, prisma };
}

const round = (over: Record<string, any> = {}) => ({
  id: "r1",
  roundNumber: 2,
  pubgMatchId: "m-abc",
  _count: { results: 2 },
  scrim: {
    status: "IN_PROGRESS",
    collectorState: { cursor: 3, pending: [], seen: ["m-abc", "m-other"] },
  },
  ...over,
});

describe("AdminService 스크림 조치", () => {
  describe("resetScrimRound", () => {
    it("결과를 지우고 라운드를 처음 상태로 되돌린다", async () => {
      const { service, prisma } = makeService();
      prisma.scrimRound.findFirst.mockResolvedValue(round());

      await service.resetScrimRound("s1", "r1", "admin-1");

      expect(prisma.scrimTeamResult.deleteMany).toHaveBeenCalledWith({
        where: { roundId: "r1" },
      });
      expect(prisma.scrimRound.update.mock.calls[0][0].data).toMatchObject({
        status: "PENDING",
        pubgMatchId: null,
        resultSource: null,
      });
    });

    it("수집기가 이미 본 매치 기록에서 이 라운드의 매치를 뺀다", async () => {
      const { service, prisma } = makeService();
      prisma.scrimRound.findFirst.mockResolvedValue(round());

      await service.resetScrimRound("s1", "r1", "admin-1");

      const data = prisma.scrim.update.mock.calls[0][0].data;
      expect(data.collectorState.seen).toEqual(["m-other"]);
      expect(data.collectionError).toBeNull();
    });

    it("수동 입력 라운드는 수집기 상태를 건드리지 않는다", async () => {
      const { service, prisma } = makeService();
      prisma.scrimRound.findFirst.mockResolvedValue(
        round({ pubgMatchId: null }),
      );

      await service.resetScrimRound("s1", "r1", "admin-1");

      expect(prisma.scrim.update).not.toHaveBeenCalled();
    });

    it("감사 로그를 남긴다", async () => {
      const { service, prisma } = makeService();
      prisma.scrimRound.findFirst.mockResolvedValue(round());

      await service.resetScrimRound("s1", "r1", "admin-1");

      expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
        adminId: "admin-1",
        action: "SCRIM_ROUND_RESET",
        targetId: "s1",
      });
    });

    it("없는 라운드와 취소된 스크림은 거부한다", async () => {
      const { service, prisma } = makeService();
      prisma.scrimRound.findFirst.mockResolvedValue(null);
      await expect(service.resetScrimRound("s1", "x", "a")).rejects.toThrow(
        "라운드를 찾을 수 없습니다",
      );

      prisma.scrimRound.findFirst.mockResolvedValue(
        round({ scrim: { status: "CANCELLED", collectorState: null } }),
      );
      await expect(service.resetScrimRound("s1", "r1", "a")).rejects.toThrow(
        "취소된 스크림",
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("retryScrimCollection", () => {
    it("진행 중 스크림의 수집 오류와 시각을 지워 다음 주기에 바로 보게 한다", async () => {
      const { service, prisma } = makeService();
      prisma.scrim.findUnique.mockResolvedValue({
        status: "IN_PROGRESS",
        collectionError: "429",
      });

      await service.retryScrimCollection("s1", "admin-1");

      expect(prisma.scrim.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: { collectionError: null, lastCollectedAt: null },
      });
    });

    it("진행 중이 아니면 거부한다", async () => {
      const { service, prisma } = makeService();
      prisma.scrim.findUnique.mockResolvedValue({ status: "COMPLETED" });

      await expect(service.retryScrimCollection("s1", "a")).rejects.toThrow(
        "진행 중인 스크림만",
      );
      expect(prisma.scrim.update).not.toHaveBeenCalled();
    });
  });

  describe("cancelScrim", () => {
    it("진행 중 스크림을 취소한다", async () => {
      const { service, prisma } = makeService();
      prisma.scrim.findUnique.mockResolvedValue({ status: "IN_PROGRESS" });

      await service.cancelScrim("s1", "admin-1");

      expect(prisma.scrim.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: { status: "CANCELLED" },
      });
    });

    it.each(["COMPLETED", "CANCELLED"])(
      "%s 는 취소할 수 없다",
      async (status) => {
        const { service, prisma } = makeService();
        prisma.scrim.findUnique.mockResolvedValue({ status });

        await expect(service.cancelScrim("s1", "a")).rejects.toThrow();
        expect(prisma.scrim.update).not.toHaveBeenCalled();
      },
    );
  });

  describe("getScrimDetail", () => {
    it("수집기 내부 상태는 숨기고 대기 중인 매치 수만 알린다", async () => {
      const { service, prisma } = makeService();
      prisma.scrim.findUnique.mockResolvedValue({
        id: "s1",
        rounds: [],
        collectorState: { pending: [{ id: "a" }, { id: "b" }], seen: ["x"] },
      });

      const detail: any = await service.getScrimDetail("s1");

      expect(detail.pendingMatches).toBe(2);
      expect(detail.collectorState).toBeUndefined();
    });
  });

  describe("retryMatchCollection (롤)", () => {
    const base = {
      id: "m1",
      isInternal: true,
      status: "COMPLETED",
      dataCollected: false,
      collectAttempts: 10,
      tournamentCode: "KR-ABC",
      riotMatchId: null,
    };

    it("시도 횟수를 0 으로 돌려 수집기가 다시 보게 한다", async () => {
      const { service, prisma } = makeService();
      prisma.match.findUnique.mockResolvedValue(base);

      await service.retryMatchCollection("m1", "admin-1");

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: "m1" },
        data: { collectAttempts: 0, lastCollectAttemptAt: null },
      });
      expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({
        action: "MATCH_COLLECT_RETRY",
        details: { previousAttempts: 10 },
      });
    });

    it.each([
      [
        "수집 불가(코드·매치 ID 없음)",
        { tournamentCode: null },
        "가져올 수 없습니다",
      ],
      ["이미 수집됨", { dataCollected: true }, "이미 전적이"],
      ["아직 안 끝남", { status: "IN_PROGRESS" }, "끝난 경기만"],
    ])("%s 는 거부한다", async (_n, over, message) => {
      const { service, prisma } = makeService();
      prisma.match.findUnique.mockResolvedValue({ ...base, ...over });

      await expect(service.retryMatchCollection("m1", "a")).rejects.toThrow(
        message,
      );
      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it("외부 랭크 매치나 없는 경기는 404", async () => {
      const { service, prisma } = makeService();
      prisma.match.findUnique.mockResolvedValue({ ...base, isInternal: false });
      await expect(service.retryMatchCollection("m1", "a")).rejects.toThrow(
        "찾을 수 없습니다",
      );
    });
  });
});
