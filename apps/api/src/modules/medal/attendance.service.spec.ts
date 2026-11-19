import { MedalReason } from "@nexus/database";
import { MedalService } from "./medal.service";
import { createFakePrisma } from "./medal.fake-prisma";
import {
  ATTENDANCE_REWARD,
  ATTENDANCE_STREAK_BONUS,
  AttendanceService,
  countStreak,
  shiftDayKey,
} from "./attendance.service";

/** KST 그날 정오 — 날짜 경계에 걸리지 않게 */
const kstNoon = (day: string) => new Date(`${day}T12:00:00+09:00`);

describe("AttendanceService", () => {
  let db: ReturnType<typeof createFakePrisma>;
  let service: AttendanceService;

  beforeEach(() => {
    db = createFakePrisma();
    service = new AttendanceService(db.api, new MedalService(db.api));
  });

  it("하루 한 번 10 메달을 주고, 같은 날 다시 눌러도 더 주지 않는다", async () => {
    const first = await service.checkIn("u1", kstNoon("2026-11-19"));
    expect(first.granted).toBe(ATTENDANCE_REWARD);
    expect(first.checkedToday).toBe(true);
    expect(first.streak).toBe(1);

    const again = await service.checkIn("u1", kstNoon("2026-11-19"));
    expect(again.granted).toBe(0);
    expect(db.balance("u1")).toBe(ATTENDANCE_REWARD);
  });

  it("KST 자정이 지나면 다음 날로 센다", async () => {
    // 11-19 23:59 KST 와 11-20 00:01 KST 는 다른 날
    await service.checkIn("u1", new Date("2026-11-19T23:59:00+09:00"));
    const next = await service.checkIn(
      "u1",
      new Date("2026-11-20T00:01:00+09:00"),
    );
    expect(next.granted).toBe(ATTENDANCE_REWARD);
    expect(next.streak).toBe(2);
  });

  it("7일 연속째에 보너스 50 을 같이 주고, 사유를 따로 남긴다", async () => {
    let last: Awaited<ReturnType<AttendanceService["checkIn"]>> | null = null;
    for (let i = 0; i < 7; i++) {
      last = await service.checkIn("u1", kstNoon(shiftDayKey("2026-11-01", i)));
      if (i < 6) expect(last.bonus).toBe(0);
    }
    expect(last!.streak).toBe(7);
    expect(last!.bonus).toBe(ATTENDANCE_STREAK_BONUS);
    expect(db.balance("u1")).toBe(
      7 * ATTENDANCE_REWARD + ATTENDANCE_STREAK_BONUS,
    );
    expect(
      db.ledger().filter((l) => l.reason === MedalReason.ATTENDANCE_STREAK),
    ).toHaveLength(1);
  });

  it("하루 빠지면 연속이 끊겨 1 부터 다시 센다", async () => {
    await service.checkIn("u1", kstNoon("2026-11-01"));
    await service.checkIn("u1", kstNoon("2026-11-02"));
    const after = await service.checkIn("u1", kstNoon("2026-11-04"));
    expect(after.streak).toBe(1);
  });

  it("현황: 오늘 안 했어도 어제까지의 연속을 보여 주고, 이번 달 출석일을 준다", async () => {
    await service.checkIn("u1", kstNoon("2026-10-31"));
    await service.checkIn("u1", kstNoon("2026-11-01"));
    const status = await service.getStatus("u1", kstNoon("2026-11-02"));
    expect(status.checkedToday).toBe(false);
    expect(status.streak).toBe(2);
    expect(status.monthDays).toEqual(["2026-11-01"]);
    // 오늘 하면 3일째 → 7일째 보너스까지 4일(오늘 포함 뒤로 4번 더)
    expect(status.daysToBonus).toBe(4);
  });

  it("다른 사람 출석과 섞이지 않는다", async () => {
    await service.checkIn("u1", kstNoon("2026-11-19"));
    const other = await service.getStatus("u2", kstNoon("2026-11-19"));
    expect(other.checkedToday).toBe(false);
    expect(other.streak).toBe(0);
  });
});

describe("countStreak", () => {
  it("오늘을 안 했으면 어제부터 센다", () => {
    const days = new Set(["2026-11-17", "2026-11-18"]);
    expect(countStreak(days, "2026-11-19")).toBe(2);
    expect(countStreak(days, "2026-11-20")).toBe(0);
  });
  it("월말을 넘어서도 이어진다", () => {
    expect(shiftDayKey("2026-12-01", -1)).toBe("2026-11-30");
    expect(
      countStreak(new Set(["2026-11-30", "2026-12-01"]), "2026-12-01"),
    ).toBe(2);
  });
});
