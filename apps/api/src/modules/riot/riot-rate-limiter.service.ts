import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../redis/redis.service";

/**
 * Riot API 전역 레이트 리미터.
 *
 * 퍼스널/개발 키는 메서드별이 아니라 "앱 전체" 기준으로 한도가 걸린다
 * (기본 20 req/1초, 100 req/2분). account·summoner·league·match 등 모든
 * Riot 호출이 이 단일 예산을 공유해야 하므로, 두 호출 경로(RiotService,
 * RiotMatchService)가 반드시 이 서비스를 거쳐 토큰을 소비한다.
 *
 * 코드의 기존 `RIOT_RATE_LIMITS`(그룹별 캡)는 프로덕션 키 기준이라 실제보다
 * 높다. 이 전역 캡이 실질적 권위를 갖는다.
 */
@Injectable()
export class RiotRateLimiterService {
  private readonly logger = new Logger(RiotRateLimiterService.name);

  private readonly shortMax: number;
  private readonly shortWindowSec: number;
  private readonly longMax: number;
  private readonly longWindowSec: number;

  // 전역 버킷 키 — 모든 인스턴스/호출 경로가 공유
  private readonly keyShort = "riot:global:short";
  private readonly keyLong = "riot:global:long";

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.shortMax = this.getPositiveIntConfig("RIOT_GLOBAL_RATE_SHORT_MAX", 20);
    this.shortWindowSec = this.getPositiveIntConfig(
      "RIOT_GLOBAL_RATE_SHORT_WINDOW_SEC",
      1,
    );
    // 100/2분에서 약간의 안전 마진을 둔다 (윈도우 경계 드리프트·동시 inflight로 인한 429 방지).
    this.longMax = this.getPositiveIntConfig("RIOT_GLOBAL_RATE_LONG_MAX", 95);
    this.longWindowSec = this.getPositiveIntConfig(
      "RIOT_GLOBAL_RATE_LONG_WINDOW_SEC",
      120,
    );

    this.logger.log(
      `Riot global rate limiter: ${this.shortMax}/${this.shortWindowSec}s, ${this.longMax}/${this.longWindowSec}s`,
    );
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

  /**
   * 전역 예산에서 토큰 1개를 원자적으로 소비 시도(대기 없음).
   * @returns allowed=성공 여부, retryAfterMs=막혔다면 가장 빨리 풀리는 잔여 ms
   */
  async tryConsume(): Promise<{ allowed: boolean; retryAfterMs: number }> {
    return this.redis.consumeDualWindow(
      this.keyShort,
      this.keyLong,
      this.shortMax,
      this.longMax,
      this.shortWindowSec,
      this.longWindowSec,
    );
  }

  /**
   * 인터랙티브 조회용 — 최대 maxWaitMs 동안만 예산을 기다리고,
   * 그 안에 못 얻으면 429를 throw 한다. (검색자가 오래 안 기다리게)
   */
  async acquireInteractive(maxWaitMs = 1500): Promise<void> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const { allowed, retryAfterMs } = await this.tryConsume();
      if (allowed) return;

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new HttpException(
          "Riot API 전역 레이트 한도 초과. 잠시 후 다시 시도해주세요.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.sleep(Math.min(retryAfterMs || 100, remaining, 250));
    }
  }

  /**
   * 매치 fetch 등 큐잉 가능한 호출용 — 예산이 생길 때까지 대기.
   * 단, 폭주 시 영구 대기를 막기 위해 maxWaitMs 상한을 둔다(초과 시 false 반환).
   */
  async acquireWaiting(maxWaitMs = 60_000): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      const { allowed, retryAfterMs } = await this.tryConsume();
      if (allowed) return true;

      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await this.sleep(Math.min(retryAfterMs || 200, remaining, 1000));
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
  }
}
