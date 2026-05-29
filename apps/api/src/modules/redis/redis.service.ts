import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl =
      this.configService.get<string>("REDIS_URL") || "redis://localhost:6379";
    this.client = new Redis(redisUrl);
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  // Hash operations
  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.client.hdel(key, field);
  }

  // Pub/Sub
  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  subscribe(channel: string, callback: (message: string) => void): void {
    const subscriber = this.client.duplicate();
    subscriber.subscribe(channel);
    subscriber.on("message", (ch, message) => {
      if (ch === channel) {
        callback(message);
      }
    });
  }

  // ========================================
  // 분산 락 (Redis SET NX PX)
  // ========================================

  /**
   * Redis SET NX PX를 이용한 분산 락 획득.
   * 단일 명령어로 원자적 처리되어 레이스 컨디션 없음.
   *
   * @param key  락 키 (예: `bid:lock:roomId`)
   * @param ttlMs 락 최대 보유 시간(ms) — 서버 크래시 시 자동 해제
   * @returns 락 토큰(UUID) 또는 null(획득 실패)
   */
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // SET key token PX ttlMs NX — 원자적: 키가 없을 때만 설정
    // ioredis v5: 인자 순서가 PX(만료) → NX(조건) 순이어야 함
    const result = await this.client.set(key, token, "PX", ttlMs, "NX");
    return result === "OK" ? token : null;
  }

  /**
   * 락 해제 — 본인이 설정한 토큰인지 확인 후 삭제 (Lua 스크립트로 원자적 처리).
   * 타인이 설정한 락을 실수로 해제하는 것을 방지한다.
   */
  async releaseLock(key: string, token: string): Promise<void> {
    // GET + DEL 원자성 보장: Lua 스크립트
    const lua = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.client.eval(lua, 1, key, token);
  }

  /**
   * SCAN 기반 패턴 매칭 키 일괄 삭제 — 스냅샷 갱신 후 lab:* 캐시 무효화 등에 사용
   */
  async deleteByPattern(pattern: string): Promise<number> {
    let deleted = 0;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        200,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== "0");
    return deleted;
  }

  // Rate limiting helper
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const current = await this.incr(key);

    if (current === 1) {
      await this.expire(key, windowSeconds);
    }

    const ttl = await this.client.ttl(key);

    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      resetIn: ttl > 0 ? ttl : windowSeconds,
    };
  }

  // 두 고정 윈도우(예: 초당/분당)를 동시에 만족해야만 토큰을 소비하는 원자적 레이트 리밋.
  // Lua 스크립트로 처리해 "한 윈도우는 통과했는데 다른 윈도우에서 막혀 카운터만 증가"하는
  // 오버카운트를 방지한다. 두 윈도우가 모두 여유 있을 때만 양쪽을 함께 INCR한다.
  // 반환: allowed=소비 성공 여부, retryAfterMs=막혔다면 가장 빨리 풀리는 윈도우의 잔여 ms.
  private readonly dualWindowScript = `
    local s = tonumber(redis.call('GET', KEYS[1])) or 0
    local l = tonumber(redis.call('GET', KEYS[2])) or 0
    local limitShort = tonumber(ARGV[1])
    local limitLong = tonumber(ARGV[2])
    local winShortMs = tonumber(ARGV[3])
    local winLongMs = tonumber(ARGV[4])
    if s >= limitShort then
      local ttl = redis.call('PTTL', KEYS[1])
      if ttl < 0 then ttl = winShortMs end
      return {0, ttl}
    end
    if l >= limitLong then
      local ttl = redis.call('PTTL', KEYS[2])
      if ttl < 0 then ttl = winLongMs end
      return {0, ttl}
    end
    if redis.call('INCR', KEYS[1]) == 1 then redis.call('PEXPIRE', KEYS[1], winShortMs) end
    if redis.call('INCR', KEYS[2]) == 1 then redis.call('PEXPIRE', KEYS[2], winLongMs) end
    return {1, 0}
  `;

  async consumeDualWindow(
    keyShort: string,
    keyLong: string,
    limitShort: number,
    limitLong: number,
    windowShortSeconds: number,
    windowLongSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    const result = (await this.client.eval(
      this.dualWindowScript,
      2,
      keyShort,
      keyLong,
      String(limitShort),
      String(limitLong),
      String(windowShortSeconds * 1000),
      String(windowLongSeconds * 1000),
    )) as [number, number];

    return { allowed: result[0] === 1, retryAfterMs: result[1] };
  }
}
