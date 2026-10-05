import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PubgController } from "./pubg.controller";
import { PubgHistoryService } from "./pubg-history.service";
import { PubgSearchService } from "./pubg-search.service";
import { SearchPubgPlayersQueryDto } from "./dto/search-pubg-players.dto";

/**
 * 배그 내전 기록 검색 (2026-10-06).
 * PUBG API 를 부르지 않고(10 req/분 예산을 쓰지 않는다) NEXUS 유저를 닉네임·PUBG 닉네임으로 찾는다.
 * 개인정보 설정(showRiotAccounts·showMatchHistory)을 지킨다.
 */

type Row = {
  id: string;
  username: string;
  avatar?: string | null;
  settings?: { showRiotAccounts?: boolean; showMatchHistory?: boolean } | null;
  pubgAccounts?: Array<{
    playerName: string;
    lastMatchShard?: "STEAM" | "KAKAO" | null;
    pubgTier?: string | null;
    nexusTier?: string | null;
    isPrimary?: boolean;
  }>;
};

const row = (over: Row): any => ({
  avatar: null,
  settings: null,
  pubgAccounts: [{ playerName: `${over.username}_pubg`, isPrimary: true }],
  ...over,
});

function build(rows: Row[] = []) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue(rows.map(row)) },
  };
  return { service: new PubgSearchService(prisma as any), prisma };
}

describe("PubgSearchService", () => {
  it("검색어가 2자 미만이면 DB 를 조회하지 않는다", async () => {
    const { service, prisma } = build([{ id: "u1", username: "하루" }]);

    await expect(service.searchPlayers("a")).resolves.toEqual([]);
    await expect(service.searchPlayers("  ")).resolves.toEqual([]);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("배그 계정이 있는 비제재 유저를 닉네임·PUBG 닉네임 부분 일치(대소문자 무시)로 찾는다", async () => {
    const { service, prisma } = build();

    await service.searchPlayers("Haru");

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.isBanned).toBe(false);
    expect(where.pubgAccounts).toEqual({ some: {} });
    expect(where.OR[0]).toEqual({
      username: { contains: "Haru", mode: "insensitive" },
    });
    expect(where.OR[1].AND[0]).toEqual({
      pubgAccounts: {
        some: { playerName: { contains: "Haru", mode: "insensitive" } },
      },
    });
  });

  it("PUBG 닉네임으로는 게임 계정을 숨긴 사람을 찾지 못하게 조건을 건다", async () => {
    const { service, prisma } = build();

    await service.searchPlayers("haru");

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.OR[1].AND[1]).toEqual({
      NOT: { settings: { is: { showRiotAccounts: false } } },
    });
    // NEXUS 닉네임 일치 쪽에는 그 조건이 없다 — 닉네임으로는 찾을 수 있다.
    expect(where.OR[0]).not.toHaveProperty("AND");
  });

  it("PUBG API 같은 외부 의존성이 없다 — 예산을 쓰지 않는다", () => {
    expect(PubgSearchService.length).toBe(1);
  });

  it("정확히 일치 → 앞부분 일치 → 포함 순으로 정렬하고 같은 등급은 이름순", async () => {
    const { service } = build([
      { id: "u3", username: "the_haru_x" },
      { id: "u2", username: "haruki" },
      { id: "u1", username: "haru" },
      { id: "u4", username: "harua" },
    ]);

    const result = await service.searchPlayers("haru");

    expect(result.map((r) => r.username)).toEqual([
      "haru", // 정확히 일치
      "harua", // 앞부분 일치 (이름순)
      "haruki",
      "the_haru_x", // 포함
    ]);
  });

  it("후보를 정렬한 뒤에 limit 으로 자른다 — 정확히 일치하는 사람이 뒤에 있어도 남는다", async () => {
    const rows: Row[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      username: `haru${String(i).padStart(2, "0")}`,
    }));
    rows.push({ id: "exact", username: "haru" });
    const { service } = build(rows);

    const result = await service.searchPlayers("haru", 3);

    expect(result).toHaveLength(3);
    expect(result[0].username).toBe("haru");
  });

  it("PUBG 닉네임으로 찾으면 일치한 계정을 보여준다(대표 계정이 아니어도)", async () => {
    const { service } = build([
      {
        id: "u1",
        username: "하루마룬",
        pubgAccounts: [
          { playerName: "main_acc", isPrimary: true, lastMatchShard: "KAKAO" },
          {
            playerName: "smurf_haru",
            lastMatchShard: "STEAM",
            pubgTier: null,
            nexusTier: "3",
          },
        ],
      },
    ]);

    const [hit] = await service.searchPlayers("smurf");

    expect(hit.pubgAccount).toEqual({
      playerName: "smurf_haru",
      platform: "STEAM",
      pubgTier: null,
      nexusTier: "3",
    });
  });

  it("검색어와 겹치는 계정이 없으면 대표 계정을 보여준다", async () => {
    const { service } = build([
      {
        id: "u1",
        username: "하루마룬",
        pubgAccounts: [
          { playerName: "main_acc", isPrimary: true, lastMatchShard: "KAKAO" },
        ],
      },
    ]);

    const [hit] = await service.searchPlayers("하루");

    expect(hit.pubgAccount?.playerName).toBe("main_acc");
  });

  it("게임 계정 공개를 끈 사람은 결과에 계정을 싣지 않는다", async () => {
    const { service } = build([
      {
        id: "u1",
        username: "하루마룬",
        settings: { showRiotAccounts: false },
      },
    ]);

    const [hit] = await service.searchPlayers("하루");

    expect(hit.pubgAccount).toBeNull();
    expect(hit.username).toBe("하루마룬");
  });

  it("전적 비공개인 사람은 결과에 나오되 historyHidden 이다", async () => {
    const { service } = build([
      { id: "u1", username: "하루a", settings: { showMatchHistory: false } },
      { id: "u2", username: "하루b", settings: { showMatchHistory: true } },
      { id: "u3", username: "하루c", settings: null },
    ]);

    const result = await service.searchPlayers("하루");

    expect(result.map((r) => [r.username, r.historyHidden])).toEqual([
      ["하루a", true],
      ["하루b", false],
      ["하루c", false],
    ]);
  });
});

