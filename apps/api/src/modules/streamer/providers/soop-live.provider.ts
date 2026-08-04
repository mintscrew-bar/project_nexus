import { Injectable, Logger } from "@nestjs/common";
import { StreamerPlatform } from "@nexus/database";
import axios from "axios";
import {
  ChannelIdentity,
  LiveProvider,
  LiveSnapshot,
} from "./live-provider.interface";

/**
 * ⚠️ 비공식 API 격리 지점 (숲/SOOP)
 *
 * SOOP 오픈 API는 키 발급이 필요하고 방송 상태 조회를 제공하지 않아,
 * 플레이어가 사용하는 비공식 엔드포인트로 라이브 여부를 판단한다.
 * 치지직 provider와 같은 원칙 — 실패는 전부 null로 흡수하고,
 * 막히면 이 파일만 교체한다.
 *
 * 2026-08-04 기준 응답 형태를 실제 호출로 확인하고 작성했다.
 * (CHANNEL.RESULT: 1=방송 중, 0=오프라인 / BNO=방송번호 → 썸네일 키)
 */
@Injectable()
export class SoopLiveProvider implements LiveProvider {
  readonly platform = StreamerPlatform.SOOP;

  private readonly logger = new Logger(SoopLiveProvider.name);
  private readonly liveApiUrl =
    "https://live.sooplive.co.kr/afreeca/player_live_api.php";
  private readonly timeout = 4000;

  // SOOP 스트리머 ID는 영문 소문자·숫자·언더스코어 조합이다.
  private readonly channelIdPattern = /^[a-z0-9_]{3,20}$/;

  parseChannelId(channelUrl: string): string | null {
    const raw = channelUrl.trim().toLowerCase();

    if (this.channelIdPattern.test(raw)) return raw;

    try {
      const url = new URL(raw);
      // ch.sooplive.co.kr/{id}, play.sooplive.co.kr/{id}/... 및 구 afreecatv 도메인
      if (
        !url.hostname.endsWith("sooplive.co.kr") &&
        !url.hostname.endsWith("afreecatv.com")
      ) {
        return null;
      }

      const candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return this.channelIdPattern.test(candidate) ? candidate : null;
    } catch {
      return null;
    }
  }

  /**
   * SOOP은 방송 중이 아니면 닉네임조차 돌려주지 않는다.
   * 그래서 오프라인 채널은 식별자만 확인된 상태로 둔다.
   */
  async fetchIdentity(channelId: string): Promise<ChannelIdentity | null> {
    const channel = await this.fetchChannel(channelId);
    if (!channel) return null;

    return {
      channelId,
      channelName: channel.BJNICK ?? null,
      channelImageUrl: null,
      followerCount: null,
      description: null,
    };
  }

  async fetchLiveSnapshot(channelId: string): Promise<LiveSnapshot | null> {
    const channel = await this.fetchChannel(channelId);
    if (!channel) return null;

    if (Number(channel.RESULT) !== 1) return { isLive: false };

    return {
      isLive: true,
      title: channel.TITLE ?? null,
      // 이 경로로는 시청자 수가 오지 않는다. 카드에서 숨김 처리된다.
      viewerCount: channel.VIEWER != null ? Number(channel.VIEWER) : null,
      thumbnailUrl: channel.BNO
        ? `https://liveimg.sooplive.com/m/${channel.BNO}`
        : null,
      categoryName: null,
      startedAt: null,
    };
  }

  private async fetchChannel(channelId: string): Promise<{
    RESULT?: number | string;
    BNO?: string;
    BJID?: string;
    BJNICK?: string;
    TITLE?: string;
    VIEWER?: number | string | null;
  } | null> {
    try {
      const body = new URLSearchParams({
        bid: channelId,
        type: "live",
        player_type: "html",
      });

      const response = await axios.post<{
        CHANNEL?: {
          RESULT?: number | string;
          BNO?: string;
          BJID?: string;
          BJNICK?: string;
          TITLE?: string;
          VIEWER?: number | string | null;
        };
      }>(this.liveApiUrl, body.toString(), {
        timeout: this.timeout,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (compatible; NexusBot/1.0)",
        },
      });

      return response.data?.CHANNEL ?? null;
    } catch (error) {
      const err = error as Error;
      this.logger.warn(`숲 조회 실패 ${channelId}: ${err?.message}`);
      return null;
    }
  }
}
