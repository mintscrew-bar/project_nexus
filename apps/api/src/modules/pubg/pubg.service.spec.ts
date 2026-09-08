import { ConflictException, NotFoundException } from "@nestjs/common";
import { PubgService } from "./pubg.service";
import type { PubgApiService, PubgPlayerLookup } from "./pubg-api.service";

/**
 * PUBG 계정 등록은 소유권을 인증할 수 없다는 전제 위에 서 있다.
 * 그래서 "먼저 등록한 사람"과 "조회로 확정된 계정 ID"가 유일한 방어선이다.
 */
describe("PubgService 계정 등록", () => {
  const lookupResult = (over: Partial<PubgPlayerLookup> = {}) =>
    ({
      playerId: "account.abc",
      playerName: "테스트닉",
      matchShard: "STEAM",
      recentMatchIds: ["m1", "m2"],
      ...over,
    }) as PubgPlayerLookup;

  const makePrisma = () => ({
    pubgAccount: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: any) => ({
        id: "acc-1",
        ...data,
      })),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  });

  /** 편성 점수 자동 산정은 별도 테스트에서 본다. 여기서는 호출되지 않는다. */
  const makeHistory = () => ({ getUserHistory: jest.fn() }) as any;

  const makeApi = (lookup: PubgPlayerLookup | null) =>
    ({ lookupPlayer: jest.fn().mockResolvedValue(lookup) }) as unknown as
      PubgApiService | any;

  it("조회로 확정한 계정 ID·샤드를 저장한다 (샤드를 사용자에게 묻지 않는다)", async () => {
    const prisma = makePrisma();
    const api = makeApi(lookupResult());
    const service = new PubgService(prisma as any, api, makeHistory());

    const created = await service.registerAccount("user-1", {
      playerName: "  테스트닉  ",
    });

    expect(api.lookupPlayer).toHaveBeenCalledWith("  테스트닉  ");
    expect(created.playerId).toBe("account.abc");
    expect(created.lastMatchShard).toBe("STEAM");
    // API 가 돌려준 표기를 따른다 — 사용자가 친 대소문자가 아니라.
    expect(created.playerName).toBe("테스트닉");
    // 첫 계정은 대표가 된다. 대표가 없으면 로비가 계정을 못 고른다.
    expect(created.isPrimary).toBe(true);
    // 소유권을 올릴 경로가 없다.
    expect(created.verificationStatus).toBe("UNVERIFIED");
  });

  it("매치가 없어 샤드를 못 정해도 등록은 된다", async () => {
    const prisma = makePrisma();
    const service = new PubgService(
      prisma as any,
      makeApi(lookupResult({ matchShard: null, recentMatchIds: [] })),
      makeHistory(),
    );

    const created = await service.registerAccount("user-1", {
      playerName: "새계정",
    });

    expect(created.lastMatchShard).toBeNull();
    expect(created.lastMatchShardCheckedAt).toBeInstanceOf(Date);
  });

  it("조회로 못 찾은 닉네임은 등록하지 않는다", async () => {
    const service = new PubgService(
      makePrisma() as any,
      makeApi(null),
      makeHistory(),
    );
    await expect(
      service.registerAccount("user-1", { playerName: "없는닉" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("같은 계정을 다른 사용자가 가져갈 수 없다", async () => {
    const prisma = makePrisma();
    prisma.pubgAccount.findUnique.mockResolvedValue({ userId: "other" });
    const service = new PubgService(
      prisma as any,
      makeApi(lookupResult()),
      makeHistory(),
    );

    await expect(
      service.registerAccount("user-1", { playerName: "테스트닉" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.pubgAccount.create).not.toHaveBeenCalled();
  });

  it("두 번째 계정은 대표가 되지 않는다", async () => {
    const prisma = makePrisma();
    prisma.pubgAccount.count.mockResolvedValue(1);
    const service = new PubgService(
      prisma as any,
      makeApi(lookupResult()),
      makeHistory(),
    );

    const created = await service.registerAccount("user-1", {
      playerName: "부계정",
    });
    expect(created.isPrimary).toBe(false);
  });

  it("남의 계정 점수는 못 고친다", async () => {
    const prisma = makePrisma();
    const service = new PubgService(
      prisma as any,
      makeApi(lookupResult()),
      makeHistory(),
    );
    await expect(
      service.updateScore("user-1", "acc-x", {
        combatScore: 50,
        iglScore: 50,
        teamplayScore: 50,
        consistencyScore: 50,
        experienceScore: 50,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
