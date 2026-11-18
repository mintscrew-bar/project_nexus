import { MatchStatus, MedalReason } from "@nexus/database";
import {
  CAPPED_REASONS,
  MEDAL_DAILY_CAP,
  checkEligibility,
  firstMatchKey,
  kstDayKey,
  planMatchGrants,
  type MedalMatch,
} from "./match-medal.service";
import { MedalService } from "./medal.service";
import { createFakePrisma } from "./medal.fake-prisma";

const START = new Date("2026-11-12T11:00:00Z"); // KST 20:00
const END = new Date("2026-11-12T11:30:00Z"); // 30분 경기

/** 5:5 내전 — A팀 a1~a5, B팀 b1~b5, A팀 승 */
function makeMatch(over: Partial<MedalMatch> = {}): MedalMatch {
  return {
    id: "m1",
    isInternal: true,
    status: MatchStatus.COMPLETED,
    startedAt: START,
    completedAt: END,
    gameDuration: null,
    riotMatchId: null,
    dataCollected: false,
    mvpUserId: null,
    aceUserId: null,
    roomHostId: "a1",
    teamAId: null,
    teamBId: null,
    teamAIdSnapshot: "tA",
    teamBIdSnapshot: "tB",
    winnerId: null,
    winnerIdSnapshot: "tA",
    rosterSnapshots: [
      ...["a1", "a2", "a3", "a4", "a5"].map((u) => ({
        userId: u,
        teamSlot: "A",
      })),
      ...["b1", "b2", "b3", "b4", "b5"].map((u) => ({
        userId: u,
        teamSlot: "B",
      })),
    ],
    commendations: [],
    commendationSessions: [],
    ...over,
  };
}

const sumFor = (grants: { userId: string; amount: number }[], userId: string) =>
  grants.filter((g) => g.userId === userId).reduce((s, g) => s + g.amount, 0);

describe("경기 메달 — 보상 대상 조건", () => {
  it("정상 경기는 사람 10명 모두 대상", () => {
    const res = checkEligibility(makeMatch(), new Set(), false);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.humans).toHaveLength(10);
  });

  it("봇이 셋이면(사람 70%) 대상이 아니다, 둘이면(80%) 대상", () => {
    expect(
      checkEligibility(makeMatch(), new Set(["b3", "b4", "b5"]), false),
    ).toEqual({
      ok: false,
      reason: "TOO_FEW_HUMANS",
    });
    const two = checkEligibility(makeMatch(), new Set(["b4", "b5"]), false);
    expect(two.ok).toBe(true);
    // 봇은 받는 사람에서 빠진다
    if (two.ok) expect(two.humans.map((h) => h.userId)).not.toContain("b5");
  });

  it("15분이 안 된 경기는 대상이 아니다 — Riot 기록 시간이 있으면 그걸 본다", () => {
    const short = makeMatch({
      completedAt: new Date(START.getTime() + 10 * 60e3),
    });
    expect(checkEligibility(short, new Set(), false)).toEqual({
      ok: false,
      reason: "TOO_SHORT",
    });
    // 보고는 10분 만에 했어도 실제 게임이 20분이면 대상
    expect(
      checkEligibility({ ...short, gameDuration: 1200 }, new Set(), false).ok,
    ).toBe(true);
    // 보고는 30분이어도 실제 게임이 12분이면 대상 아님
    expect(
      checkEligibility(makeMatch({ gameDuration: 720 }), new Set(), false).ok,
    ).toBe(false);
  });

  it("완료 전·외부 경기·무효 처리된 경기는 대상이 아니다", () => {
    expect(
      checkEligibility(
        makeMatch({ status: MatchStatus.IN_PROGRESS }),
        new Set(),
        false,
      ).ok,
    ).toBe(false);
    expect(
      checkEligibility(makeMatch({ isInternal: false }), new Set(), false).ok,
    ).toBe(false);
    expect(checkEligibility(makeMatch(), new Set(), true)).toEqual({
      ok: false,
      reason: "VOIDED",
    });
  });
});

