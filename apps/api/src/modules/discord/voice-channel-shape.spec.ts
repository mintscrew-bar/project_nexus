import {
  squadCountForRoom,
  squadSizeForRoom,
  teamCountForRoom,
  teamSizeForRoom,
} from "@nexus/types";

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

/**
 * 인게임 스쿼드 정원은 4명이다.
 *
 * 깐부킬내기(7대7·8대8)는 한 팀이 스쿼드 둘로 갈라져 들어가므로 음성채널도
 * 팀당 하나가 아니라 스쿼드마다 하나가 필요하다.
 */
describe("스쿼드 분할", () => {
  const killMatch = (maxParticipants: number) => ({
    gameTitle: "PUBG" as const,
    pubgGameMode: "KILL_MATCH" as const,
    maxParticipants,
  });

  it("4인 이하 팀은 스쿼드 하나", () => {
    expect(squadCountForRoom(killMatch(6))).toBe(1); // 3대3
    expect(squadCountForRoom(killMatch(8))).toBe(1); // 4대4
  });

  it("깐부는 스쿼드 둘로 갈린다", () => {
    expect(squadCountForRoom(killMatch(14))).toBe(2); // 7대7
    expect(squadCountForRoom(killMatch(16))).toBe(2); // 8대8
  });

  it("채널 정원은 스쿼드 크기 — 7명은 4 + 3 이라 4에 맞춘다", () => {
    expect(squadSizeForRoom(killMatch(14))).toBe(4);
    expect(squadSizeForRoom(killMatch(16))).toBe(4);
    expect(squadSizeForRoom(killMatch(6))).toBe(3);
  });

  it("8대8은 채널이 넷 필요하다", () => {
    const room = killMatch(16);
    expect(teamCountForRoom(room) * squadCountForRoom(room)).toBe(4);
  });

  it("배틀로얄과 롤은 팀이 곧 스쿼드", () => {
    expect(
      squadCountForRoom({
        gameTitle: "PUBG",
        pubgGameMode: "BATTLE_ROYALE",
        maxParticipants: 64,
      }),
    ).toBe(1);
    expect(squadCountForRoom({ gameTitle: "LOL", maxParticipants: 40 })).toBe(
      1,
    );
  });

  it("스쿼드 채널에 인원을 나눠 담는다", () => {
    // 서비스가 쓰는 것과 같은 계산 — 7명을 2채널이면 4 + 3.
    const split = (memberCount: number, channels: number) => {
      const perChannel = Math.ceil(memberCount / channels);
      const counts = new Array(channels).fill(0);
      for (let i = 0; i < memberCount; i++) {
        counts[Math.min(channels - 1, Math.floor(i / perChannel))] += 1;
      }
      return counts;
    };
    expect(split(8, 2)).toEqual([4, 4]);
    expect(split(7, 2)).toEqual([4, 3]);
    expect(split(4, 1)).toEqual([4]);
    // 인원이 채널보다 적어도 넘치지 않는다.
    expect(split(1, 2)).toEqual([1, 0]);
  });
});
