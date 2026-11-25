import {
  computeRatings,
  displayRating,
  matchPerformance,
  percentileRanks,
  RATING_DISPLAY_START,
  type RatingMatch,
  type TeamSlot,
} from "./ranking-rating";

let seq = 0;

/** 5대5 내전 한 판. a·b 는 팀원 userId 목록 */
function match(
  a: string[],
  b: string[],
  winner: TeamSlot,
  over: Partial<RatingMatch> = {},
): RatingMatch {
  seq += 1;
  return {
    id: `m${String(seq).padStart(4, "0")}`,
    completedAt: new Date(Date.UTC(2026, 10, 1, 0, seq)),
    winnerSlot: winner,
    members: [
      ...a.map((userId) => ({ userId, slot: "A" as const, role: null })),
      ...b.map((userId) => ({ userId, slot: "B" as const, role: null })),
    ],
    stats: [],
    mvpUserId: null,
    aceUserId: null,
    commendations: [],
    ...over,
  };
}

const TEAM_A = ["a1", "a2", "a3", "a4", "a5"];
const TEAM_B = ["b1", "b2", "b3", "b4", "b5"];

describe("percentileRanks", () => {
  it("작은 값 0, 큰 값 1, 같은 값은 평균 순위", () => {
    expect(percentileRanks([10, 20, 30])).toEqual([0, 0.5, 1]);
    expect(percentileRanks([5, 5, 9])).toEqual([0.25, 0.25, 1]);
    expect(percentileRanks([7])).toEqual([0.5]);
  });
});

describe("computeRatings", () => {
  it("경기가 없으면 시작 점수 50", () => {
    expect(displayRating(undefined)).toBe(RATING_DISPLAY_START);
  });

  it("이긴 팀은 오르고 진 팀은 내려간다", () => {
    const { overall } = computeRatings([match(TEAM_A, TEAM_B, "A")]);
    expect(displayRating(overall.get("a1"))).toBeGreaterThan(50);
    expect(displayRating(overall.get("b1"))).toBeLessThan(50);
  });

  it("같은 입력이면 순서를 섞어도 같은 결과다 (끝난 시각 순으로 돈다)", () => {
    const games = [
      match(TEAM_A, TEAM_B, "A"),
      match(TEAM_A, TEAM_B, "B"),
      match(TEAM_A, TEAM_B, "A"),
    ];
    const x = computeRatings(games).overall.get("a1")!;
    const y = computeRatings([...games].reverse()).overall.get("a1")!;
    expect(y.mu).toBeCloseTo(x.mu, 10);
    expect(y.sigma2).toBeCloseTo(x.sigma2, 10);
  });

  it("판이 쌓일수록 불확실성이 줄어든다", () => {
    const { overall } = computeRatings([
      match(TEAM_A, TEAM_B, "A"),
      match(TEAM_A, TEAM_B, "B"),
    ]);
    expect(overall.get("a1")!.sigma2).toBeLessThan((25 / 3) ** 2);
    expect(overall.get("a1")!.games).toBe(2);
  });

  it("강한 팀을 이기면 약한 팀을 이긴 것보다 많이 오른다", () => {
    // 강팀(s*)은 미리 여러 번 이겨 둔다
    const strong = ["s1", "s2", "s3", "s4", "s5"];
    const weak = ["w1", "w2", "w3", "w4", "w5"];
    const warmup = [
      match(strong, weak, "A"),
      match(strong, weak, "A"),
      match(strong, weak, "A"),
    ];
    const beatStrong = computeRatings([
      ...warmup,
      match(TEAM_A, strong, "A"),
    ]).overall.get("a1")!;
    const beatWeak = computeRatings([
      ...warmup,
      match(TEAM_A, weak, "A"),
    ]).overall.get("a1")!;
    expect(beatStrong.mu).toBeGreaterThan(beatWeak.mu);
  });

  it("판수 중립: 반반 이기는 사람은 많이 뛰어도 처음 기대값에서 크게 벗어나지 않는다", () => {
    const games: RatingMatch[] = [];
    for (let i = 0; i < 20; i++) {
      games.push(match(TEAM_A, TEAM_B, i % 2 === 0 ? "A" : "B"));
    }
    const a = computeRatings(games).overall.get("a1")!;
    expect(Math.abs(a.mu - 25)).toBeLessThan(1);
  });

  it("3승 0패보다 5승 1패가 위다 (예전 보정 승률은 거꾸로였다)", () => {
    const p = ["p1", "p2", "p3", "p4", "p5"];
    const q = ["q1", "q2", "q3", "q4", "q5"];
    const games = [
      match(TEAM_A, TEAM_B, "A"),
      match(TEAM_A, TEAM_B, "A"),
      match(TEAM_A, TEAM_B, "A"),
      match(p, q, "A"),
      match(p, q, "A"),
      match(p, q, "B"),
      match(p, q, "A"),
      match(p, q, "A"),
      match(p, q, "A"),
    ];
    const { overall } = computeRatings(games);
    expect(displayRating(overall.get("p1"))).toBeGreaterThan(
      displayRating(overall.get("a1")),
    );
  });

  it("계정 없는 참가자는 점수를 갖지 않지만 팀 전력에는 들어간다", () => {
    const { overall } = computeRatings([
      match(["a1", "a2", "a3", "a4"], TEAM_B, "A", {
        members: [
          ...["a1", "a2", "a3", "a4"].map((userId) => ({
            userId,
            slot: "A" as const,
            role: null,
          })),
          { userId: null, slot: "A" as const, role: null },
          ...TEAM_B.map((userId) => ({
            userId,
            slot: "B" as const,
            role: null,
          })),
        ],
      }),
    ]);
    expect(overall.size).toBe(9);
  });

  it("라인 점수는 배정 라인으로 뛴 판만 센다", () => {
    const m = match(TEAM_A, TEAM_B, "A");
    m.members[0].role = "MID";
    const { byRole } = computeRatings([m]);
    expect(byRole.get("a1:MID")!.games).toBe(1);
    expect(byRole.has("a2:MID")).toBe(false);
  });
});

