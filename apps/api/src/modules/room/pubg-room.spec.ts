import {
  DEFAULT_PUBG_GAME_MODE,
  getPubgGameMode,
  isValidPubgRoomSize,
  pubgGameModes,
  pubgRoomTitle,
  stripPubgTitlePrefix,
  teamCountForRoomSize,
} from "@nexus/types";

describe("배그 경기 모드", () => {
  it("킬내기는 2팀 8명 — 4대4가 기준", () => {
    const killMatch = getPubgGameMode("KILL_MATCH");
    expect(killMatch.roomSizes).toEqual([8]);
    expect(teamCountForRoomSize(8, "PUBG")).toBe(2);
    expect(killMatch.resultShape).toBe("BRACKET");
  });

  it("배틀로얄은 4팀부터 — 2~3팀으로는 순위 점수가 의미를 잃는다", () => {
    const br = getPubgGameMode("BATTLE_ROYALE");
    expect(br.roomSizes[0]).toBe(16);
    expect(teamCountForRoomSize(br.roomSizes[0], "PUBG")).toBe(4);
    expect(teamCountForRoomSize(64, "PUBG")).toBe(16);
    expect(br.resultShape).toBe("POINT_LEADERBOARD");
  });

  it("자유 매치는 수동 배정만 쓰고 결과를 남기지 않는다", () => {
    const free = getPubgGameMode("FREE_MATCH");
    expect(free.teamModes).toEqual(["MANUAL_TEAM"]);
    expect(free.resultShape).toBe("NONE");
  });

  it("모드에 없는 정원은 거른다", () => {
    expect(isValidPubgRoomSize(8, "KILL_MATCH")).toBe(true);
    // 킬내기는 2팀 고정이라 16명(4팀)이 될 수 없다.
    expect(isValidPubgRoomSize(16, "KILL_MATCH")).toBe(false);
    expect(isValidPubgRoomSize(8, "BATTLE_ROYALE")).toBe(false);
    expect(isValidPubgRoomSize(16, "BATTLE_ROYALE")).toBe(true);
  });

  it("모든 모드 정원이 4의 배수 — 4인 스쿼드 기준", () => {
    for (const mode of pubgGameModes()) {
      for (const size of mode.roomSizes) {
        expect(size % 4).toBe(0);
      }
    }
  });

  it("기본 모드는 배틀로얄", () => {
    expect(DEFAULT_PUBG_GAME_MODE).toBe("BATTLE_ROYALE");
  });
});

describe("방 제목 플랫폼 태그", () => {
  it("표시할 때 붙인다", () => {
    expect(pubgRoomTitle("즐겜 스크림", "STEAM")).toBe("[스배] 즐겜 스크림");
    expect(pubgRoomTitle("즐겜 스크림", "KAKAO")).toBe("[카배] 즐겜 스크림");
  });

  it("플랫폼이 없으면 그대로 둔다 (롤 방)", () => {
    expect(pubgRoomTitle("솔랭팟", null)).toBe("솔랭팟");
  });

  it("접두사가 저장돼 있던 옛 제목에서 원본을 꺼낸다", () => {
    // 접두사를 저장하면 제목을 고칠 때마다 겹쳐 붙는다.
    expect(stripPubgTitlePrefix("[스배] 즐겜 스크림")).toBe("즐겜 스크림");
    expect(stripPubgTitlePrefix("[카배]즐겜 스크림")).toBe("즐겜 스크림");
    expect(stripPubgTitlePrefix("즐겜 스크림")).toBe("즐겜 스크림");
    // 두 번 붙어 있어도 한 겹만 벗긴 뒤 다시 부르면 원본이 나온다.
    expect(stripPubgTitlePrefix(stripPubgTitlePrefix("[스배] [스배] 방"))).toBe(
      "방",
    );
  });
});
