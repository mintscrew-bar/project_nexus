import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { StreamerService } from "../streamer/streamer.service";

/**
 * 스트리머 라이브 상태 · 채널 정보 폴링.
 *
 * 대상이 "검증된 스트리머"로 제한되어 있어 현재 규모에서는 전수 갱신으로 충분하다.
 * 조회 실패는 서비스 쪽에서 흡수하므로 여기서는 로깅만 한다.
 */
@Injectable()
export class StreamerTasksService {
  private readonly logger = new Logger(StreamerTasksService.name);

  constructor(private readonly streamerService: StreamerService) {}

  /** 1분마다 갱신 — 캐시 TTL(90초)보다 짧아 뱃지가 끊기지 않는다. */
  @Cron("* * * * *")
  async handleLiveRefresh(): Promise<void> {
    try {
      await this.streamerService.refreshAllLiveStates();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `스트리머 라이브 갱신 실패: ${err?.message ?? String(error)}`,
        err?.stack,
      );
    }
  }

  /**
   * 채널명·프로필 이미지·팔로워 수는 자주 안 바뀌므로 하루 1회만 갱신한다.
   * (매분 갱신하면 라이브 조회와 별개로 API 호출이 두 배가 된다)
   */
  @Cron("30 4 * * *")
  async handleChannelIdentityRefresh(): Promise<void> {
    try {
      await this.streamerService.refreshChannelIdentities();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `스트리머 채널 정보 갱신 실패: ${err?.message ?? String(error)}`,
        err?.stack,
      );
    }
  }
}
