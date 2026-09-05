import {
  afterTeamsPath,
  getRoomStagePath,
  getTeamModeStagePath,
  type StageRoom,
} from "@nexus/types";

const lolRoom = (over: Partial<StageRoom> = {}): StageRoom => ({
  id: "r1",
  gameTitle: "LOL",
  teamMode: "AUCTION",
  ...over,
});

const pubgRoom = (over: Partial<StageRoom> = {}): StageRoom => ({
  id: "r1",
  gameTitle: "PUBG",
  pubgGameMode: "BATTLE_ROYALE",
  teamMode: "AUCTION",
  ...over,
});

describe("팀 편성 이후 경로", () => {
  it("롤은 역할 선택으로", () => {
    expect(afterTeamsPath(lolRoom(), "/lol")).toBe("/lol/role-selection/r1");
  });

  it("배그는 역할 선택 단계가 없다", () => {
    // 라인 5개짜리 화면이 배그 방에 열리면 안 된다.
    expect(afterTeamsPath(pubgRoom(), "/pubg")).not.toContain("role-selection");
  });

  it("배틀로얄은 대진표가 아니라 스크림으로", () => {
    expect(afterTeamsPath(pubgRoom(), "/pubg")).toBe(
      "/pubg/tournaments/r1/scrim",
    );
  });

  it("킬내기도 라운드 누적이라 스크림으로", () => {
    // 킬 +1 · 사망 −3 · 치킨 +8 을 여러 판에 걸쳐 누적한다. 한 판 승패가 아니다.
    expect(
      afterTeamsPath(pubgRoom({ pubgGameMode: "KILL_MATCH" }), "/pubg"),
    ).toBe("/pubg/tournaments/r1/scrim");
  });

  it("자유 매치만 결과를 남기지 않아 대진표로 간다", () => {
    expect(
      afterTeamsPath(pubgRoom({ pubgGameMode: "FREE_MATCH" }), "/pubg"),
    ).toBe("/pubg/tournaments/r1/bracket");
  });

  it("모든 경로가 게임 프리픽스 아래에 있다", () => {
    // 프리픽스를 빼먹으면 리다이렉트를 한 번 더 타고 배그에서 롤로 샌다.
    for (const room of [lolRoom(), pubgRoom()]) {
      const prefix = room.gameTitle === "PUBG" ? "/pubg" : "/lol";
      expect(afterTeamsPath(room, prefix).startsWith(`${prefix}/`)).toBe(true);
      expect(getTeamModeStagePath(room, prefix).startsWith(`${prefix}/`)).toBe(
        true,
      );
    }
  });
});

describe("팀 편성 방식별 경로", () => {
  it("경매·스네이크는 각자의 픽 화면으로", () => {
    expect(getTeamModeStagePath(lolRoom({ teamMode: "AUCTION" }), "/lol")).toBe(
      "/lol/auction/r1",
    );
    expect(
      getTeamModeStagePath(lolRoom({ teamMode: "SNAKE_DRAFT" }), "/lol"),
    ).toBe("/lol/draft/r1");
  });

  it("수동 배정·자동 밸런스는 픽 단계가 없어 편성 이후로 바로 간다", () => {
    expect(
      getTeamModeStagePath(lolRoom({ teamMode: "MANUAL_TEAM" }), "/lol"),
    ).toBe("/lol/role-selection/r1");
    expect(
      getTeamModeStagePath(pubgRoom({ teamMode: "MANUAL_TEAM" }), "/pubg"),
    ).toBe("/pubg/tournaments/r1/scrim");
  });
});

describe("진행 중인 방으로 돌아왔을 때", () => {
  it("자동 밸런스는 로비에 머무른다", () => {
    // 방장이 편성 결과를 확인하고 다시 돌릴 수 있어야 한다.
    expect(
      getRoomStagePath(
        { ...lolRoom({ teamMode: "AUTO_BALANCE" }), status: "DRAFT_COMPLETED" },
        "/lol",
      ),
    ).toBeNull();
  });

  it("진행 중인 배틀로얄은 스크림으로", () => {
    expect(
      getRoomStagePath({ ...pubgRoom(), status: "IN_PROGRESS" }, "/pubg"),
    ).toBe("/pubg/tournaments/r1/scrim");
  });

  it("진행 중인 롤 경기는 대진표로", () => {
    expect(
      getRoomStagePath({ ...lolRoom(), status: "IN_PROGRESS" }, "/lol"),
    ).toBe("/lol/tournaments/r1/bracket");
  });

  it("완료 상태는 이동시키지 않는다", () => {
    // COMPLETED 에서 옮기면 returnToLobby 직후 무한 루프가 된다.
    expect(
      getRoomStagePath({ ...lolRoom(), status: "COMPLETED" }, "/lol"),
    ).toBeNull();
  });
});
