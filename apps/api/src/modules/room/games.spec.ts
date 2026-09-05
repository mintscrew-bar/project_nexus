import {
  DEFAULT_GAME,
  GAMES,
  GAME_TITLES,
  enabledGames,
  gameFromSlug,
  getGame,
  isValidRoomSize,
  teamCountForRoomSize,
  teamCountForParticipants,
  teamSizeForGame,
  minDraftParticipants,
} from "@nexus/types";

describe("게임 정의", () => {
  it("정의된 게임은 slug가 서로 겹치지 않는다", () => {
    // slug가 겹치면 /lol · /pubg 라우팅이 엉킨다.
    const slugs = GAME_TITLES.map((title) => GAMES[title].slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("정원은 팀 인원으로 나누어떨어져야 한다", () => {
    // 나머지가 남으면 인원이 모여도 팀을 못 짠다.
    //
    // 배그는 예외다 — 모드마다 팀 인원이 달라(킬내기는 정원÷2) 게임 단위
    // `roomSizes` 는 모드별 값의 합집합일 뿐이다. 실제 불변식은 모드별로
    // `pubg-room.spec.ts` 에서 "팀 정원 × 팀 수 = 방 정원"으로 검증한다.
    for (const title of GAME_TITLES) {
      if (title === "PUBG") continue;
      const game = GAMES[title];
      for (const size of game.roomSizes) {
        expect(size % game.teamSize).toBe(0);
      }
    }
  });

  it("모든 게임이 수동 팀 배정은 지원한다 — 마지막 수단이 항상 있어야 한다", () => {
    for (const title of GAME_TITLES) {
      expect(GAMES[title].teamModes).toContain("MANUAL_TEAM");
    }
  });

  it("포지션이 없는 게임은 역할 선택 단계를 거치지 않는다", () => {
    // 자동 밸런스는 포지션 유무와 무관하다 — 배그는 NEXUS 편성 점수로 돈다.
    // 갈리는 건 편성 뒤에 역할 선택 화면을 여는지다.
    expect(GAMES.PUBG.hasPositions).toBe(false);
    expect(GAMES.LOL.hasPositions).toBe(true);
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
  it("노출하기로 한 게임만 나온다", () => {
    const titles = enabledGames().map((game) => game.title);
    // 배그는 계정 등록·방 개설 틀이 들어간 뒤로 스위처에 노출한다.
    expect(titles).toEqual(["LOL", "PUBG"]);
  });

  it("enabled=false 인 게임은 목록에서 빠진다", () => {
    const disabled = GAME_TITLES.filter((title) => !GAMES[title].enabled);
    const titles = enabledGames().map((game) => game.title);
    disabled.forEach((title) => expect(titles).not.toContain(title));
  });
});

describe("팀 인원 일반화", () => {
  it("게임별 팀 인원 — 롤 5인, 배그 4인", () => {
    expect(teamSizeForGame("LOL")).toBe(5);
    expect(teamSizeForGame("PUBG")).toBe(4);
    expect(teamSizeForGame()).toBe(teamSizeForGame(DEFAULT_GAME));
  });

  it("실제 참가 인원으로 팀 수를 낸다", () => {
    expect(teamCountForParticipants(10, "LOL")).toBe(2);
    expect(teamCountForParticipants(40, "LOL")).toBe(8);
    expect(teamCountForParticipants(16, "PUBG")).toBe(4);
    expect(teamCountForParticipants(64, "PUBG")).toBe(16);
  });

  it("정원이 덜 찬 테스트 로비에서도 최소 2팀은 나온다", () => {
    expect(teamCountForParticipants(4, "LOL")).toBe(2);
    expect(teamCountForParticipants(4, "PUBG")).toBe(2);
    expect(teamCountForParticipants(0, "LOL")).toBe(2);
  });

  it("드래프트 최소 인원은 2팀 정원", () => {
    expect(minDraftParticipants("LOL")).toBe(10);
    expect(minDraftParticipants("PUBG")).toBe(8);
  });
});
