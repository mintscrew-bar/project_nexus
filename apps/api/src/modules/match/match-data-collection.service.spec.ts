import {
  isRiotCustomGame,
  MatchDataCollectionService,
} from "./match-data-collection.service";

describe("isRiotCustomGame", () => {
  it("accepts the standard custom queue", () => {
    expect(
      isRiotCustomGame({
        info: { queueId: 0, gameType: "MATCHED_GAME" },
      } as never),
    ).toBe(true);
  });

  it("accepts a manually created custom lobby with an unknown queue", () => {
    expect(
      isRiotCustomGame({
        info: { queueId: 9999, gameType: "CUSTOM_GAME" },
      } as never),
    ).toBe(true);
  });

  it("rejects an unrelated matched game", () => {
    expect(
      isRiotCustomGame({
        info: { queueId: 490, gameType: "MATCHED_GAME" },
      } as never),
    ).toBe(false);
  });
});

describe("MatchDataCollectionService", () => {
  const createService = (match: Record<string, jest.Mock>, riot = {}) =>
    new MatchDataCollectionService({ match } as never, riot as never);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("collectPendingMatches", () => {
    it("retries every completed internal match whose data was not collected", async () => {
      const findMany = jest.fn().mockResolvedValue([
        { id: "tournament", tournamentCode: "code", riotMatchId: null },
        { id: "known", tournamentCode: "code", riotMatchId: "KR_1" },
        { id: "crossref", tournamentCode: null, riotMatchId: null },
      ]);
      const service = createService({ findMany });
      const tournamentSpy = jest
        .spyOn(service, "collectMatchData")
        .mockResolvedValue();
      const crossrefSpy = jest
        .spyOn(service, "collectMatchDataByPuuidCrossref")
        .mockResolvedValue();
      jest.spyOn(global, "setTimeout").mockImplementation(((
        callback: () => void,
      ) => {
        callback();
        return 0;
      }) as typeof setTimeout);

      await service.collectPendingMatches();

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: "COMPLETED",
            dataCollected: false,
            roomId: { not: null },
          },
        }),
      );
      expect(tournamentSpy).toHaveBeenCalledWith("tournament");
      expect(crossrefSpy).toHaveBeenCalledWith("known");
      expect(crossrefSpy).toHaveBeenCalledWith("crossref");
    });
  });

  describe("collectMatchDataByPuuidCrossref", () => {
    it("discovers manual custom lobbies without a queue filter", async () => {
      const completedAt = new Date("2026-07-13T10:00:00.000Z");
      const storedMatch = {
        id: "match-manual",
        riotMatchId: null,
        teamAId: "a",
        teamBId: "b",
        startedAt: new Date("2026-07-13T09:30:00.000Z"),
        completedAt,
        teamA: {
          id: "a",
          members: [
            {
              userId: "user-a",
              user: { riotAccounts: [{ puuid: "puuid-a" }] },
            },
          ],
        },
        teamB: {
          id: "b",
          members: [
            {
              userId: "user-b",
              user: { riotAccounts: [{ puuid: "puuid-b" }] },
            },
          ],
        },
      };
      const candidateData = {
        info: {
          queueId: 9999,
          gameType: "CUSTOM_GAME",
          gameEndTimestamp: completedAt.getTime(),
          participants: [
            { puuid: "puuid-a", teamId: 100 },
            { puuid: "puuid-b", teamId: 200 },
          ],
        },
      };
      const findUnique = jest.fn().mockResolvedValue(storedMatch);
      const update = jest.fn().mockResolvedValue(undefined);
      const getMatchIdsByPuuid = jest.fn().mockResolvedValue(["KR_999"]);
      const getMatchById = jest.fn().mockResolvedValue(candidateData);
      const service = createService(
        { findUnique, update },
        { getMatchIdsByPuuid, getMatchById },
      );
      const saveSpy = jest
        .spyOn(service as never, "saveMatchData" as never)
        .mockResolvedValue(undefined as never);

      await service.collectMatchDataByPuuidCrossref("match-manual");

      expect(getMatchIdsByPuuid).toHaveBeenCalledWith(
        expect.any(String),
        0,
        20,
        undefined,
        undefined,
        3,
        expect.any(Number),
        expect.any(Number),
        "background",
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ riotMatchId: "KR_999" }),
        }),
      );
      expect(saveSpy).toHaveBeenCalledWith(
        "match-manual",
        storedMatch,
        candidateData,
      );
    });

    it("reuses a persisted Riot match ID after participant storage failed", async () => {
      const storedMatch = {
        id: "match-1",
        riotMatchId: "KR_123",
        teamA: { id: "a", members: [] },
        teamB: { id: "b", members: [] },
      };
      const findUnique = jest.fn().mockResolvedValue(storedMatch);
      const matchData = { info: { participants: [] } };
      const getMatchById = jest.fn().mockResolvedValue(matchData);
      const getMatchIdsByPuuid = jest.fn();
      const service = createService(
        { findUnique },
        { getMatchById, getMatchIdsByPuuid },
      );
      const saveSpy = jest
        .spyOn(service as never, "saveMatchData" as never)
        .mockResolvedValue(undefined as never);

      await service.collectMatchDataByPuuidCrossref("match-1");

      expect(getMatchById).toHaveBeenCalledWith(
        "KR_123",
        3,
        "background",
        expect.any(Object),
      );
      expect(saveSpy).toHaveBeenCalledWith("match-1", storedMatch, matchData);
      expect(getMatchIdsByPuuid).not.toHaveBeenCalled();
    });
  });

  describe("saveMatchData", () => {
    /** 내전 매치 1개(팀당 1명) + Riot 참가자 목록으로 saveMatchData를 실제 호출한다. */
    const runSave = async (participantPuuids: string[]) => {
      const storedMatch = {
        id: "match-1",
        teamAId: "a",
        teamBId: "b",
        teamA: {
          id: "a",
          members: [
            {
              userId: "user-a",
              user: { riotAccounts: [{ puuid: "puuid-a" }] },
            },
          ],
        },
        teamB: {
          id: "b",
          members: [
            {
              userId: "user-b",
              user: { riotAccounts: [{ puuid: "puuid-b" }] },
            },
          ],
        },
      };

      const matchUpdate = jest.fn().mockResolvedValue(undefined);
      const tx = {
        matchParticipant: {
          deleteMany: jest.fn().mockResolvedValue(undefined),
          create: jest.fn().mockResolvedValue(undefined),
        },
        matchTeamStats: {
          deleteMany: jest.fn().mockResolvedValue(undefined),
          create: jest.fn().mockResolvedValue(undefined),
        },
        match: { update: matchUpdate },
      };

      const prisma = {
        match: {},
        $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
        statsRecomputeQueue: { upsert: jest.fn().mockResolvedValue(undefined) },
      };

      const service = new MatchDataCollectionService(
        prisma as never,
        {} as never,
      );

      const matchData = {
        info: {
          participants: participantPuuids.map((puuid, i) => ({
            puuid,
            teamId: i === 0 ? 100 : 200,
          })),
          teams: [],
        },
      };

      const call = (
        service as never as {
          saveMatchData: (id: string, m: unknown, d: unknown) => Promise<void>;
        }
      ).saveMatchData("match-1", storedMatch, matchData);

      return { call, tx, matchUpdate };
    };

    it("기대 참가자가 모두 매핑되면 전적을 저장하고 dataCollected를 확정한다", async () => {
      const { call, tx, matchUpdate } = await runSave(["puuid-a", "puuid-b"]);

      await expect(call).resolves.toBeUndefined();
      expect(tx.matchParticipant.create).toHaveBeenCalledTimes(2);
      expect(matchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { dataCollected: true } }),
      );
    });

    it("참가자 매핑이 불완전하면 저장하지 않고 dataCollected도 찍지 않는다", async () => {
      // puuid-b 가 Riot 응답에 없다 → 부분 저장 상황
      const { call, tx, matchUpdate } = await runSave(["puuid-a"]);

      await expect(call).rejects.toThrow(/참가자 매핑 불완전/);
      expect(tx.matchParticipant.create).not.toHaveBeenCalled();
      expect(matchUpdate).not.toHaveBeenCalled();
    });
  });
});
