import { addDays, kstDateOf, kstDayRange, yesterdayKst } from "./kst-day";

describe("KST 날짜", () => {
  it("UTC 15:00 이후는 KST 로 다음 날이다", () => {
    // 2026-10-05 15:00Z = 2026-10-06 00:00 KST
    expect(kstDateOf(new Date("2026-10-05T15:00:00Z")).toISOString()).toBe(
      "2026-10-06T00:00:00.000Z",
    );
    expect(kstDateOf(new Date("2026-10-05T14:59:59Z")).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });

  it("어제는 서버 시간대가 아니라 한국 기준이다", () => {
    // UTC 로는 10-05 이지만 KST 로는 10-06 00:10 → 어제는 10-05
    expect(yesterdayKst(new Date("2026-10-05T15:10:00Z")).toISOString()).toBe(
      "2026-10-05T00:00:00.000Z",
    );
  });

  it("하루 범위는 KST 자정에서 자정까지 24시간이다", () => {
    const { start, end } = kstDayRange(new Date("2026-10-06T00:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-05T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-06T15:00:00.000Z");
  });

  it("월말을 넘겨도 날짜가 맞다", () => {
    expect(addDays(new Date("2026-10-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });
});
