import {
  identifyRoundMatch,
  rosterOverlap,
  type MatchCandidate,
} from "@nexus/types";

/**
 * 라운드에 해당하는 커스텀 매치를 고르는 규칙.
 *
 * 이 판단은 아직 실측 전이다(Phase 0 Task 3) — 커스텀 매치를 한 판 치르고 나면
 * 임계값을 손볼 수 있게 순수 함수로 떼어 두었다. 여기 테스트는 "잘못 주워 오지
 * 않는가"에 초점을 둔다. 틀린 결과가 리더보드에 올라가면 되돌리기가 더 비싸다.
 */
const ROUND_START = new Date("2026-09-04T12:00:00Z");

const candidate = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  matchId: "m1",
  createdAt: "2026-09-04T12:05:00Z",
  isCustomMatch: true,
  playerNames: ["철수", "영희", "민수", "지훈"],
  ...over,
});

const roster = ["철수", "영희", "민수", "지훈"];

describe("명단 일치율", () => {
  it("방 명단 중 몇 명이 그 경기에 있었는지를 센다", () => {
    expect(rosterOverlap(roster, ["철수", "영희"])).toBe(0.5);
    expect(rosterOverlap(roster, roster)).toBe(1);
    expect(rosterOverlap(roster, ["모르는사람"])).toBe(0);
  });

  it("대소문자·공백은 무시한다", () => {
    expect(rosterOverlap(["PlayerOne"], [" playerone "])).toBe(1);
  });

  it("방 명단이 비면 0 — 0으로 나누지 않는다", () => {
    expect(rosterOverlap([], ["철수"])).toBe(0);
  });
});

describe("라운드 매치 식별", () => {
  it("커스텀·시간대·명단이 모두 맞으면 고른다", () => {
    const result = identifyRoundMatch([candidate()], {
      roundStartedAt: ROUND_START,
      rosterNames: roster,
    });
    expect(result.reason).toBe("MATCHED");
    expect(result.match?.matchId).toBe("m1");
  });

  it("커스텀이 아니면 고르지 않는다", () => {
    const result = identifyRoundMatch([candidate({ isCustomMatch: false })], {
      roundStartedAt: ROUND_START,
      rosterNames: roster,
    });
    expect(result.match).toBeNull();
    expect(result.reason).toBe("NO_CUSTOM_MATCH");
  });

  it("라운드 시작 한참 뒤의 경기는 다음 라운드로 본다", () => {
    const result = identifyRoundMatch(
      [candidate({ createdAt: "2026-09-04T15:00:00Z" })],
      { roundStartedAt: ROUND_START, rosterNames: roster },
    );
    expect(result.reason).toBe("OUT_OF_TIME_WINDOW");
  });

  it("시작 버튼을 누르기 전에 열어둔 로비도 받아준다", () => {
    // 호스트가 인게임 로비를 먼저 열어두는 일이 흔하다.
    const result = identifyRoundMatch(
      [candidate({ createdAt: "2026-09-04T11:50:00Z" })],
      { roundStartedAt: ROUND_START, rosterNames: roster },
    );
    expect(result.reason).toBe("MATCHED");
  });

  it("명단이 절반도 안 겹치면 남의 판으로 본다", () => {
    const result = identifyRoundMatch(
      [candidate({ playerNames: ["철수", "낯선사람1", "낯선사람2"] })],
      { roundStartedAt: ROUND_START, rosterNames: roster },
    );
    expect(result.match).toBeNull();
    expect(result.reason).toBe("ROSTER_MISMATCH");
    expect(result.bestOverlap).toBeCloseTo(0.25);
  });

  it("명단이 겹치는 후보 중 가장 이른 판을 고른다", () => {
    // 명단은 "우리 판인가"만 판단한다. 어느 라운드인지는 시간이 답한다.
    const result = identifyRoundMatch(
      [
        candidate({ matchId: "나중", createdAt: "2026-09-04T12:40:00Z" }),
        candidate({ matchId: "먼저", createdAt: "2026-09-04T12:05:00Z" }),
      ],
      { roundStartedAt: ROUND_START, rosterNames: roster },
    );
    expect(result.match?.matchId).toBe("먼저");
  });

  it("명단이 안 겹치는 판은 더 일러도 안 고른다", () => {
    const result = identifyRoundMatch(
      [
        candidate({
          matchId: "남의판",
          createdAt: "2026-09-04T12:01:00Z",
          playerNames: ["낯선1", "낯선2", "낯선3", "낯선4"],
        }),
        candidate({ matchId: "우리판", createdAt: "2026-09-04T12:30:00Z" }),
      ],
      { roundStartedAt: ROUND_START, rosterNames: roster },
    );
    expect(result.match?.matchId).toBe("우리판");
  });

  it("후보가 없으면 이유를 밝힌다", () => {
    const result = identifyRoundMatch([], {
      roundStartedAt: ROUND_START,
      rosterNames: roster,
    });
    expect(result.reason).toBe("NO_CANDIDATES");
  });

  it("시각이 깨진 매치는 후보에서 뺀다", () => {
    const result = identifyRoundMatch(
      [candidate({ createdAt: "not-a-date" })],
      { roundStartedAt: ROUND_START, rosterNames: roster },
    );
    expect(result.reason).toBe("OUT_OF_TIME_WINDOW");
  });

  it("이미 다른 라운드가 가져간 판은 후보에서 뺀다", () => {
    const result = identifyRoundMatch(
      [
        candidate({ matchId: "이미쓴판", createdAt: "2026-09-04T12:02:00Z" }),
        candidate({ matchId: "새판", createdAt: "2026-09-04T12:20:00Z" }),
      ],
      {
        roundStartedAt: ROUND_START,
        rosterNames: roster,
        excludeMatchIds: ["이미쓴판"],
      },
    );
    expect(result.match?.matchId).toBe("새판");
  });

  it("직전 라운드 시작 전의 판은 이 라운드 것이 아니다", () => {
    // 호스트가 앞 라운드를 건너뛰고 뒤 라운드부터 수집하면
    // 시간 창만으로는 앞 라운드의 판을 주워 온다.
    const result = identifyRoundMatch(
      [candidate({ createdAt: "2026-09-04T11:52:00Z" })],
      {
        roundStartedAt: ROUND_START,
        rosterNames: roster,
        notBefore: new Date("2026-09-04T11:55:00Z"),
      },
    );
    expect(result.reason).toBe("OUT_OF_TIME_WINDOW");
  });

  it("임계값을 낮추면 겹침이 적어도 받아들인다 — 실측 뒤 조정 지점", () => {
    const result = identifyRoundMatch(
      [candidate({ playerNames: ["철수", "낯선사람"] })],
      {
        roundStartedAt: ROUND_START,
        rosterNames: roster,
        minRosterOverlap: 0.2,
      },
    );
    expect(result.reason).toBe("MATCHED");
  });
});

