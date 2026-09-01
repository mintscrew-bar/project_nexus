import { formatKst, parseKstSchedule, toKstParts } from "./discord-schedule-time";

/** 테스트 기준 시각: 2026-09-01(화) 15:00 KST */
const NOW = new Date("2026-09-01T06:00:00.000Z");

/** 결과를 KST 벽시계로 확인한다 — 실행 환경 TZ에 흔들리면 안 된다. */
function kst(date: Date | null): string | null {
  if (!date) return null;
  const { year, month, day, hour, minute } = toKstParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(
    hour,
  ).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

describe("parseKstSchedule", () => {
  it("HH:MM 은 오늘 그 시각으로 읽는다", () => {
    expect(kst(parseKstSchedule("21:00", NOW))).toBe("2026-09-01 21:00");
  });

  it("이미 지난 시각은 다음 날로 넘긴다", () => {
    expect(kst(parseKstSchedule("10:00", NOW))).toBe("2026-09-02 10:00");
  });

  it("오전/오후 없는 한 자리 시각은 지금 이후로 가장 가까운 해석을 고른다", () => {
    // 15시에 "9시" → 오늘 21시 (내일 9시보다 가깝다)
    expect(kst(parseKstSchedule("9시", NOW))).toBe("2026-09-01 21:00");
  });

  it("오후를 명시하면 그대로 읽는다", () => {
    expect(kst(parseKstSchedule("오후 9시", NOW))).toBe("2026-09-01 21:00");
    expect(kst(parseKstSchedule("저녁 8시 30분", NOW))).toBe("2026-09-01 20:30");
  });

  it("오늘/내일/모레를 앞에 붙일 수 있다", () => {
    expect(kst(parseKstSchedule("내일 20:30", NOW))).toBe("2026-09-02 20:30");
    expect(kst(parseKstSchedule("모레 21시", NOW))).toBe("2026-09-03 21:00");
  });

  it("날짜를 명시하면 추측 없이 적힌 그대로 읽는다", () => {
    // 날짜가 있으면 "9시"를 21시로 밀지 않는다.
    expect(kst(parseKstSchedule("내일 9시", NOW))).toBe("2026-09-02 09:00");
    expect(kst(parseKstSchedule("9/3 21:00", NOW))).toBe("2026-09-03 21:00");
    expect(kst(parseKstSchedule("9월 3일 21시", NOW))).toBe("2026-09-03 21:00");
  });

  it("이미 지난 날짜는 내년으로 읽는다", () => {
    expect(kst(parseKstSchedule("1/2 21:00", NOW))).toBe("2027-01-02 21:00");
  });

  it("상대 시각을 지원한다", () => {
    expect(kst(parseKstSchedule("2시간 뒤", NOW))).toBe("2026-09-01 17:00");
    expect(kst(parseKstSchedule("30분 후", NOW))).toBe("2026-09-01 15:30");
  });

  it("해석할 수 없으면 null", () => {
    expect(parseKstSchedule("", NOW)).toBeNull();
    expect(parseKstSchedule("아무때나", NOW)).toBeNull();
    expect(parseKstSchedule("25:00", NOW)).toBeNull();
    expect(parseKstSchedule("21:70", NOW)).toBeNull();
  });

  it("서버 TZ와 무관하게 KST로 해석한다", () => {
    // UTC 자정 직전(= KST 오전 8시 59분)에도 "오늘"은 KST 기준 날짜다.
    const lateUtc = new Date("2026-09-01T23:30:00.000Z"); // KST 9/2 08:30
    expect(kst(parseKstSchedule("오늘 21:00", lateUtc))).toBe("2026-09-02 21:00");
  });
});

describe("formatKst", () => {
  it("요일을 포함한 한국 시간 문자열을 만든다", () => {
    expect(formatKst(new Date("2026-09-03T12:00:00.000Z"))).toBe(
      "9월 3일(목) 21:00",
    );
  });
});
