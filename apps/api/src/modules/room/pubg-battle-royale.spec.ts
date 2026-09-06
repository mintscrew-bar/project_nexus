import {
  afterTeamsPath,
  getPubgGameMode,
  isValidPubgRoomSize,
  teamCountForRoom,
  teamSizeForRoom,
} from "@nexus/types";

/**
 * 배틀로얄(대회형식)을 열 수 있는 상태인지 훑는다.
 *
 * 킬내기와 달리 팀이 8~25개라, 롤을 전제로 만든 흐름이 그대로는 안 맞는
 * 지점이 여럿 있었다. 여기서 검증하는 건 "정원과 팀 수가 맞아떨어지는가"와
 * "편성 뒤 어디로 가는가"다.
 */
describe("배틀로얄 방 구성", () => {
  const br = (maxParticipants: number) => ({
    gameTitle: "PUBG" as const,
    pubgGameMode: "BATTLE_ROYALE" as const,
    maxParticipants,
  });

  it("32명 8팀부터 100명 25팀까지", () => {
    const sizes = getPubgGameMode("BATTLE_ROYALE").roomSizes;
    expect(sizes).toEqual([32, 40, 48, 64, 80, 100]);
    for (const size of sizes) {
      expect(teamSizeForRoom(br(size))).toBe(4);
      expect(teamCountForRoom(br(size))).toBe(size / 4);
      // 정원이 팀 인원으로 나누어떨어져야 빈자리 없이 팀이 찬다.
      expect(size % 4).toBe(0);
    }
  });

  it("킬내기 정원은 배틀로얄에서 거부된다", () => {
    // 6·8·14·16 은 팀이 2~4개뿐이라 순위 점수가 금방 굳는다.
    for (const size of [6, 8, 14, 16]) {
      expect(isValidPubgRoomSize(size, "BATTLE_ROYALE")).toBe(false);
    }
  });

  it("편성이 끝나면 대진표가 아니라 스크림으로 간다", () => {
    // 대진표는 2의 거듭제곱에 가까운 팀 수를 전제로 짜여 있어 25팀에서는
    // 만들어지지도 않는다.
    for (const teamMode of [
      "AUCTION",
      "SNAKE_DRAFT",
      "AUTO_BALANCE",
      "MANUAL_TEAM",
    ] as const) {
      expect(
        afterTeamsPath(
          {
            id: "r1",
            gameTitle: "PUBG",
            pubgGameMode: "BATTLE_ROYALE",
            teamMode,
          },
          "/pubg",
        ),
      ).toBe("/pubg/tournaments/r1/scrim");
    }
  });

  it("모든 팀 편성 방식을 쓸 수 있다", () => {
    // 대규모라고 편성 방식을 줄이지 않는다.
    expect(getPubgGameMode("BATTLE_ROYALE").teamModes).toEqual([
      "AUCTION",
      "SNAKE_DRAFT",
      "AUTO_BALANCE",
      "MANUAL_TEAM",
    ]);
  });
});
