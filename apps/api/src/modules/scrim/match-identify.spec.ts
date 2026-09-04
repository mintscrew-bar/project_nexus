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

  it("후보가 여럿이면 명단이 가장 많이 겹치는 쪽을 고른다", () => {
    const result = identifyRoundMatch(
      [
        candidate({ matchId: "절반", playerNames: ["철수", "영희"] }),
        candidate({ matchId: "전원", playerNames: roster }),
      ],
      { roundStartedAt: ROUND_START, rosterNames: roster },
    );
    expect(result.match?.matchId).toBe("전원");
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
