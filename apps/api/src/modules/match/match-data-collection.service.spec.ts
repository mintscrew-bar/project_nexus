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
    /** 시도 이력이 없는(=백오프 대상 아님) 매치 */
    const fresh = (
      id: string,
      tournamentCode: string | null,
      riotMatchId: string | null,
    ) => ({
      id,
      tournamentCode,
      riotMatchId,
      collectAttempts: 0,
      lastCollectAttemptAt: null,
    });

    const immediateTimers = () =>
      jest.spyOn(global, "setTimeout").mockImplementation(((
        callback: () => void,
      ) => {
        callback();
        return 0;
      }) as typeof setTimeout);

    it("retries every completed internal match whose data was not collected", async () => {
      const findMany = jest
        .fn()
        .mockResolvedValue([
          fresh("tournament", "code", null),
          fresh("known", "code", "KR_1"),
          fresh("crossref", null, null),
        ]);
      const update = jest.fn().mockResolvedValue(undefined);
      const service = createService({ findMany, update });
      const tournamentSpy = jest
        .spyOn(service, "collectMatchData")
        .mockResolvedValue();
      const crossrefSpy = jest
        .spyOn(service, "collectMatchDataByPuuidCrossref")
        .mockResolvedValue();
      immediateTimers();

      await service.collectPendingMatches();

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: "COMPLETED",
            dataCollected: false,
            roomId: { not: null },
            collectAttempts: { lt: 10 },
          },
        }),
      );
      expect(tournamentSpy).toHaveBeenCalledWith("tournament");
      expect(crossrefSpy).toHaveBeenCalledWith("known");
      expect(crossrefSpy).toHaveBeenCalledWith("crossref");
    });

    it("시도 횟수를 기록해 다음 백오프 간격을 늘린다", async () => {
      const findMany = jest
        .fn()
        .mockResolvedValue([fresh("crossref", null, null)]);
      const update = jest.fn().mockResolvedValue(undefined);
      const service = createService({ findMany, update });
      jest
        .spyOn(service, "collectMatchDataByPuuidCrossref")
        .mockResolvedValue();
      immediateTimers();

      await service.collectPendingMatches();

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "crossref" },
          data: expect.objectContaining({
            collectAttempts: { increment: 1 },
          }),
        }),
      );
    });

    it("백오프가 남은 매치는 건너뛰고 다른 매치를 처리한다", async () => {
      const now = Date.now();
      const findMany = jest.fn().mockResolvedValue([
        // 5분 전에 1회 실패 → 백오프 15분이 아직 안 지났다
        {
          id: "backing-off",
          tournamentCode: null,
          riotMatchId: null,
          collectAttempts: 1,
          lastCollectAttemptAt: new Date(now - 5 * 60 * 1000),
        },
        // 1시간 전에 1회 실패 → 백오프 경과
        {
          id: "ready",
          tournamentCode: null,
          riotMatchId: null,
          collectAttempts: 1,
          lastCollectAttemptAt: new Date(now - 60 * 60 * 1000),
        },
      ]);
      const update = jest.fn().mockResolvedValue(undefined);
      const service = createService({ findMany, update });
      const crossrefSpy = jest
        .spyOn(service, "collectMatchDataByPuuidCrossref")
        .mockResolvedValue();
      immediateTimers();

      await service.collectPendingMatches();

      // 계속 실패하던 매치가 슬롯을 독점하지 않는다.
      expect(crossrefSpy).not.toHaveBeenCalledWith("backing-off");
      expect(crossrefSpy).toHaveBeenCalledWith("ready");
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

    it("연속 내전에서는 종료 시각이 가장 가까운 경기를 고른다", async () => {
      // 같은 팀이 연달아 2판을 했다. 두 판 모두 같은 10명 / 커스텀 / 시간 허용치(±2h)
      // 안이라 둘 다 "유효"하다. 먼저 나온 후보를 그냥 쓰면 뒤 경기를 앞 대진에
      // 연결하게 되므로, 종료 시각이 가까운 쪽을 골라야 한다.
      const completedAt = new Date("2026-07-13T10:00:00.000Z");
      const member = (userId: string, puuid: string) => ({
        userId,
        user: { riotAccounts: [{ puuid }] },
      });
      const storedMatch = {
        id: "match-first-game",
        riotMatchId: null,
        teamAId: "a",
        teamBId: "b",
        startedAt: new Date("2026-07-13T09:30:00.000Z"),
        completedAt,
        teamA: { id: "a", members: [member("user-a", "puuid-a")] },
        teamB: { id: "b", members: [member("user-b", "puuid-b")] },
      };
      const game = (endMs: number) => ({
        info: {
          queueId: 0,
          gameType: "CUSTOM_GAME",
          gameEndTimestamp: endMs,
          participants: [
            { puuid: "puuid-a", teamId: 100 },
            { puuid: "puuid-b", teamId: 200 },
          ],
        },
      });
      // Riot 최신 목록은 뒷 경기(KR_SECOND)가 먼저 나온다.
      const secondGame = game(completedAt.getTime() + 40 * 60 * 1000); // 40분 뒤
      const firstGame = game(completedAt.getTime()); // 대진과 동일 시각

      const findUnique = jest.fn().mockResolvedValue(storedMatch);
      const update = jest.fn().mockResolvedValue(undefined);
      const getMatchIdsByPuuid = jest
        .fn()
        .mockResolvedValue(["KR_SECOND", "KR_FIRST"]);
      const getMatchById = jest.fn(async (id: string) =>
        id === "KR_SECOND" ? secondGame : firstGame,
      );
      const service = createService(
        { findUnique, update },
        { getMatchIdsByPuuid, getMatchById },
      );
      jest
        .spyOn(service as never, "saveMatchData" as never)
        .mockResolvedValue(undefined as never);

      await service.collectMatchDataByPuuidCrossref("match-first-game");

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ riotMatchId: "KR_FIRST" }),
        }),
      );
    });

    it("첫 멤버의 목록에서 매치를 찾으면 나머지 멤버는 조회하지 않는다", async () => {
      const completedAt = new Date("2026-07-13T10:00:00.000Z");
      const member = (userId: string, puuid: string) => ({
        userId,
        user: { riotAccounts: [{ puuid }] },
      });
      const storedMatch = {
        id: "match-early-exit",
        riotMatchId: null,
        teamAId: "a",
        teamBId: "b",
        startedAt: new Date("2026-07-13T09:30:00.000Z"),
        completedAt,
        teamA: {
          id: "a",
          members: [
            member("user-a1", "puuid-a1"),
            member("user-a2", "puuid-a2"),
          ],
        },
        teamB: {
          id: "b",
          members: [
            member("user-b1", "puuid-b1"),
            member("user-b2", "puuid-b2"),
          ],
        },
      };
      // 4명 전원이 참가한 정상 커스텀 게임 → 첫 후보에서 검증 통과해야 한다.
      const candidateData = {
        info: {
          queueId: 0,
          gameType: "CUSTOM_GAME",
          gameEndTimestamp: completedAt.getTime(),
          participants: [
            { puuid: "puuid-a1", teamId: 100 },
            { puuid: "puuid-a2", teamId: 100 },
            { puuid: "puuid-b1", teamId: 200 },
            { puuid: "puuid-b2", teamId: 200 },
          ],
        },
      };
      const findUnique = jest.fn().mockResolvedValue(storedMatch);
      const update = jest.fn().mockResolvedValue(undefined);
      const getMatchIdsByPuuid = jest.fn().mockResolvedValue(["KR_777"]);
      const getMatchById = jest.fn().mockResolvedValue(candidateData);
      const service = createService(
        { findUnique, update },
        { getMatchIdsByPuuid, getMatchById },
      );
      jest
        .spyOn(service as never, "saveMatchData" as never)
        .mockResolvedValue(undefined as never);

      await service.collectMatchDataByPuuidCrossref("match-early-exit");

      // 교집합을 위해 여러 명을 훑지 않고, 첫 멤버 한 명만 조회한다.
      expect(getMatchIdsByPuuid).toHaveBeenCalledTimes(1);
      // 매치 상세도 후보 1건만 조회한다.
      expect(getMatchById).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ riotMatchId: "KR_777" }),
        }),
      );
    });

    it("첫 멤버에게서 못 찾으면 다음 멤버로 넘어간다", async () => {
      const completedAt = new Date("2026-07-13T10:00:00.000Z");
      const member = (userId: string, puuid: string) => ({
        userId,
        user: { riotAccounts: [{ puuid }] },
      });
      const storedMatch = {
        id: "match-fallback",
        riotMatchId: null,
        teamAId: "a",
        teamBId: "b",
        startedAt: new Date("2026-07-13T09:30:00.000Z"),
        completedAt,
        teamA: { id: "a", members: [member("user-a", "puuid-a")] },
        teamB: { id: "b", members: [member("user-b", "puuid-b")] },
      };
      const validData = {
        info: {
          queueId: 0,
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
      // 첫 멤버(puuid-a)의 목록은 Riot 인덱싱 지연으로 비어 있다.
      const getMatchIdsByPuuid = jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(["KR_888"]);
      const getMatchById = jest.fn().mockResolvedValue(validData);
      const service = createService(
        { findUnique, update },
        { getMatchIdsByPuuid, getMatchById },
      );
      jest
        .spyOn(service as never, "saveMatchData" as never)
        .mockResolvedValue(undefined as never);

      await service.collectMatchDataByPuuidCrossref("match-fallback");

      // 첫 멤버가 빈손이어도 두 번째 멤버로 폴백해 복구한다.
      expect(getMatchIdsByPuuid).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ riotMatchId: "KR_888" }),
        }),
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
    /**
     * 내전 매치 1개(팀당 1명) + Riot 참가자 목록으로 saveMatchData를 실제 호출한다.
     * @param linkRiotAccounts false면 멤버들이 라이엇 계정을 연동하지 않은 상태
     */
    const runSave = async (
      participantPuuids: string[],
      linkRiotAccounts = true,
    ) => {
      const riotAccounts = (puuid: string) =>
        linkRiotAccounts ? [{ puuid }] : [];
      const storedMatch = {
        id: "match-1",
        teamAId: "a",
        teamBId: "b",
        teamA: {
          id: "a",
          members: [
            {
              userId: "user-a",
              user: { riotAccounts: riotAccounts("puuid-a") },
            },
          ],
        },
        teamB: {
          id: "b",
          members: [
            {
              userId: "user-b",
              user: { riotAccounts: riotAccounts("puuid-b") },
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

    it("라이엇 계정 연동 멤버가 없으면 빈 전적을 완료 처리하지 않는다", async () => {
      // 기대 참가자가 0명이면 불완전 검사(0 < 0)를 통과해버린다 → 별도로 막아야 한다
      const { call, tx, matchUpdate } = await runSave(
        ["puuid-a", "puuid-b"],
        false,
      );

      await expect(call).rejects.toThrow(/기대 참가자가 없다/);
      expect(tx.matchParticipant.create).not.toHaveBeenCalled();
      expect(matchUpdate).not.toHaveBeenCalled();
    });
  });
});
