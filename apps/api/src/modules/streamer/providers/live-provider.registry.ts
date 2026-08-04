import { Injectable } from "@nestjs/common";
import { StreamerPlatform } from "@nexus/database";
import { ChzzkLiveProvider } from "./chzzk-live.provider";
import { SoopLiveProvider } from "./soop-live.provider";
import { LiveProvider } from "./live-provider.interface";

/**
 * 플랫폼 → 어댑터 매핑.
 *
 * YOUTUBE는 Data API 쿼터 비용이 커서 1차 범위에서 제외했다.
 * 지원하지 않는 플랫폼은 null을 돌려주고, 상위에서 라이브 조회를 건너뛴다.
 */
@Injectable()
export class LiveProviderRegistry {
  private readonly providers: Partial<Record<StreamerPlatform, LiveProvider>>;

  constructor(chzzk: ChzzkLiveProvider, soop: SoopLiveProvider) {
    this.providers = {
      [StreamerPlatform.CHZZK]: chzzk,
      [StreamerPlatform.SOOP]: soop,
    };
  }

  get(platform: StreamerPlatform): LiveProvider | null {
    return this.providers[platform] ?? null;
  }

  /** 라이브 감지를 지원하는 플랫폼 목록 */
  supportedPlatforms(): StreamerPlatform[] {
    return Object.keys(this.providers) as StreamerPlatform[];
  }
}
