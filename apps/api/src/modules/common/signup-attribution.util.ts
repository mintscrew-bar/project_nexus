/**
 * 가입 유입 경로.
 *
 * 웹이 첫 방문 때 `nx_attr` 쿠키에 {s: 출처, m: 매체, r: 리퍼러 호스트} 를 남기고,
 * 서버는 **가입하는 순간에만** 그걸 읽어 유저에 한 번 기록한다. 쿠키는 사용자가
 * 마음대로 바꿀 수 있는 입력이라 길이와 문자를 제한한다 — 통계 칼럼을 오염시키거나
 * 화면에 그대로 찍혀도 안전해야 한다.
 */
export const ATTRIBUTION_COOKIE = "nx_attr";

export interface SignupAttribution {
  source: string;
  medium: string | null;
  referrer: string | null;
}

const MAX_LEN = 64;
const SAFE = /[^a-z0-9._\-]/g;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.toLowerCase().replace(SAFE, "").slice(0, MAX_LEN);
  return cleaned.length > 0 ? cleaned : null;
}

/** 쿠키 값(URL 인코딩된 JSON)을 검증해 읽는다. 못 읽으면 null. */
export function parseAttributionCookie(raw: unknown): SignupAttribution | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Record<
      string,
      unknown
    >;
    const source = clean(parsed.s);
    if (!source) return null;
    return {
      source,
      medium: clean(parsed.m),
      referrer: clean(parsed.r),
    };
  } catch {
    return null;
  }
}
