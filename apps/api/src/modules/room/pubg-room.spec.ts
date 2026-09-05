import {
  DEFAULT_PUBG_GAME_MODE,
  defaultPointRuleForMode,
  defaultPresetKeyForMode,
  getPubgGameMode,
  isSplitSquadTeam,
  isValidPubgRoomSize,
  pubgGameModes,
  pubgRoomTitle,
  stripPubgTitlePrefix,
  teamCountForRoom,
  teamCountForRoomSize,
  teamCountForRoster,
  teamSizeForRoom,
} from "@nexus/types";

describe("배그 경기 모드", () => {
  it("킬내기는 항상 2팀 — 정원이 곧 팀 인원 × 2", () => {
    const killMatch = getPubgGameMode("KILL_MATCH");
    // 3대3·4대4, 그리고 두 스쿼드가 한 팀인 깐부킬내기(7대7·8대8).
    expect(killMatch.roomSizes).toEqual([6, 8, 14, 16]);
    for (const size of killMatch.roomSizes) {
      const room = {
        gameTitle: "PUBG" as const,
        pubgGameMode: "KILL_MATCH" as const,
        maxParticipants: size,
      };
      expect(teamCountForRoom(room)).toBe(2);
      expect(teamSizeForRoom(room)).toBe(size / 2);
    }
    // 라운드마다 점수를 누적한다 — 한 판 승패가 아니다.
    expect(killMatch.resultShape).toBe("POINT_LEADERBOARD");
  });

  it("킬내기 팀 수는 참가 인원이 늘어도 2팀이다", () => {
    // 인원으로 나누면 8명 킬내기가 2팀, 16명이 4팀이 돼 킬내기가 아니게 된다.
    const room = {
      gameTitle: "PUBG" as const,
      pubgGameMode: "KILL_MATCH" as const,
    };
    expect(teamCountForRoster(room, 8)).toBe(2);
    expect(teamCountForRoster(room, 16)).toBe(2);
  });

  it("깐부킬내기는 한 팀이 인게임 스쿼드를 넘는다", () => {
    const solo = {
      gameTitle: "PUBG" as const,
      pubgGameMode: "KILL_MATCH" as const,
      maxParticipants: 8,
    };
    const kkanbu = { ...solo, maxParticipants: 16 };
    // 4대4는 스쿼드 하나에 들어가지만 8대8은 두 스쿼드로 갈라진다.
    expect(isSplitSquadTeam(solo)).toBe(false);
    expect(isSplitSquadTeam(kkanbu)).toBe(true);
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
    expect(isValidPubgRoomSize(6, "KILL_MATCH")).toBe(true);
    expect(isValidPubgRoomSize(16, "KILL_MATCH")).toBe(true);
    // 킬내기는 짝수로 반씩 갈라야 해서 홀수·10명 같은 값은 없다.
    expect(isValidPubgRoomSize(10, "KILL_MATCH")).toBe(false);
    // 배틀로얄은 4팀부터 — 2~3팀으로는 순위 점수가 의미를 잃는다.
    expect(isValidPubgRoomSize(8, "BATTLE_ROYALE")).toBe(false);
    expect(isValidPubgRoomSize(16, "BATTLE_ROYALE")).toBe(true);
  });

  it("배틀로얄 정원은 4의 배수 — 인게임 스쿼드가 4인이다", () => {
    for (const size of getPubgGameMode("BATTLE_ROYALE").roomSizes) {
      expect(size % 4).toBe(0);
    }
  });

  it("모든 모드 정원이 짝수 — 팀이 최소 둘로 갈려야 한다", () => {
    for (const mode of pubgGameModes()) {
      for (const size of mode.roomSizes) {
        expect(size % 2).toBe(0);
      }
    }
  });

  it("기본 모드는 킬내기 — 6명이면 열리는 형식이 먼저 와야 한다", () => {
    // 배틀로얄은 16명(4팀)부터라 사람이 모여야 열린다.
    expect(DEFAULT_PUBG_GAME_MODE).toBe("KILL_MATCH");
    expect(getPubgGameMode(DEFAULT_PUBG_GAME_MODE).roomSizes[0]).toBe(6);
    // 목록 순서가 곧 화면 노출 순서다.
    expect(pubgGameModes()[0].mode).toBe("KILL_MATCH");
  });

  it("모드별 기본 포인트 규칙이 갈린다", () => {
    // 킬내기 방에서 배틀로얄 표로 시작하면 사망 감점이 빠진 채로 굴러간다.
    expect(defaultPointRuleForMode("KILL_MATCH").deathPoints).toBe(-3);
    expect(defaultPointRuleForMode("BATTLE_ROYALE").deathPoints ?? 0).toBe(0);
    expect(defaultPresetKeyForMode("KILL_MATCH")).toBe("kill-match");
    expect(defaultPresetKeyForMode("BATTLE_ROYALE")).toBe("standard");
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
