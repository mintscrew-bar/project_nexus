import {
  getPubgGameMode,
  squadCountForRoom,
  squadSizeForRoom,
  teamCountForRoom,
  teamSizeForRoom,
} from "@nexus/types";

/**
 * 디스코드 음성채널 정원.
 *
 * 팀 채널이 `userLimit: 5`(롤 고정), 대기실이 `50` 고정이던 시절이 있었다.
 * 100명 배틀로얄은 절반이 대기실에 못 들어갔다.
 * 여기서 검증하는 건 방 형태 → 정원 계산이다.
 *
 * 배그는 인게임 스쿼드가 4인이고, **그 스쿼드가 곧 한 팀이다.**
 * 편을 몇 개로 나눌지(16명이면 2대2일 수도, 1대1대1대1일 수도)는 방에서
 * 정하는 것이라 코드가 강제하지 않는다. 코드가 보는 것은 스쿼드가 딱
 * 떨어지는가 뿐이다.
 */
describe("음성채널 정원", () => {
  /** 서비스가 쓰는 것과 같은 계산 */
  const teamChannelLimit = (teamSize: number) =>
    Math.min(99, Math.max(1, teamSize));
  const lobbyLimit = (maxParticipants: number) =>
    maxParticipants > 99 ? 0 : maxParticipants;

  it("배그는 모드와 무관하게 4인 스쿼드가 한 팀", () => {
    for (const mode of ["KILL_MATCH", "BATTLE_ROYALE"] as const) {
      for (const size of getPubgGameMode(mode).roomSizes) {
        const shape = {
          gameTitle: "PUBG" as const,
          pubgGameMode: mode,
          maxParticipants: size,
        };
        expect(teamSizeForRoom(shape)).toBe(4);
        expect(teamChannelLimit(teamSizeForRoom(shape))).toBe(4);
      }
    }
  });

  it("팀 수는 정원을 4로 나눈 값", () => {
    const shape = {
      gameTitle: "PUBG" as const,
      pubgGameMode: "BATTLE_ROYALE" as const,
      maxParticipants: 64,
    };
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
 * 정원은 스쿼드가 딱 떨어져야 한다.
 *
 * 4로 나누어떨어지지 않는 정원(6명·14명)은 인게임에서 3인·2인 스쿼드가
 * 생겨 실제 배그 판과 어긋난다. 정원표가 그런 값을 담지 않는 것이
 * 이 규칙의 유일한 방어선이다.
 */
describe("정원과 스쿼드", () => {
  it("배그 정원은 전부 4의 배수", () => {
    for (const mode of ["KILL_MATCH", "BATTLE_ROYALE"] as const) {
      for (const size of getPubgGameMode(mode).roomSizes) {
        expect(size % 4).toBe(0);
      }
    }
  });

  it("킬내기 정원마다 스쿼드 수가 나온다", () => {
    // 8명 2스쿼드 · 12명 3파전 · 16명 4스쿼드(2대2도 1대1대1대1도 가능).
    for (const size of getPubgGameMode("KILL_MATCH").roomSizes) {
      const room = {
        gameTitle: "PUBG" as const,
        pubgGameMode: "KILL_MATCH" as const,
        maxParticipants: size,
      };
      expect(teamCountForRoom(room)).toBe(size / 4);
    }
  });

  it("팀이 곧 스쿼드라 팀당 채널은 하나", () => {
    // 팀 인원이 4를 넘던 시절에는 한 팀이 스쿼드 둘로 갈렸다.
    // 지금은 팀 자체가 스쿼드라 나눌 일이 없다.
    for (const size of getPubgGameMode("KILL_MATCH").roomSizes) {
      const room = {
        gameTitle: "PUBG" as const,
        pubgGameMode: "KILL_MATCH" as const,
        maxParticipants: size,
      };
      expect(squadCountForRoom(room)).toBe(1);
      expect(squadSizeForRoom(room)).toBe(4);
    }
    expect(squadCountForRoom({ gameTitle: "LOL", maxParticipants: 40 })).toBe(
      1,
    );
  });
});

/**
 * 방 하나가 만드는 채널 수.
 *
 * 카테고리 1 + 대기실 1 + 스쿼드 채널. 디스코드는 카테고리당 50개,
 * 서버당 500개가 한도다. 100명 배틀로얄(25스쿼드)이 그 안에 들어가야
 * 대회 규모를 열 수 있다. 방이 끝나면 통째로 지워진다.
 */
describe("방당 채널 수", () => {
  /** 서비스와 같은 상한 */
  const MAX_TEAM_VOICE_CHANNELS = 30;
  const DISCORD_CHANNELS_PER_CATEGORY = 50;

  const channelCount = (room: {
    gameTitle: "PUBG";
    pubgGameMode: "KILL_MATCH" | "BATTLE_ROYALE";
    maxParticipants: number;
  }) => {
    const squads = teamCountForRoom(room) * squadCountForRoom(room);
    const teamChannels = squads <= MAX_TEAM_VOICE_CHANNELS ? squads : 0;
    return { squads, total: 2 + teamChannels };
  };

  it("100명 배틀로얄은 25스쿼드 · 27채널로 한도 안에 들어간다", () => {
    const room = {
      gameTitle: "PUBG" as const,
      pubgGameMode: "BATTLE_ROYALE" as const,
      maxParticipants: 100,
    };
    const { squads, total } = channelCount(room);
    expect(squads).toBe(25);
    expect(total).toBe(27);
    expect(total).toBeLessThan(DISCORD_CHANNELS_PER_CATEGORY);
  });

  it("모든 정원에서 스쿼드 채널이 생략되지 않는다", () => {
    // 상한에 걸려 대기실만 남으면 100명이 한 채널에 몰려 통화가 불가능해진다.
    const rooms = (["KILL_MATCH", "BATTLE_ROYALE"] as const).flatMap((mode) =>
      getPubgGameMode(mode).roomSizes.map((n) => ({
        gameTitle: "PUBG" as const,
        pubgGameMode: mode,
        maxParticipants: n,
      })),
    );
    for (const room of rooms) {
      const { squads, total } = channelCount(room);
      expect(squads).toBeLessThanOrEqual(MAX_TEAM_VOICE_CHANNELS);
      expect(total).toBe(2 + squads);
      expect(total).toBeLessThan(DISCORD_CHANNELS_PER_CATEGORY);
    }
  });

  it("16명 킬내기는 스쿼드 넷 · 채널 여섯", () => {
    const { squads, total } = channelCount({
      gameTitle: "PUBG",
      pubgGameMode: "KILL_MATCH",
      maxParticipants: 16,
    });
    expect(squads).toBe(4);
    expect(total).toBe(6);
  });
});