/**
 * 2026-09-05 실측 재현.
 *
 * 한 계정의 최근 커스텀 매치가 22:25 → 23:42 사이에 15~20분 간격으로 5건 있었다.
 * 스크림 라운드 간격과 똑같아서, 라운드를 순서대로 수집했을 때 각 라운드가
 * 서로 다른 판을 가져가는지가 이 로직의 핵심이다.
 */
describe("연속 라운드 — 실측 간격 재현", () => {
  const played = [
    { matchId: "m1", createdAt: "2026-09-04T22:25:33Z" },
    { matchId: "m2", createdAt: "2026-09-04T22:41:25Z" },
    { matchId: "m3", createdAt: "2026-09-04T23:23:37Z" },
    { matchId: "m4", createdAt: "2026-09-04T23:39:09Z" },
    { matchId: "m5", createdAt: "2026-09-04T23:42:04Z" },
  ].map((m) => candidate({ ...m, playerNames: ["Nibaba_0507", "1Fann-_-"] }));
  const scrimRoster = ["Nibaba_0507", "1Fann-_-"];

  // 호스트가 각 판 직전에 "라운드 시작"을 눌렀다고 본다.
  const roundStarts = [
    new Date("2026-09-04T22:20:00Z"),
    new Date("2026-09-04T22:38:00Z"),
    new Date("2026-09-04T23:20:00Z"),
  ];

  it("라운드를 순서대로 수집하면 서로 다른 판을 가져간다", () => {
    const claimed: string[] = [];
    const picked: string[] = [];

    roundStarts.forEach((startedAt, index) => {
      const result = identifyRoundMatch(played, {
        roundStartedAt: startedAt,
        rosterNames: scrimRoster,
        excludeMatchIds: claimed,
        notBefore: index > 0 ? roundStarts[index - 1] : undefined,
      });
      expect(result.reason).toBe("MATCHED");
      claimed.push(result.match!.matchId);
      picked.push(result.match!.matchId);
    });

    // 같은 판을 두 번 가져가면 리더보드가 통째로 틀어진다.
    expect(new Set(picked).size).toBe(3);
    expect(picked).toEqual(["m1", "m2", "m3"]);
  });

  it("이미 쓴 판을 안 빼면 같은 판이 겹쳐 잡힌다 — 회귀 방지", () => {
    // 명단이 라운드마다 똑같아서 명단 일치율로는 라운드를 못 가른다.
    const withoutExclusion = roundStarts.map(
      (startedAt) =>
        identifyRoundMatch(played, {
          roundStartedAt: startedAt,
          rosterNames: scrimRoster,
        }).match?.matchId,
    );
    // 2·3라운드가 앞 라운드 판을 다시 집는지 확인한다(하한이 없으면 겹친다).
    expect(new Set(withoutExclusion).size).toBeLessThan(3);
  });
});
