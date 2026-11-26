import {
  buildCommendationTags,
  buildSessions,
  buildSummary,
  buildViewerLeague,
  isScheduleTime,
  sessionDateKey,
  type HostedMatchRow,
} from "./streamer-page.util";

const ST = "streamer";
let seq = 0;

/** 5대5 방송 내전 한 판. a 팀에 스트리머가 들어갈 수 있다 */
function row(
  at: string,
  a: string[],
  b: string[],
  winner: "A" | "B",
  over: Partial<HostedMatchRow> = {},
): HostedMatchRow {
  seq += 1;
  return {
    id: `m${seq}`,
    completedAt: new Date(at),
    roomName: "알트탭 내전방",
    roomTeamMode: "AUCTION",
    gameDuration: 1700,
    winnerSlot: winner,
    teamAName: "팀 판다",
    teamBName: "팀 너구리",
    roster: [
      ...a.map((userId) => ({
        userId,
        username: userId,
        teamSlot: "A" as const,
        assignedRole: null,
      })),
      ...b.map((userId) => ({
        userId,
        username: userId,
        teamSlot: "B" as const,
        assignedRole: null,
      })),
    ],
    participants: [],
    mvpUserId: null,
    aceUserId: null,
    commendations: [],
    ...over,
  };
}

const A = [ST, "a2", "a3", "a4", "a5"];
const B = ["b1", "b2", "b3", "b4", "b5"];

describe("streamer-page.util", () => {
  it("방송 회차는 KST 새벽 6시 기준 — 자정 넘긴 판은 전날 방송", () => {
    // 2026-11-25 23:30 KST = 14:30Z, 11-26 01:30 KST = 11-25 16:30Z
    expect(sessionDateKey(new Date("2026-11-25T14:30:00Z"))).toBe("2026-11-25");
    expect(sessionDateKey(new Date("2026-11-25T16:30:00Z"))).toBe("2026-11-25");
    // 11-26 07:00 KST = 11-25 22:00Z → 새 날
    expect(sessionDateKey(new Date("2026-11-25T22:00:00Z"))).toBe("2026-11-26");
  });

  it("회차별로 묶고 최신이 위, 시청자 수는 스트리머 빼고", () => {
    const sessions = buildSessions(
      [
        row("2026-11-18T12:00:00Z", A, B, "A"),
        row("2026-11-25T12:00:00Z", A, B, "B"),
        row("2026-11-25T13:00:00Z", A, ["b1", "b2", "b3", "b4", "c9"], "A"),
      ],
      ST,
    );
    expect(sessions.map((s) => [s.date, s.matchCount])).toEqual([
      ["2026-11-25", 2],
      ["2026-11-18", 1],
    ]);
    expect(sessions[0].viewerCount).toBe(10); // a2~a5, b1~b5, c9
    expect(sessions[0].matches[0].completedAt).toBe("2026-11-25T13:00:00.000Z");
  });

  it("판마다 스트리머 팀·KDA·MVP·펜타킬", () => {
    const [s] = buildSessions(
      [
        row("2026-11-25T12:00:00Z", A, B, "A", {
          mvpUserId: "a2",
          participants: [
            {
              userId: ST,
              championName: "Ahri",
              riotTeamId: 100,
              kills: 8,
              deaths: 2,
              assists: 11,
              pentaKills: 0,
            },
            {
              userId: "b1",
              championName: "Yone",
              riotTeamId: 200,
              kills: 3,
              deaths: 5,
              assists: 1,
              pentaKills: 1,
            },
          ],
        }),
      ],
      ST,
    );
    const m = s.matches[0];
    expect(m.streamerSlot).toBe("A");
    expect(m.teamA).toEqual({
      name: "팀 판다",
      champions: ["Ahri"],
      won: true,
    });
    expect(m.teamB.champions).toEqual(["Yone"]);
    expect(m.streamerLine).toEqual({
      championName: "Ahri",
      kills: 8,
      deaths: 2,
      assists: 11,
    });
    expect(m.mvp).toEqual({ userId: "a2", username: "a2" });
    expect(m.highlight).toBe("펜타킬 b1");
  });

  it("관전만 한 판은 스트리머 팀이 없다", () => {
    const [s] = buildSessions(
      [row("2026-11-25T12:00:00Z", ["a1", "a2", "a3", "a4", "a5"], B, "A")],
      ST,
    );
    expect(s.matches[0].streamerSlot).toBeNull();
    expect(s.matches[0].streamerLine).toBeNull();
  });

  it("요약 — 스트리머 팀 승패는 뛴 판만", () => {
    const summary = buildSummary(
      [
        row("2026-11-25T12:00:00Z", A, B, "A"),
        row("2026-11-25T13:00:00Z", A, B, "B"),
        row("2026-11-18T12:00:00Z", ["x1", "x2", "x3", "x4", "x5"], B, "A", {
          commendations: [{ giverId: "b1", targetUserId: "x1", tags: [] }],
        }),
      ],
      ST,
    );
    expect(summary).toEqual({
      hostedMatches: 3,
      sessions: 2,
      viewers: 14,
      streamerWins: 1,
      streamerLosses: 1,
      avgPlayers: 10,
      commendations: 1,
    });
  });

  it("칭찬 태그는 많은 순", () => {
    expect(
      buildCommendationTags([
        row("2026-11-25T12:00:00Z", A, B, "A", {
          commendations: [
            { giverId: "b1", targetUserId: "a2", tags: ["MANNER", "CARRY"] },
            { giverId: "b2", targetUserId: "a2", tags: ["MANNER"] },
          ],
        }),
      ]),
    ).toEqual([
      { tag: "MANNER", count: 2 },
      { tag: "CARRY", count: 1 },
    ]);
  });

  it("시청자 리그 — 스트리머는 빼고, 많이 이긴 사람이 위", () => {
    const league = buildViewerLeague(
      [
        row("2026-11-25T12:00:00Z", A, B, "A"),
        row("2026-11-25T13:00:00Z", A, B, "A", { mvpUserId: "a2" }),
        row("2026-11-25T14:00:00Z", A, B, "A"),
      ],
      ST,
    );
    expect(league).toHaveLength(5);
    expect(league.some((e) => e.userId === ST)).toBe(false);
    expect(league[0].wins).toBe(3);
    expect(league[0].score).toBeGreaterThan(50);
    expect(league.find((e) => e.userId === "a2")?.mvp).toBe(1);
  });

  it("방송 시각은 HH:mm", () => {
    expect(isScheduleTime("21:00")).toBe(true);
    expect(isScheduleTime("9:00")).toBe(false);
    expect(isScheduleTime("24:00")).toBe(false);
  });
});
