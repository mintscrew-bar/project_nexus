import { Injectable } from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { MedalService } from "./medal.service";
import { kstDayKey } from "./match-medal.service";

/** 출석 하루 보상 */
export const ATTENDANCE_REWARD = 10;
/** 연속 출석 보너스 — 이 날수마다(7·14·21…일째) */
export const ATTENDANCE_STREAK_EVERY = 7;
/** 연속 출석 보너스 크기 */
export const ATTENDANCE_STREAK_BONUS = 50;
/** 연속 일수·달력을 셀 때 거슬러 보는 기간 */
const LOOKBACK_DAYS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" 에서 n 일 앞뒤 */
export function shiftDayKey(dayKey: string, days: number): string {
  const t = Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * 연속 출석 일수 — 기준일(today)부터 하루씩 거슬러 끊길 때까지 센다.
 * 오늘 아직 안 했으면 어제부터 센다(오늘 하면 이어지는 연속이므로).
 */
export function countStreak(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : shiftDayKey(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }
  return streak;
}

/**
 * 출석 체크 — 하루 한 번 버튼을 눌러 메달을 받는다.
 *
 * 따로 테이블을 두지 않고 메달 원장(MedalLedger)에 남긴다. 원장에는 날짜(dayKey, KST)가
 * 있고 멱등 키가 유니크라, `attendance:{유저}:{날짜}` 키로 같은 날 두 번 받는 것을
 * DB 가 막는다(동시에 두 번 눌러도 한 번만).
 *
 * - 하루 10 메달, 7일 연속마다 보너스 50 메달(별도 사유 ATTENDANCE_STREAK).
 * - 경기 메달의 하루 상한(180)과는 따로 센다 — 상한은 경기 사유만 본다.
 * - 날짜는 KST 자정 기준.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medalService: MedalService,
  ) {}

  /** 출석한 날짜(KST) 모음 — 최근 LOOKBACK_DAYS 일 */
  private async attendedDays(userId: string, today: string) {
    const since = shiftDayKey(today, -LOOKBACK_DAYS);
    const rows = await this.prisma.medalLedger.findMany({
      where: {
        userId,
        reason: MedalReason.ATTENDANCE,
        dayKey: { gte: since },
      },
      select: { dayKey: true },
    });
    return new Set(
      rows
        .map((r) => r.dayKey)
        .filter((d): d is string => !!d && d >= since && d <= today),
    );
  }

  /** 출석 현황 — 오늘 했는지, 연속 일수, 이번 달 출석한 날 */
  async getStatus(userId: string, now = new Date()) {
    const today = kstDayKey(now);
    const days = await this.attendedDays(userId, today);
    const streak = countStreak(days, today);
    const month = today.slice(0, 7);
    const checkedToday = days.has(today);
    // 오늘 받으면 몇 일째가 되는가 — 보너스 날인지 미리 알려 준다
    const nextStreak = checkedToday ? streak : streak + 1;
    return {
      today,
      checkedToday,
      streak,
      monthDays: [...days].filter((d) => d.startsWith(month)).sort(),
      reward: ATTENDANCE_REWARD,
      streakEvery: ATTENDANCE_STREAK_EVERY,
      streakBonus: ATTENDANCE_STREAK_BONUS,
      /** 다음 보너스까지 남은 날(오늘 포함). 0 이면 오늘이 보너스 날이었다 */
      daysToBonus:
        (ATTENDANCE_STREAK_EVERY - (nextStreak % ATTENDANCE_STREAK_EVERY)) %
        ATTENDANCE_STREAK_EVERY,
    };
  }

  /**
   * 오늘 출석. 이미 했으면 아무것도 주지 않고 현황만 돌려준다(granted 0).
   * 연속 일수가 7의 배수가 되는 날엔 보너스를 같이 준다.
   */
  async checkIn(userId: string, now = new Date()) {
    const today = kstDayKey(now);
    const before = await this.attendedDays(userId, today);
    if (before.has(today)) {
      return { granted: 0, bonus: 0, ...(await this.getStatus(userId, now)) };
    }

    const daily = await this.medalService.record({
      userId,
      amount: ATTENDANCE_REWARD,
      reason: MedalReason.ATTENDANCE,
      idempotencyKey: `attendance:${userId}:${today}`,
      dayKey: today,
    });
    // 동시에 두 번 눌러 다른 요청이 먼저 넣었으면 여기서는 주지 않는다
    if (daily.duplicated) {
      return { granted: 0, bonus: 0, ...(await this.getStatus(userId, now)) };
    }

    const streak = countStreak(new Set([...before, today]), today);
    let bonus = 0;
    if (streak % ATTENDANCE_STREAK_EVERY === 0) {
      const res = await this.medalService.record({
        userId,
        amount: ATTENDANCE_STREAK_BONUS,
        reason: MedalReason.ATTENDANCE_STREAK,
        idempotencyKey: `attendance-streak:${userId}:${today}`,
        dayKey: today,
        metadata: { streak },
      });
      if (!res.duplicated) bonus = ATTENDANCE_STREAK_BONUS;
    }

    return {
      granted: ATTENDANCE_REWARD,
      bonus,
      ...(await this.getStatus(userId, now)),
    };
  }
}
