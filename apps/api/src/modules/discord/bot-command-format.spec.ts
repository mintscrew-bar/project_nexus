import {
  formatAttendanceHeadline,
  formatCommendations,
  formatLolLeaderboardLine,
  formatNextBonus,
  formatPubgLeaderboardLine,
  formatWinRate,
  joinButtonLabel,
  rankMark,
  type AttendanceResult,
} from "./bot-command-format";

/** 출석 결과 기본값 — 7일마다 50 보너스 */
function attendance(over: Partial<AttendanceResult>): AttendanceResult {
  return {
    granted: 0,
    bonus: 0,
    checkedToday: false,
    streak: 0,
    monthDays: [],
    streakEvery: 7,
    streakBonus: 50,
    daysToBonus: 6,
    ...over,
  };
}

describe("bot-command-format", () => {
  it("1~3위는 메달, 그 뒤는 숫자", () => {
    expect([1, 2, 3, 4].map(rankMark)).toEqual(["🥇", "🥈", "🥉", "4."]);
  });

  it("승률은 반올림, 판이 없으면 -", () => {
    expect(formatWinRate(7, 12)).toBe("58%");
    expect(formatWinRate(0, 0)).toBe("-");
  });

  it("롤 랭킹 한 줄 — 점수는 소수 첫째 자리", () => {
    expect(
      formatLolLeaderboardLine({
        globalRank: 1,
        score: 62.25,
        totalGames: 12,
        wins: 7,
        losses: 5,
        username: "하루",
      }),
    ).toBe("🥇 **하루** — 62.3점 · 12판 7승 5패 (58%)");
  });

  it("배그 랭킹 한 줄", () => {
    expect(
      formatPubgLeaderboardLine({
        rank: 4,
        username: "치킨",
        scrims: 5,
        averagePlacement: 2.33,
        wins: 2,
        averageKills: 3.14,
      }),
    ).toBe("4. **치킨** — 평균 2.3위 · 1위 2회 · 판당 3.1킬 · 5판");
  });

  it("칭찬 — 태그는 한글 문구로, 없으면 아직 없음", () => {
    expect(
      formatCommendations({
        total: 12,
        topTags: [
          { tag: "MANNER", count: 5 },
          { tag: "CARRY", count: 4 },
        ],
      }),
    ).toBe("12개 · 매너 좋음 5 · 캐리 4");
    expect(formatCommendations({ total: 0, topTags: [] })).toBe("아직 없음");
  });

  describe("출석", () => {
    it("받았으면 받은 양, 보너스 날엔 보너스까지", () => {
      expect(
        formatAttendanceHeadline(attendance({ granted: 10, streak: 3 })),
      ).toBe("출석 완료! 10메달을 받았어요.");
      expect(
        formatAttendanceHeadline(
          attendance({ granted: 10, bonus: 50, streak: 7 }),
        ),
      ).toBe("출석 완료! 10메달 + 연속 7일 보너스 50메달을 받았어요.");
      expect(formatAttendanceHeadline(attendance({ granted: 0 }))).toBe(
        "오늘은 이미 출석했어요.",
      );
    });

    // daysToBonus 는 attendance.service getStatus 와 같은 식으로 만든다
    const statusOf = (streak: number, checkedToday: boolean) => {
      const next = checkedToday ? streak : streak + 1;
      return attendance({
        streak,
        checkedToday,
        daysToBonus: (7 - (next % 7)) % 7,
      });
    };

    it("오늘 출석했으면: 3일째 → 4번 더, 7일째(보너스 받음) → 7번 더", () => {
      expect(formatNextBonus(statusOf(3, true))).toBe(
        "4번 더 출석하면 연속 보너스 50메달이에요.",
      );
      expect(formatNextBonus(statusOf(7, true))).toBe(
        "7번 더 출석하면 연속 보너스 50메달이에요.",
      );
    });

    it("아직 안 했으면: 어제까지 3일 → 오늘 포함 4번, 6일 → 오늘이 보너스", () => {
      expect(formatNextBonus(statusOf(3, false))).toBe(
        "4번 더 출석하면 연속 보너스 50메달이에요.",
      );
      expect(formatNextBonus(statusOf(6, false))).toBe(
        "오늘 출석하면 연속 보너스 50메달!",
      );
    });
  });

  it("참가 버튼 글자 — 긴 방 이름은 줄인다", () => {
    expect(joinButtonLabel("금요 내전")).toBe("참가 · 금요 내전");
    const long = joinButtonLabel("가".repeat(50));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("…")).toBe(true);
  });
});
