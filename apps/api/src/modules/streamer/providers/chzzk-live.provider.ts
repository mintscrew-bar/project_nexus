import { Injectable, Logger } from "@nestjs/common";
import { StreamerPlatform } from "@nexus/database";
import axios from "axios";
import {
  ChannelIdentity,
  isDomainOrSubdomain,
  LiveProvider,
  LiveSnapshot,
} from "./live-provider.interface";

/**
 * ⚠️ 비공식 API 격리 지점 (치지직)
 *
 * 치지직 공식 오픈 API에는 "특정 채널이 지금 방송 중인가"를 묻는 엔드포인트가 없다.
 * (공식 Live API는 전체 라이브 목록 20개씩 페이징만 제공하고,
 *  공식 Channel API 응답에는 방송 여부가 들어있지 않다)
 *
 * 그래서 라이브 감지에 한해 웹 클라이언트가 쓰는 비공식 엔드포인트를 사용한다.
 * 이 파일 밖으로는 비공식 의존이 새어나가지 않으므로, 엔드포인트가 막히면
 * 이 파일만 교체하면 된다. 조회 실패는 전부 null로 흡수해서
 * 라이브 뱃지만 사라지고 스트리머 목록은 그대로 동작하게 한다.
 *
 * 2026-08-04 기준 응답 형태를 실제 호출로 확인하고 작성했다.
 */
@Injectable()
export class ChzzkLiveProvider implements LiveProvider {
  readonly platform = StreamerPlatform.CHZZK;

  private readonly logger = new Logger(ChzzkLiveProvider.name);
  private readonly baseUrl = "https://api.chzzk.naver.com";
  private readonly timeout = 4000;

  // 치지직 채널 ID는 32자리 소문자 16진수다.
  private readonly channelIdPattern = /^[0-9a-f]{32}$/;

  parseChannelId(channelUrl: string): string | null {
    const raw = channelUrl.trim();

    // 채널 ID를 그대로 붙여넣은 경우도 허용한다.
    if (this.channelIdPattern.test(raw)) return raw;

    try {
      const url = new URL(raw);
      if (!isDomainOrSubdomain(url.hostname, "chzzk.naver.com")) return null;

      // /{channelId} 또는 /live/{channelId} 두 형태를 모두 받는다.
      const segments = url.pathname.split("/").filter(Boolean);
      const candidate = segments[segments.length - 1] ?? "";
      return this.channelIdPattern.test(candidate) ? candidate : null;
    } catch {
      return null;
    }
  }

  async fetchIdentity(channelId: string): Promise<ChannelIdentity | null> {
    const content = await this.get<{
      channelId?: string;
      channelName?: string;
      channelImageUrl?: string;
      followerCount?: number;
      channelDescription?: string;
    }>(`/service/v1/channels/${channelId}`);

    if (!content?.channelId) return null;

    return {
      channelId: content.channelId,
      channelName: content.channelName ?? null,
      channelImageUrl: content.channelImageUrl ?? null,
      followerCount: content.followerCount ?? null,
      description: content.channelDescription ?? null,
    };
  }

  async fetchLiveSnapshot(channelId: string): Promise<LiveSnapshot | null> {
    const content = await this.get<{
      status?: string;
      liveTitle?: string;
      concurrentUserCount?: number;
      liveImageUrl?: string;
      defaultThumbnailImageUrl?: string;
      liveCategoryValue?: string;
      openDate?: string;
    }>(`/service/v3/channels/${channelId}/live-detail`);

    if (!content) return null;

    const isLive = content.status === "OPEN";
    if (!isLive) return { isLive: false };

    return {
      isLive: true,
      title: content.liveTitle ?? null,
      viewerCount: content.concurrentUserCount ?? null,
      thumbnailUrl: this.resolveThumbnail(content),
      categoryName: content.liveCategoryValue ?? null,
      startedAt: this.parseOpenDate(content.openDate),
    };
  }

  /**
   * 라이브 썸네일 URL은 `image_{type}.jpg` 형태로 오며 {type}에 해상도를 넣어야 한다.
   * 목록 카드용이라 480으로 고정한다.
   */
  private resolveThumbnail(content: {
    liveImageUrl?: string;
    defaultThumbnailImageUrl?: string;
  }): string | null {
    const template = content.liveImageUrl ?? content.defaultThumbnailImageUrl;
    if (!template) return null;
    return template.replace("{type}", "480");
  }

  /** "2026-08-04 11:20:34" (KST) 형태를 Date로 변환한다. */
  private parseOpenDate(openDate?: string): Date | null {
    if (!openDate) return null;
    const parsed = new Date(openDate.replace(" ", "T") + "+09:00");
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async get<T>(path: string): Promise<T | null> {
    try {
      const response = await axios.get<{ code?: number; content?: T }>(
        `${this.baseUrl}${path}`,
        {
          timeout: this.timeout,
          // UA가 없으면 차단되는 경우가 있어 브라우저 UA를 붙인다.
          headers: { "User-Agent": "Mozilla/5.0 (compatible; NexusBot/1.0)" },
        },
      );
      return response.data?.content ?? null;
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`치지직 조회 실패 ${path}: ${err?.message}`);
      return null;
    }
  }
}
