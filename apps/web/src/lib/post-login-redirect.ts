/**
 * 로그인 후 돌아갈 경로.
 *
 * Discord OAuth 는 우리 화면을 떠났다 돌아오므로 목적지를 넘겨줄 데가 없다.
 * 그래서 로그인 화면에서 sessionStorage 에 적어두고 콜백에서 꺼내 쓴다.
 *
 * **없으면 반드시 지운다.** 전에는 `redirect` 쿼리가 있을 때만 쓰고 없을 때는
 * 손대지 않아서, 게임 카드(`/auth/login?redirect=/lol`)를 눌렀다가 뒤로 나온
 * 뒤 헤더의 "로그인"(쿼리 없음)으로 로그인하면 남아 있던 `/lol` 로 갔다 —
 * 종합 홈으로 가야 하는데 롤 홈으로 떨어지던 원인이다. 로그인 화면에 목적지
 * 없이 들어왔다는 건 "그냥 로그인" 이라는 뜻이므로 이전 목적지는 버려야 한다.
 *
 * 검사 규칙을 한 곳에 둔다. 쓰는 쪽과 읽는 쪽에 각각 복사돼 있어서 한쪽만
 * 고치면 열린 채로 남는다.
 */
const KEY = "nexus_post_login_redirect";

/**
 * 우리 사이트 안의 경로인지 확인한다.
 * `//evil.com` 은 프로토콜 상대 URL 이라 외부로 나간다.
 * `/api/` 와 `/auth/` 는 화면이 아니거나 로그인 루프를 만든다.
 */
export function sanitizePostLoginRedirect(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/api/") || value.startsWith("/auth/")) return null;
  return value;
}

/** 목적지를 기억한다. `null` 이면 이전에 기억한 목적지를 버린다. */
export function rememberPostLoginRedirect(value: string | null) {
  const safe = sanitizePostLoginRedirect(value);
  try {
    if (safe) sessionStorage.setItem(KEY, safe);
    else sessionStorage.removeItem(KEY);
  } catch {
    // 시크릿 모드·저장소 차단에서는 던진다. 목적지를 못 기억하면
    // 종합 홈으로 가면 되므로 로그인 자체를 막을 이유는 없다.
  }
  return safe;
}

/** 목적지를 꺼내고 비운다. 한 번만 쓰여야 한다. */
export function takePostLoginRedirect() {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return sanitizePostLoginRedirect(value);
  } catch {
    return null;
  }
}
