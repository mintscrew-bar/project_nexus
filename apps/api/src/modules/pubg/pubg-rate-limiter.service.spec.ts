import { PubgRateLimiterService } from "./pubg-rate-limiter.service";

/**
 * 전역 예산은 호출 한 번에 토큰 하나만 써야 한다.
 *
 * 예전에는 창이 두 개짜리 스크립트에 같은 키를 두 번 넘겼고, 그 스크립트가
 * KEYS 둘을 각각 INCR 해서 카운터가 2씩 올랐다. 예산이 설정값의 절반이 되어
 * 닉네임 조회(샤드 두 곳 = 2콜) 두 번이면 한도에 닿았다.
 */
describe("PubgRateLimiterService", () => {
  /** INCR 를 실제로 세는 최소 Redis 대역 */
  const makeRedis = () => {
    const counters = new Map<string, number>();
    return {
      counters,
      consumeWindow: jest.fn(async (key: string, limit: number) => {
        const current = counters.get(key) ?? 0;
        if (current >= limit) return { allowed: false, retryAfterMs: 1000 };
        counters.set(key, current + 1);
        return { allowed: true, retryAfterMs: 0 };
      }),
      // 남아 있으면 안 되는 경로 — 호출되면 테스트가 잡는다.
      consumeDualWindow: jest.fn(),
    };
  };

  const config = { get: jest.fn().mockReturnValue(undefined) };

  it("호출 한 번에 토큰 하나만 쓴다", async () => {
    const redis = makeRedis();
    const service = new PubgRateLimiterService(config as any, redis as any);

    await service.tryConsume();

    expect(redis.counters.get("pubg:global:minute")).toBe(1);
    expect(redis.consumeDualWindow).not.toHaveBeenCalled();
  });

  it("기본 예산(9)을 다 쓸 때까지 통과시킨다", async () => {
    const redis = makeRedis();
    const service = new PubgRateLimiterService(config as any, redis as any);

    const results: boolean[] = [];
    for (let i = 0; i < 10; i++) {
      results.push((await service.tryConsume()).allowed);
    }

    // 9번 통과하고 10번째가 막힌다. 절반(4)에서 막히면 안 된다.
    expect(results.filter(Boolean)).toHaveLength(9);
    expect(results[9]).toBe(false);
  });

  it("예산이 비면 대기 상한을 넘겨 429 로 끊는다", async () => {
    const redis = makeRedis();
    redis.counters.set("pubg:global:minute", 9);
    const service = new PubgRateLimiterService(config as any, redis as any);

    await expect(service.acquireInteractive(0)).rejects.toMatchObject({
      status: 429,
    });
  });
});
