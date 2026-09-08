import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../redis/redis.service";

/**
 * PUBG API 전역 레이트 리미터.
 *
 * 무료 키는 앱 전체 기준 10 req/분이다(상향 신청 가능). 닉네임 조회·매치 상세 등
 * 모든 PUBG 호출이 이 단일 예산을 공유해야 하므로 호출 경로는 반드시 여기를 거친다.
 *
 * 롤(`RiotRateLimiterService`)과 같은 구조지만 예산은 완전히 별개다.
 * 한쪽이 예산을 다 써도 다른 쪽 조회는 막히지 않아야 한다.
 */
@Injectable()
export class PubgRateLimiterService {
  private readonly logger = new Logger(PubgRateLimiterService.name);

  private readonly max: number;
  private readonly windowSec: number;

  // 전역 버킷 키 — 모든 인스턴스/호출 경로가 공유한다.
  // 짧은 창은 쓰지 않지만 원자적 소비 스크립트를 재사용하려고 같은 키를 두 번 넘긴다.
  private readonly key = "pubg:global:minute";

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    // 10/분에서 안전 마진 1을 뺀다. 윈도우 경계가 어긋나면 그대로 429가 난다.
    this.max = this.getPositiveIntConfig("PUBG_GLOBAL_RATE_MAX", 9);
    this.windowSec = this.getPositiveIntConfig(
      "PUBG_GLOBAL_RATE_WINDOW_SEC",
      60,
    );
    this.logger.log(`PUBG global rate limiter: ${this.max}/${this.windowSec}s`);
  }

  private getPositiveIntConfig(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.logger.warn(`Invalid config ${key}=${raw}, fallback=${fallback}`);
      return fallback;
    }
    return Math.floor(parsed);
  }

  /** 전역 예산에서 토큰 1개를 원자적으로 소비 시도(대기 없음). */
  async tryConsume(): Promise<{ allowed: boolean; retryAfterMs: number }> {
    // 창이 하나뿐이라 같은 키·같은 한도를 양쪽에 넘긴다.
    return this.redis.consumeDualWindow(
      this.key,
      this.key,
      this.max,
      this.max,
      this.windowSec,
      this.windowSec,
    );
  }

  /**
   * 사용자가 기다리는 조회용 — maxWaitMs 안에 예산을 못 얻으면 429.
   *
   * 10/분은 롤(100/2분)보다 훨씬 빠듯해서, 예산이 비면 최대 6초를 기다려야
   * 다음 토큰이 나온다. 그 앞에서 사용자를 붙잡아 두지 않는다.
   */
  async acquireInteractive(maxWaitMs = 2000): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const { allowed, retryAfterMs } = await this.tryConsume();
      if (allowed) return;

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new HttpException(
          "PUBG API 조회가 잠시 밀려 있습니다. 잠시 후 다시 시도해주세요.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.sleep(Math.min(retryAfterMs || 200, remaining, 300));
    }
  }

  /** 백그라운드 수집용 — 예산이 생길 때까지 대기하되 상한을 둔다. */
  async acquireWaiting(maxWaitMs = 90_000): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const { allowed, retryAfterMs } = await this.tryConsume();
      if (allowed) return true;

      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await this.sleep(Math.min(retryAfterMs || 500, remaining, 2000));
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }
}
