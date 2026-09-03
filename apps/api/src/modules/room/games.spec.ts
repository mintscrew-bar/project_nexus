import {
  DEFAULT_GAME,
  GAMES,
  GAME_TITLES,
  enabledGames,
  gameFromSlug,
  getGame,
  isValidRoomSize,
  teamCountForRoomSize,
} from "@nexus/types";

describe("게임 정의", () => {
  it("정의된 게임은 slug가 서로 겹치지 않는다", () => {
    // slug가 겹치면 /lol · /pubg 라우팅이 엉킨다.
    const slugs = GAME_TITLES.map((title) => GAMES[title].slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("정원은 팀 인원으로 나누어떨어져야 한다", () => {
    // 나머지가 남으면 인원이 모여도 팀을 못 짠다.
    for (const title of GAME_TITLES) {
      const game = GAMES[title];
      for (const size of game.roomSizes) {
        expect(size % game.teamSize).toBe(0);
      }
    }
  });

  it("포지션이 없는 게임은 자동 밸런스를 고를 수 없다", () => {
    // 자동 밸런스는 라인별 점수에 기대는 방식이다.
    for (const title of GAME_TITLES) {
      const game = GAMES[title];
      if (!game.hasPositions) {
        expect(game.teamModes).not.toContain("AUTO_BALANCE");
      }
    }
  });

  it("기본 게임은 활성 상태여야 한다", () => {
    expect(getGame(DEFAULT_GAME).enabled).toBe(true);
  });
});

describe("teamCountForRoomSize", () => {
  it("게임을 생략하면 롤 기준(5인 1팀)으로 센다", () => {
    expect(teamCountForRoomSize(10)).toBe(2);
    expect(teamCountForRoomSize(20)).toBe(4);
    expect(teamCountForRoomSize(40)).toBe(8);
  });

  it("배그는 4인 스쿼드로 센다", () => {
    expect(teamCountForRoomSize(16, "PUBG")).toBe(4);
    expect(teamCountForRoomSize(64, "PUBG")).toBe(16);
  });
});

describe("isValidRoomSize", () => {
  it("게임마다 고를 수 있는 정원이 다르다", () => {
    expect(isValidRoomSize(10, "LOL")).toBe(true);
    expect(isValidRoomSize(16, "LOL")).toBe(false);
    expect(isValidRoomSize(16, "PUBG")).toBe(true);
    expect(isValidRoomSize(10, "PUBG")).toBe(false);
  });
});

describe("gameFromSlug", () => {
  it("URL 프리픽스로 게임을 찾는다", () => {
    expect(gameFromSlug("lol")).toBe("LOL");
    expect(gameFromSlug("pubg")).toBe("PUBG");
  });

  it("모르는 값이면 null — 라우팅에서 404로 떨어뜨릴 수 있어야 한다", () => {
    expect(gameFromSlug("valorant")).toBeNull();
    expect(gameFromSlug("")).toBeNull();
    expect(gameFromSlug(undefined)).toBeNull();
  });
});

describe("enabledGames", () => {
  it("준비 중인 게임은 빠진다", () => {
    const titles = enabledGames().map((game) => game.title);
    expect(titles).toContain("LOL");
    // 배그는 Phase 3까지 끝나기 전에는 방을 만들 수 없다.
    expect(titles).not.toContain("PUBG");
  });
});