describe("개인 기여", () => {
  function statMatch(): RatingMatch {
    // a1 은 잘했고(10/1/5), b1 은 못했다(0/8/1). 나머지는 고만고만
    const line = (
      userId: string,
      team: number,
      k: number,
      d: number,
      a: number,
    ) => ({
      userId,
      riotTeamId: team,
      kills: k,
      deaths: d,
      assists: a,
    });
    return match(TEAM_A, TEAM_B, "B", {
      stats: [
        line("a1", 100, 10, 1, 5),
        ...["a2", "a3", "a4", "a5"].map((u) => line(u, 100, 2, 4, 3)),
        line("b1", 200, 0, 8, 1),
        ...["b2", "b3", "b4", "b5"].map((u) => line(u, 200, 4, 3, 6)),
      ],
    });
  }

  it("같은 판 안에서 KDA·킬관여가 높으면 개인 기여가 높다", () => {
    const perf = matchPerformance(statMatch(), new Map());
    expect(perf.get("a1")!).toBeGreaterThan(0.8);
    expect(perf.get("b1")!).toBeLessThan(0.2);
  });

  it("졌어도 캐리한 사람은 덜 내려가고, 이겨도 묻어간 사람은 덜 오른다", () => {
    const { overall } = computeRatings([statMatch()]);
    // a1(진 팀·캐리) 은 a2(진 팀·평범) 보다 높다
    expect(overall.get("a1")!.mu).toBeGreaterThan(overall.get("a2")!.mu);
    // b1(이긴 팀·부진) 은 b2(이긴 팀·평범) 보다 낮다
    expect(overall.get("b1")!.mu).toBeLessThan(overall.get("b2")!.mu);
  });

  it("MVP·ACE 는 개인 기여에 가산된다", () => {
    const plain = matchPerformance(statMatch(), new Map());
    const withAce = matchPerformance(
      { ...statMatch(), aceUserId: "a2" },
      new Map(),
    );
    expect(withAce.get("a2")!).toBeGreaterThan(plain.get("a2")!);
  });

  it("라이엇 기록이 없는 판은 모두 중립(0.5)", () => {
    const perf = matchPerformance(match(TEAM_A, TEAM_B, "A"), new Map());
    expect([...perf.values()].every((v) => v === 0.5)).toBe(true);
  });

  it("상대 팀이 준 칭찬이 같은 팀 칭찬보다 무겁다", () => {
    const fromOpponent = matchPerformance(
      match(TEAM_A, TEAM_B, "A", {
        commendations: [{ giverId: "b1", targetUserId: "a1" }],
      }),
      new Map(),
    );
    const fromTeammate = matchPerformance(
      match(TEAM_A, TEAM_B, "A", {
        commendations: [{ giverId: "a2", targetUserId: "a1" }],
      }),
      new Map(),
    );
    expect(fromOpponent.get("a1")!).toBeGreaterThan(fromTeammate.get("a1")!);
    expect(fromTeammate.get("a1")!).toBeGreaterThan(0.5);
  });

  it("칭찬은 판 평균과의 차이만 더한다 — 판 전체 합은 그대로", () => {
    const perf = matchPerformance(
      match(TEAM_A, TEAM_B, "A", {
        commendations: [
          { giverId: "b1", targetUserId: "a1" },
          { giverId: "b2", targetUserId: "a1" },
        ],
      }),
      new Map(),
    );
    const total = [...perf.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(5, 10);
  });

  it("같은 사람에게 반복해서 받은 칭찬은 갈수록 덜 센다", () => {
    const pairs = new Map<string, number>();
    const give = () =>
      matchPerformance(
        match(TEAM_A, TEAM_B, "A", {
          commendations: [{ giverId: "b1", targetUserId: "a1" }],
        }),
        pairs,
      ).get("a1")!;
    const first = give();
    const second = give();
    expect(second).toBeLessThan(first);
  });

  it("그 판에 없던 사람의 칭찬과 자기 칭찬은 세지 않는다", () => {
    const perf = matchPerformance(
      match(TEAM_A, TEAM_B, "A", {
        commendations: [
          { giverId: "outsider", targetUserId: "a1" },
          { giverId: "a1", targetUserId: "a1" },
        ],
      }),
      new Map(),
    );
    expect(perf.get("a1")).toBe(0.5);
  });
});
