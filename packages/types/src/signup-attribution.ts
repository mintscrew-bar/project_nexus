/**
 * 첫 방문의 유입 경로를 쿠키에 담을 값으로 만든다.
 *
 * 우선순위: `utm_source` > 외부 리퍼러의 호스트 > "direct".
 * 자기 사이트 안에서 온 이동(리퍼러가 같은 호스트)은 유입이 아니라 직접 방문으로 본다.
 * 리퍼러는 **호스트만** 남긴다 — 경로·쿼리에는 검색어나 개인 정보가 실릴 수 있다.
 */
export interface SignupAttributionCookie {
  /** 출처 */
  s: string;
  /** 매체 */
  m?: string;
  /** 외부 리퍼러 호스트 */
  r?: string;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function buildSignupAttribution(input: {
  /** `location.search` */
  search: string;
  /** `document.referrer` */
  referrer: string;
  /** `location.hostname` */
  ownHost: string;
}): SignupAttributionCookie {
  const params = new URLSearchParams(input.search);
  const utmSource = params.get("utm_source")?.trim();
  const utmMedium = params.get("utm_medium")?.trim();

  const own = input.ownHost.toLowerCase().replace(/^www\./, "");
  const refHost = input.referrer ? hostOf(input.referrer) : null;
  const externalRef = refHost && refHost !== own ? refHost : null;

  const result: SignupAttributionCookie = {
    s: utmSource || externalRef || "direct",
  };
  if (utmMedium) result.m = utmMedium;
  if (externalRef) result.r = externalRef;
  return result;
}
