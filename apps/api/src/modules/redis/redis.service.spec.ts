import { RedisService } from "./redis.service";

describe("RedisService distributed lock", () => {
  const createService = (evalResult: number) => {
    const service = Object.create(RedisService.prototype) as RedisService;
    const evalMock = jest.fn().mockResolvedValue(evalResult);
    (service as unknown as { client: { eval: jest.Mock } }).client = {
      eval: evalMock,
    };
    return { service, evalMock };
  };

  it("현재 토큰 소유자일 때만 락 TTL을 갱신한다", async () => {
    const { service, evalMock } = createService(1);

    await expect(service.extendLock("lock:key", "token", 30_000)).resolves.toBe(
      true,
    );
    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("pexpire"'),
      1,
      "lock:key",
      "token",
      30_000,
    );
  });

  it("토큰이 다르면 다른 워커의 락을 연장하지 않는다", async () => {
    const { service } = createService(0);

    await expect(
      service.extendLock("lock:key", "stale-token", 30_000),
    ).resolves.toBe(false);
  });
});
