/**
 * 채팅 계열 WebSocket 이벤트 공통 레이트 리밋.
 *
 * 전역 HTTP 스로틀러(100req/분)는 WebSocket 메시지에 적용되지 않는다.
 * 그래서 채팅 emit은 어떤 상한도 없이 매 건 DB 쓰기 + 방 전체 브로드캐스트를
 * 유발할 수 있었다. 경매 입찰·스네이크 드래프트 픽에는 이미 같은 방식의
 * 제한이 걸려 있고, 채팅 계열만 빠져 있었다.
 *
 * 사람이 실제로 칠 수 있는 속도보다 넉넉하게 잡아 정상 대화는 건드리지 않고
 * 자동화된 반복 전송만 끊는 것이 목적이다.
 */
export const CHAT_RATE_LIMIT = {
  /** 윈도우당 허용 메시지 수 */
  limit: 10,
  /** 윈도우 길이(초) */
  windowSeconds: 10,
} as const;

/**
 * 타이핑 표시(is-typing)용 한도.
 *
 * 메시지 전송보다 훨씬 느슨해야 한다. 클라이언트가 입력 중에 반복 emit하고
 * (500ms 디바운스가 있지만) 서버는 "방금 시작함" 전환에서만 브로드캐스트하므로
 * 정상 사용에서도 호출 자체는 잦다. 메시지와 같은 한도를 쓰면 타이핑 표시가 깨진다.
 *
 * 막으려는 것은 isTyping을 false↔true로 번갈아 보내 전환을 강제로 만들어
 * 방 전체 브로드캐스트를 무한히 유발하는 경우다.
 */
export const TYPING_RATE_LIMIT = {
  limit: 30,
  windowSeconds: 10,
} as const;

type RateLimitConfig = { limit: number; windowSeconds: number };

/** RedisService에서 실제로 쓰는 부분만 추린 구조적 타입 (테스트 대역 주입 용이) */
export type RateLimitChecker = {
  checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }>;
};

export type ChatRateLimitResult =
  { allowed: true } | { allowed: false; retryIn: number };

/**
 * 채팅 전송 허용 여부를 확인한다.
 *
 * Redis가 없거나 조회에 실패하면 통과시킨다. 레이트 리밋은 남용 방지 장치이지
 * 정합성 장치가 아니므로, Redis 장애가 곧 전체 채팅 중단이 되면 안 된다.
 * (경매/드래프트에 이미 적용된 것과 같은 판단이다)
 */
async function checkLimit(
  redis: RateLimitChecker | null | undefined,
  key: string,
  config: RateLimitConfig,
): Promise<ChatRateLimitResult> {
  if (!redis) return { allowed: true };

  try {
    const result = await redis.checkRateLimit(
      key,
      config.limit,
      config.windowSeconds,
    );
    if (result.allowed) return { allowed: true };
    return { allowed: false, retryIn: result.resetIn };
  } catch {
    return { allowed: true };
  }
}

export function checkChatRateLimit(
  redis: RateLimitChecker | null | undefined,
  key: string,
): Promise<ChatRateLimitResult> {
  return checkLimit(redis, key, CHAT_RATE_LIMIT);
}

/**
 * 타이핑 표시 전송 허용 여부.
 * 막혔을 때 사용자에게 알릴 필요는 없다 — 타이핑 표시는 장식이라
 * 호출부는 그냥 조용히 무시하면 된다.
 */
export function checkTypingRateLimit(
  redis: RateLimitChecker | null | undefined,
  key: string,
): Promise<ChatRateLimitResult> {
  return checkLimit(redis, key, TYPING_RATE_LIMIT);
}

/** 사용자에게 보여줄 한국어 안내 문구 */
export function chatRateLimitMessage(retryIn: number): string {
  return `메시지를 너무 빠르게 보내고 있습니다. ${retryIn}초 후에 다시 시도해주세요.`;
}
