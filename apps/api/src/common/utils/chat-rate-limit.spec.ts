import {
  CHAT_RATE_LIMIT,
  TYPING_RATE_LIMIT,
  checkChatRateLimit,
  checkTypingRateLimit,
  chatRateLimitMessage,
} from "./chat-rate-limit";

describe("checkChatRateLimit", () => {
  it("한도 안이면 통과시킨다", async () => {
    const redis = {
      checkRateLimit: jest
        .fn()
        .mockResolvedValue({ allowed: true, remaining: 7, resetIn: 6 }),
    };

    await expect(checkChatRateLimit(redis, "chat:room:u1")).resolves.toEqual({
      allowed: true,
    });
    expect(redis.checkRateLimit).toHaveBeenCalledWith(
      "chat:room:u1",
      CHAT_RATE_LIMIT.limit,
      CHAT_RATE_LIMIT.windowSeconds,
    );
  });

  it("한도를 넘으면 남은 대기 시간과 함께 차단한다", async () => {
    const redis = {
      checkRateLimit: jest
        .fn()
        .mockResolvedValue({ allowed: false, remaining: 0, resetIn: 4 }),
    };

    await expect(checkChatRateLimit(redis, "chat:dm:u1")).resolves.toEqual({
      allowed: false,
      retryIn: 4,
    });
  });

  it("Redis가 없으면 채팅을 막지 않는다", async () => {
    await expect(checkChatRateLimit(null, "chat:clan:u1")).resolves.toEqual({
      allowed: true,
    });
    await expect(
      checkChatRateLimit(undefined, "chat:clan:u1"),
    ).resolves.toEqual({ allowed: true });
  });

  it("Redis 조회가 실패해도 채팅을 막지 않는다", async () => {
    // 레이트 리밋은 남용 방지 장치일 뿐이라, Redis 장애가 전체 채팅 중단이 되면 안 된다.
    const redis = {
      checkRateLimit: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    };

    await expect(checkChatRateLimit(redis, "chat:room:u1")).resolves.toEqual({
      allowed: true,
    });
  });

  it("사용자별로 키가 분리되어 서로의 한도를 소모하지 않는다", async () => {
    const redis = {
      checkRateLimit: jest
        .fn()
        .mockResolvedValue({ allowed: true, remaining: 9, resetIn: 10 }),
    };

    await checkChatRateLimit(redis, "chat:room:userA");
    await checkChatRateLimit(redis, "chat:room:userB");

    const keys = redis.checkRateLimit.mock.calls.map((call) => call[0]);
    expect(new Set(keys).size).toBe(2);
  });

  it("안내 문구에 남은 시간을 담는다", () => {
    expect(chatRateLimitMessage(5)).toContain("5초");
  });
});

describe("checkTypingRateLimit", () => {
  it("메시지보다 느슨한 한도를 쓴다", async () => {
    // 같은 한도를 쓰면 정상 타이핑 표시가 끊긴다.
    expect(TYPING_RATE_LIMIT.limit).toBeGreaterThan(CHAT_RATE_LIMIT.limit);

    const redis = {
      checkRateLimit: jest
        .fn()
        .mockResolvedValue({ allowed: true, remaining: 29, resetIn: 10 }),
    };
    await checkTypingRateLimit(redis, "typing:room:u1");
    expect(redis.checkRateLimit).toHaveBeenCalledWith(
      "typing:room:u1",
      TYPING_RATE_LIMIT.limit,
      TYPING_RATE_LIMIT.windowSeconds,
    );
  });

  it("한도를 넘으면 차단한다", async () => {
    const redis = {
      checkRateLimit: jest
        .fn()
        .mockResolvedValue({ allowed: false, remaining: 0, resetIn: 3 }),
    };
    await expect(checkTypingRateLimit(redis, "typing:dm:u1")).resolves.toEqual({
      allowed: false,
      retryIn: 3,
    });
  });

  it("메시지 한도와 키를 공유하지 않는다", async () => {
    // chat:*와 typing:* 키가 분리돼야 타이핑이 메시지 한도를 갉아먹지 않는다.
    const redis = {
      checkRateLimit: jest
        .fn()
        .mockResolvedValue({ allowed: true, remaining: 5, resetIn: 10 }),
    };
    await checkChatRateLimit(redis, "chat:room:u1");
    await checkTypingRateLimit(redis, "typing:room:u1");
    const keys = redis.checkRateLimit.mock.calls.map((c) => c[0]);
    expect(keys).toEqual(["chat:room:u1", "typing:room:u1"]);
  });
});
