/**
 * `/nexus schedule` 의 시각 입력을 해석한다.
 *
 * 서버 컨테이너의 TZ 설정에 기대지 않고 항상 한국 시간(KST, 고정 +09:00)으로
 * 읽는다. 사용자는 "21:00"을 한국 시간으로 쓰지, 서버 로케일로 쓰지 않는다.
 */

const KST_OFFSET_MINUTES = 9 * 60;

/** 한국 시간 기준 벽시계 값으로 UTC Date를 만든다. KST는 DST가 없어 고정 오프셋으로 충분하다. */
function kstWallClockToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MINUTES * 60_000,
  );
}

/** 주어진 시각을 한국 시간 기준 연/월/일/시/분으로 쪼갠다. */
export function toKstParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const shifted = new Date(date.getTime() + KST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** "9월 3일 21:00" 처럼 사람이 읽는 한국 시간 문자열. */
export function formatKst(date: Date): string {
  const { month, day, hour, minute } = toKstParts(date);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(date.getTime() + KST_OFFSET_MINUTES * 60_000).getUTCDay()
  ];
  return `${month}월 ${day}일(${weekday}) ${String(hour).padStart(2, "0")}:${String(
    minute,
  ).padStart(2, "0")}`;
}

/** 하루를 더한 KST 날짜 */
function addKstDays(
  parts: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const moved = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );
  return {
    year: moved.getUTCFullYear(),
    month: moved.getUTCMonth() + 1,
    day: moved.getUTCDate(),
  };
}

const RELATIVE_PATTERN = /^(\d{1,3})\s*(시간|분)\s*(뒤|후)$/;
const DAY_WORDS: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2 };
const AM_WORDS = ["오전", "아침", "새벽"];
const PM_WORDS = ["오후", "저녁", "밤"];

/**
 * 사용자가 친 시각 문자열을 Date로 바꾼다. 해석할 수 없으면 null.
 *
 * 지원 형태:
 *   `21:00` `9시` `21시 30분` `오늘 21:00` `내일 20:30` `모레 21시`
 *   `9/3 21:00` `9월 3일 21시` `2시간 뒤` `30분 뒤`
 *
 * 날짜·오전/오후를 모두 생략한 경우에만 "지금 이후로 가장 가까운 시각"으로
 * 읽는다. 오후 3시에 `9시`라고 치면 오늘 21시, 밤 10시에 치면 내일 9시가 된다.
 * 날짜를 명시했으면 적힌 그대로 해석한다 — 추측이 끼면 예약 시각을 신뢰할 수 없다.
 */
export function parseKstSchedule(input: string, now: Date = new Date()): Date | null {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return null;

  // ── "2시간 뒤" 같은 상대 시각 ──
  const relative = RELATIVE_PATTERN.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const ms = relative[2] === "시간" ? amount * 3_600_000 : amount * 60_000;
    // 분 단위는 버린 채 그대로 더한다. 초 단위 오차는 리마인드에 영향이 없다.
    return new Date(now.getTime() + ms);
  }

  let rest = text;
  const nowParts = toKstParts(now);
  let date: { year: number; month: number; day: number } | null = null;
  let dayExplicit = false;

  // ── 오늘/내일/모레 ──
  for (const [word, offset] of Object.entries(DAY_WORDS)) {
    if (rest.startsWith(word)) {
      date = addKstDays(nowParts, offset);
      rest = rest.slice(word.length).trim();
      dayExplicit = true;
      break;
    }
  }

  // ── "9/3" 또는 "9월 3일" ──
  if (!dayExplicit) {
    const dateMatch = /^(\d{1,2})\s*(?:\/|월)\s*(\d{1,2})\s*일?/.exec(rest);
    if (dateMatch) {
      const month = Number(dateMatch[1]);
      const day = Number(dateMatch[2]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      // 연도는 적지 않는다. 이미 지난 날짜면 내년으로 읽는다.
      const year =
        month < nowParts.month ||
        (month === nowParts.month && day < nowParts.day)
          ? nowParts.year + 1
          : nowParts.year;
      date = { year, month, day };
      rest = rest.slice(dateMatch[0].length).trim();
      dayExplicit = true;
    }
  }

  // ── 오전/오후 ──
  let meridiem: "am" | "pm" | null = null;
  for (const word of AM_WORDS) {
    if (rest.startsWith(word)) {
      meridiem = "am";
      rest = rest.slice(word.length).trim();
      break;
    }
  }
  if (!meridiem) {
    for (const word of PM_WORDS) {
      if (rest.startsWith(word)) {
        meridiem = "pm";
        rest = rest.slice(word.length).trim();
        break;
      }
    }
  }

  // ── 시:분 ──
  const timeMatch = /^(\d{1,2})\s*(:|시)\s*(\d{1,2})?\s*분?$/.exec(rest);
  if (!timeMatch) return null;
  let hour = Number(timeMatch[1]);
  // `10:00` 처럼 24시간제로 적었으면 적힌 그대로다. `10시`처럼 적었을 때만
  // 오후로 밀어볼 여지가 있다.
  const wroteClockForm = timeMatch[2] === ":";
  const minute = timeMatch[3] ? Number(timeMatch[3]) : 0;
  if (hour > 23 || minute > 59) return null;

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  const base = date ?? nowParts;
  const candidate = kstWallClockToDate(
    base.year,
    base.month,
    base.day,
    hour,
    minute,
  );

  if (dayExplicit || meridiem) return candidate;

  // 날짜도 오전/오후도 없으면 지금 이후로 가장 가까운 해석을 고른다.
  const options = [candidate];
  if (!wroteClockForm && hour < 12) {
    options.push(
      kstWallClockToDate(base.year, base.month, base.day, hour + 12, minute),
    );
  }
  const tomorrow = addKstDays(base, 1);
  options.push(
    kstWallClockToDate(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute),
  );

  const future = options
    .filter((option) => option.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return future[0] ?? null;
}
