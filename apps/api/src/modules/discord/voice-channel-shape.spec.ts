import { teamCountForRoom, teamSizeForRoom } from "@nexus/types";

/**
 * 디스코드 음성채널 정원.
 *
 * 팀 채널이 `userLimit: 5`(롤 고정), 대기실이 `50` 고정이었다.
 * 8대8 깐부킬내기는 8명이 5인 채널에 못 들어가고, 100명 배틀로얄은
 * 절반이 대기실에 못 들어간다. 여기서 검증하는 건 방 형태 → 정원 계산이다.
 */
describe("음성채널 정원", () => {
  /** 서비스가 쓰는 것과 같은 계산 */
  const teamChannelLimit = (teamSize: number) =>
    Math.min(99, Math.max(1, teamSize));
  const lobbyLimit = (maxParticipants: number) =>
    maxParticipants > 99 ? 0 : maxParticipants;

  it("킬내기는 팀 인원이 정원을 따라간다", () => {
    for (const [size, expected] of [
      [6, 3],
      [8, 4],
      [14, 7],
      [16, 8],
    ] as const) {
      const shape = {
        gameTitle: "PUBG" as const,
        pubgGameMode: "KILL_MATCH" as const,
        maxParticipants: size,
      };
      expect(teamChannelLimit(teamSizeForRoom(shape))).toBe(expected);
    }
  });

  it("배틀로얄은 4인 스쿼드", () => {
    const shape = {
      gameTitle: "PUBG" as const,
      pubgGameMode: "BATTLE_ROYALE" as const,
      maxParticipants: 64,
    };
    expect(teamChannelLimit(teamSizeForRoom(shape))).toBe(4);
    expect(teamCountForRoom(shape)).toBe(16);
  });

  it("롤은 5인", () => {
    expect(
      teamChannelLimit(
        teamSizeForRoom({ gameTitle: "LOL", maxParticipants: 40 }),
      ),
    ).toBe(5);
  });

  it("대기실은 방 전원이 들어간다", () => {
    expect(lobbyLimit(10)).toBe(10);
    expect(lobbyLimit(32)).toBe(32);
    // 디스코드 상한이 99라 그 이상은 제한 없음(0)으로 둔다.
    expect(lobbyLimit(100)).toBe(0);
  });

  it("정원이 0이어도 채널 정원은 1 이상", () => {
    // userLimit 0 은 "제한 없음"이라 팀 채널에 쓰면 아무나 들어온다.
    expect(teamChannelLimit(0)).toBe(1);
  });
});