describe("경기 메달 — 지급표", () => {
  const plan = (
    match: MedalMatch,
    opts = { isFinalMatch: false, hostIsBot: false },
  ) => {
    const res = checkEligibility(match, new Set(), false);
    if (!res.ok) throw new Error("not eligible");
    return planMatchGrants(match, res.humans, opts);
  };

  it("이긴 팀은 완주 10 + 승리 10, 진 팀은 완주 10 (첫 내전 50 별도)", () => {
    const grants = plan(makeMatch());
    const capped = grants.filter((g) => g.capped);
    expect(sumFor(capped, "a2")).toBe(20);
    expect(sumFor(capped, "b2")).toBe(10);
    expect(grants.find((g) => g.key === "first-match:b2")).toMatchObject({
      amount: 50,
      capped: false,
      reason: MedalReason.FIRST_MATCH,
    });
  });

  it("Riot 기록이 확인되면 전원 +5, MVP +5, ACE +3", () => {
    const grants = plan(
      makeMatch({
        riotMatchId: "KR_1",
        dataCollected: true,
        mvpUserId: "a3",
        aceUserId: "b1",
      }),
    ).filter((g) => g.capped);
    expect(sumFor(grants, "a3")).toBe(10 + 10 + 5 + 5);
    expect(sumFor(grants, "b1")).toBe(10 + 5 + 3);
    expect(sumFor(grants, "b2")).toBe(10 + 5);
  });

  it("Riot 기록이 아직 수집 전이면 MVP·ACE 도 주지 않는다", () => {
    const grants = plan(
      makeMatch({ mvpUserId: "a3", riotMatchId: "KR_1", dataCollected: false }),
    );
    expect(grants.some((g) => g.reason === MedalReason.MATCH_MVP)).toBe(false);
    expect(grants.some((g) => g.reason === MedalReason.RIOT_VERIFIED)).toBe(
      false,
    );
  });

  it("칭찬 창 완료 +1, 받은 칭찬 회당 +1", () => {
    const grants = plan(
      makeMatch({
        commendationSessions: [{ userId: "a2" }],
        commendations: [
          { id: "c1", targetUserId: "b1" },
          { id: "c2", targetUserId: "b1" },
        ],
      }),
    );
    expect(
      grants.filter((g) => g.reason === MedalReason.COMMEND_SESSION),
    ).toEqual([expect.objectContaining({ userId: "a2", amount: 1 })]);
    expect(
      grants
        .filter((g) => g.reason === MedalReason.COMMEND_RECEIVED)
        .map((g) => g.key),
    ).toEqual(["commend:c1", "commend:c2"]);
  });

  it("방의 마지막 경기면 방장에게 +10, 방장이 봇이면 없다", () => {
    expect(
      plan(makeMatch(), { isFinalMatch: true, hostIsBot: false }).find(
        (g) => g.reason === MedalReason.HOST_COMPLETE,
      ),
    ).toMatchObject({
      userId: "a1",
      amount: 10,
    });
    expect(
      plan(makeMatch(), { isFinalMatch: true, hostIsBot: true }).some(
        (g) => g.reason === MedalReason.HOST_COMPLETE,
      ),
    ).toBe(false);
    expect(
      plan(makeMatch()).some((g) => g.reason === MedalReason.HOST_COMPLETE),
    ).toBe(false);
  });

  it("같은 경기는 늘 같은 키 — 몇 번 정산해도 두 번 주지 않는다", () => {
    const keys1 = plan(makeMatch()).map((g) => g.key);
    const keys2 = plan(makeMatch()).map((g) => g.key);
    expect(keys1).toEqual(keys2);
    expect(new Set(keys1).size).toBe(keys1.length);
  });
});

describe("경기 메달 — 하루 상한", () => {
  it("KST 날짜로 센다", () => {
    expect(kstDayKey(new Date("2026-11-12T14:59:00Z"))).toBe("2026-11-12");
    expect(kstDayKey(new Date("2026-11-12T15:00:00Z"))).toBe("2026-11-13");
  });

  it("하루 180을 넘는 만큼은 0 메달 줄로 남는다", async () => {
    const db = createFakePrisma();
    const medal = new MedalService(db.api);
    const opts = { dailyCap: MEDAL_DAILY_CAP, cappedReasons: CAPPED_REASONS };
    const grant = (key: string, amount: number) =>
      medal.recordCapped(
        {
          userId: "u1",
          amount,
          reason: MedalReason.MATCH_COMPLETE,
          idempotencyKey: key,
          dayKey: "2026-11-12",
        },
        opts,
      );
    for (let i = 0; i < 8; i++) await grant(`k${i}`, 20); // 160
    const partial = await grant("k8", 30); // 20 만 들어간다
    const zero = await grant("k9", 10);
    expect(partial.entry.amount).toBe(20);
    expect(zero.entry.amount).toBe(0);
    expect(db.balance("u1")).toBe(180);
    expect(db.ledger()[9].metadata).toMatchObject({
      capped: true,
      requested: 10,
    });
  });

  it("상한은 날마다 따로, 첫 내전 보너스는 상한 밖", async () => {
    const db = createFakePrisma();
    const medal = new MedalService(db.api);
    const opts = { dailyCap: MEDAL_DAILY_CAP, cappedReasons: CAPPED_REASONS };
    await medal.recordCapped(
      {
        userId: "u1",
        amount: 180,
        reason: MedalReason.MATCH_COMPLETE,
        idempotencyKey: "a",
        dayKey: "2026-11-12",
      },
      opts,
    );
    // 첫 내전 50 은 상한과 무관하다
    await medal.record({
      userId: "u1",
      amount: 50,
      reason: MedalReason.FIRST_MATCH,
      idempotencyKey: "first-match:u1",
    });
    const nextDay = await medal.recordCapped(
      {
        userId: "u1",
        amount: 10,
        reason: MedalReason.MATCH_COMPLETE,
        idempotencyKey: "b",
        dayKey: "2026-11-13",
      },
      opts,
    );
    expect(nextDay.entry.amount).toBe(10);
    expect(db.balance("u1")).toBe(240);
  });
});

describe("경기 메달 — 첫 내전 보너스와 무효 처리", () => {
  it("받은 적 없으면 기본 키", () => {
    expect(firstMatchKey("u1", [], new Set())).toBe("first-match:u1");
  });

  it("정상 경기에서 이미 받았으면 주지 않는다", () => {
    expect(firstMatchKey("u1", ["m1"], new Set())).toBeNull();
    // 무효 회차 뒤 다시 받았어도 그 경기가 정상이면 끝
    expect(firstMatchKey("u1", ["m1", "m2"], new Set(["m1"]))).toBeNull();
  });

  it("받았던 경기가 무효 처리되면 다음 경기에서 회차 키로 다시 준다", () => {
    expect(firstMatchKey("u1", ["m1"], new Set(["m1"]))).toBe(
      "first-match:u1:1",
    );
    expect(firstMatchKey("u1", ["m1", "m2"], new Set(["m1", "m2"]))).toBe(
      "first-match:u1:2",
    );
  });
});
