import { BalanceScoreService } from "./balance-score.service";
import { BALANCE_SCORE_VERSION } from "./balance-score.util";

describe("BalanceScoreService", () => {
  let prisma: any;
  let service: BalanceScoreService;

  const account = {
    id: "riot-1",
    puuid: "puuid-1",
    tier: "GOLD",
    rank: "II",
    lp: 40,
    peakTier: null,
    peakRank: "",
    peakLp: 0,
    soloWins: 10,
    soloLosses: 10,
    roleTiers: [],
    user: { nexusRanking: null, nexusRoleRecords: [] },
  };

  beforeEach(() => {
    prisma = {
      riotAccount: {
        findUnique: jest.fn().mockResolvedValue(account),
        findMany: jest.fn().mockResolvedValue([{ id: "riot-1" }]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // 솔랭 라인별 전적 집계 (match_participants)
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    service = new BalanceScoreService(prisma);
  });

  describe("readCached", () => {
    const fresh = {
      balanceScores: {
        TOP: 24.4,
        JUNGLE: 24.4,
        MID: 24.4,
        ADC: 24.4,
        SUPPORT: 24.4,
      },
      balanceScoreVersion: BALANCE_SCORE_VERSION,
    };

    it("현재 산식 버전으로 계산된 캐시를 읽는다", () => {
      expect(service.readCached(fresh)).toEqual(fresh.balanceScores);
    });

    it("산식 버전이 다르면 무시한다", () => {
      // 산식이 바뀌면 예전 점수로 팀을 나누면 안 된다.
      expect(
        service.readCached({ ...fresh, balanceScoreVersion: "2020-01-v0" }),
      ).toBeNull();
    });

    it("캐시가 없으면 null", () => {
      expect(
        service.readCached({ balanceScores: null, balanceScoreVersion: null }),
      ).toBeNull();
    });

    it("라인이 하나라도 비면 신뢰하지 않는다", () => {
      // 산식에 라인이 추가됐는데 캐시는 예전 구조인 경우를 막는다.
      const { MID: _mid, ...partial } = fresh.balanceScores;
      expect(
        service.readCached({ ...fresh, balanceScores: partial }),
      ).toBeNull();
    });

    it("숫자가 아닌 값이 섞이면 신뢰하지 않는다", () => {
      expect(
        service.readCached({
          ...fresh,
          balanceScores: { ...fresh.balanceScores, ADC: "24.4" },
        }),
      ).toBeNull();
    });
  });

  describe("refreshAccount", () => {
    it("라인별 점수와 산식 버전을 함께 저장한다", async () => {
      const scores = await service.refreshAccount("riot-1");

      expect(scores).not.toBeNull();
      const data = prisma.riotAccount.update.mock.calls[0][0].data;
      expect(data.balanceScoreVersion).toBe(BALANCE_SCORE_VERSION);
      expect(Object.keys(data.balanceScores).sort()).toEqual(
        ["ADC", "JUNGLE", "MID", "SUPPORT", "TOP"].sort(),
      );
      expect(data.balanceScoresAt).toBeInstanceOf(Date);
    });

    it("솔랭 라인별 전적을 반영해 라인마다 다른 점수를 낸다", async () => {
      prisma.$queryRaw.mockResolvedValue([
        { position: "MID", wins: BigInt(60), games: BigInt(80) },
        { position: "SUPPORT", wins: BigInt(20), games: BigInt(80) },
      ]);

      const scores = await service.refreshAccount("riot-1");

      expect(scores).not.toBeNull();
      expect(scores!.MID).toBeGreaterThan(scores!.SUPPORT);
      // 전적이 없는 라인은 큐 전체 승률만 반영돼 둘 사이에 놓인다.
      expect(scores!.TOP).toBeLessThan(scores!.MID);
      expect(scores!.TOP).toBeGreaterThan(scores!.SUPPORT);
    });

    it("라인 전적 집계가 실패해도 점수 갱신은 계속한다", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("db down"));

      await expect(service.refreshAccount("riot-1")).resolves.not.toBeNull();
      expect(prisma.riotAccount.update).toHaveBeenCalled();
    });

    it("계정이 없으면 아무것도 쓰지 않는다", async () => {
      prisma.riotAccount.findUnique.mockResolvedValue(null);

      await expect(service.refreshAccount("gone")).resolves.toBeNull();
      expect(prisma.riotAccount.update).not.toHaveBeenCalled();
    });
  });

  describe("refreshUser", () => {
    it("유저의 모든 계정을 갱신한다", async () => {
      prisma.riotAccount.findMany.mockResolvedValue([
        { id: "riot-1" },
        { id: "riot-2" },
      ]);

      await service.refreshUser("user-1");

      expect(prisma.riotAccount.update).toHaveBeenCalledTimes(2);
      expect(prisma.riotAccount.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: { balanceScoreVersion: null },
      });
    });

    it("실패해도 예외를 밖으로 던지지 않는다", async () => {
      // 경기 결과 저장 같은 상위 동작이 점수 갱신 때문에 막히면 안 된다.
      prisma.riotAccount.findMany.mockRejectedValue(new Error("db down"));

      await expect(service.refreshUser("user-1")).resolves.toBeUndefined();
    });
  });

  describe("refreshAllAccounts", () => {
    it("한 계정이 실패해도 나머지 계정을 계속 갱신한다", async () => {
      prisma.riotAccount.findMany.mockResolvedValue([
        { id: "riot-1" },
        { id: "riot-2" },
      ]);
      prisma.riotAccount.findUnique
        .mockRejectedValueOnce(new Error("temporary"))
        .mockResolvedValueOnce(account);

      await expect(service.refreshAllAccounts()).resolves.toEqual({
        updated: 1,
        failed: 1,
      });
    });
  });
});
