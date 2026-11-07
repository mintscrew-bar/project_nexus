import type { ExecutionContext } from "@nestjs/common";
import { AuthAwareThrottlerGuard } from "./auth-aware-throttler.guard";

/**
 * 전역 HTTP 레이트 리밋 가드가 소켓 이벤트에서 터지지 않는지 확인한다.
 * (2026-11-07 운영: 페이로드 없는 소켓 이벤트에서 undefined.header TypeError)
 */
describe("AuthAwareThrottlerGuard", () => {
  const guard = new AuthAwareThrottlerGuard(
    { throttlers: [{ limit: 1, ttl: 60_000 }] } as any,
    {} as any,
    { getAllAndOverride: () => false } as any,
    { get: () => undefined } as any,
  );
  const skip = (type: string) =>
    (guard as any).shouldSkip({ getType: () => type } as ExecutionContext);

  it("소켓 이벤트는 건너뛴다 (게이트웨이 guardAction 이 맡는다)", async () => {
    await expect(skip("ws")).resolves.toBe(true);
  });

  it("HTTP 요청은 그대로 제한한다", async () => {
    await expect(skip("http")).resolves.toBe(false);
  });
});
