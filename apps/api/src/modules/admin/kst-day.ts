/**
 * KST(UTC+9) 달력 날짜 다루기. 서버 시간대에 기대지 않는다 — 컨테이너 TZ 가 UTC 여도
 * "어제" 가 한국 기준 어제여야 일별 지표가 운영자가 아는 하루와 맞는다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 순간 → 그 순간이 속한 KST 날짜의 UTC 자정 (DB `@db.Date` 에 그대로 넣는 값) */
export function kstDateOf(instant: Date): Date {
  const kst = new Date(instant.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()),
  );
}

/** 어제(KST) 날짜 */
export function yesterdayKst(now: Date): Date {
  return new Date(kstDateOf(now).getTime() - DAY_MS);
}

/** KST 날짜 하나의 실제 시간 범위 [start, end) */
export function kstDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getTime() - KST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
