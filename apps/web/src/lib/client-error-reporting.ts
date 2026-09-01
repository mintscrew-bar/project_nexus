import { getAccessToken } from "@/lib/api-client";

const recentlyReported = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

/**
 * 화면에 기술 오류를 노출하는 대신 운영 로그로 best-effort 전송한다.
 * 이 요청의 실패가 다시 사용자 오류나 토스트를 만들면 안 된다.
 */
export function reportClientError(message: string, source = "toast") {
  if (typeof window === "undefined" || !message.trim()) return;

  const path = `${window.location.pathname}${window.location.search}`;
  const key = `${source}:${path}:${message}`;
  const now = Date.now();
  if (now - (recentlyReported.get(key) ?? 0) < DEDUPE_WINDOW_MS) return;
  recentlyReported.set(key, now);

  const token = getAccessToken();
  void fetch("/api/client-error-logs", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message: message.slice(0, 1000),
      path: path.slice(0, 500),
      source,
      userAgent: navigator.userAgent.slice(0, 500),
    }),
  }).catch(() => undefined);

  // 오래된 키가 무한히 쌓이지 않도록 가볍게 정리한다.
  if (recentlyReported.size > 100) {
    for (const [entry, reportedAt] of recentlyReported) {
      if (now - reportedAt >= DEDUPE_WINDOW_MS) recentlyReported.delete(entry);
    }
  }
}