describe("PubgHistoryService.assertHistoryVisible", () => {
  const build2 = (settings: { showMatchHistory: boolean } | null) => {
    const prisma = {
      userSettings: { findUnique: jest.fn().mockResolvedValue(settings) },
    };
    return { service: new PubgHistoryService(prisma as any), prisma };
  };

  it("본인은 설정과 상관없이 항상 볼 수 있고 DB 도 조회하지 않는다", async () => {
    const { service, prisma } = build2({ showMatchHistory: false });

    await expect(
      service.assertHistoryVisible("u1", "u1"),
    ).resolves.toBeUndefined();
    expect(prisma.userSettings.findUnique).not.toHaveBeenCalled();
  });

  it("상대가 전적을 공개하지 않으면 403", async () => {
    const { service } = build2({ showMatchHistory: false });

    await expect(
      service.assertHistoryVisible("u1", "u2"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([[{ showMatchHistory: true }], [null]])(
    "공개이거나 설정 행이 없으면(기본값 공개) 볼 수 있다: %p",
    async (settings) => {
      const { service } = build2(settings);

      await expect(
        service.assertHistoryVisible("u1", "u2"),
      ).resolves.toBeUndefined();
    },
  );
});

describe("PubgController 연결", () => {
  const build3 = () => {
    const history = {
      assertHistoryVisible: jest.fn().mockResolvedValue(undefined),
      getUserHistory: jest.fn().mockResolvedValue({ items: [] }),
    };
    const search = { searchPlayers: jest.fn().mockResolvedValue([]) };
    const controller = new PubgController(
      {} as any,
      history as any,
      {} as any,
      search as any,
    );
    return { controller, history, search };
  };

  it("전적 조회는 공개 확인을 거친 뒤에만 기록을 읽는다", async () => {
    const { controller, history } = build3();
    history.assertHistoryVisible.mockRejectedValue(new ForbiddenException());

    await expect(controller.getUserHistory("u1", "u2")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(history.assertHistoryVisible).toHaveBeenCalledWith("u1", "u2");
    expect(history.getUserHistory).not.toHaveBeenCalled();
  });

  it("공개이면 기록을 돌려준다", async () => {
    const { controller, history } = build3();

    await expect(controller.getUserHistory("u1", "u2")).resolves.toEqual({
      items: [],
    });
    expect(history.getUserHistory).toHaveBeenCalledWith("u2");
  });

  it("검색은 검색 서비스에 검색어와 limit 을 넘긴다", async () => {
    const { controller, search } = build3();

    await controller.searchPlayers({ q: "haru", limit: 5 } as any);

    expect(search.searchPlayers).toHaveBeenCalledWith("haru", 5);
  });
});

describe("SearchPubgPlayersQueryDto", () => {
  const check = (plain: Record<string, unknown>) =>
    validate(plainToInstance(SearchPubgPlayersQueryDto, plain));

  it("정상 값", async () => {
    expect(await check({ q: "haru" })).toHaveLength(0);
    expect(await check({ q: "haru", limit: "5" })).toHaveLength(0);
  });

  it("검색어 앞뒤 공백은 잘라서 길이를 센다", async () => {
    const dto = plainToInstance(SearchPubgPlayersQueryDto, { q: "  ha  " });
    expect(dto.q).toBe("ha");
    expect(await validate(dto)).toHaveLength(0);
    expect(await check({ q: " a " })).not.toHaveLength(0);
  });

  it.each([
    [{ q: "a" }, "한 글자"],
    [{ q: "" }, "빈 값"],
    [{ q: "x".repeat(31) }, "31자"],
    [{}, "검색어 없음"],
    [{ q: "haru", limit: "0" }, "limit 0"],
    [{ q: "haru", limit: "21" }, "limit 21"],
    [{ q: "haru", limit: "abc" }, "limit 문자"],
  ])("거부한다: %j (%s)", async (plain, _label) => {
    expect(await check(plain as Record<string, unknown>)).not.toHaveLength(0);
  });
});
