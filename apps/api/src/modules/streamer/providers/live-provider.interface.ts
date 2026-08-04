import { StreamerPlatform } from "@nexus/database";

/**
 * 플랫폼별 라이브 조회 결과를 플랫폼과 무관한 형태로 정규화한 값.
 * 필드 대부분이 optional인 이유는 플랫폼마다 주는 정보가 다르기 때문이다.
 * (예: SOOP은 시청자 수를 이 경로로 주지 않는다)
 */
export interface LiveSnapshot {
  isLive: boolean;
  title?: string | null;
  viewerCount?: number | null;
  thumbnailUrl?: string | null;
  categoryName?: string | null;
  startedAt?: Date | null;
}

/** 채널 소유권 검증·표시에 쓰는 채널 기본 정보 */
export interface ChannelIdentity {
  channelId: string;
  channelName?: string | null;
  channelImageUrl?: string | null;
  followerCount?: number | null;
  /** 코드 대조 방식 검증에 사용하는 채널 소개글 */
  description?: string | null;
}

/**
 * 플랫폼 어댑터.
 *
 * 조회 실패(네트워크 오류·응답 형식 변경·엔드포인트 폐쇄)는 예외를 던지지 말고
 * null을 반환한다. 상위 계층은 null을 "라이브 여부 모름"으로 처리해서
 * 뱃지만 감추고 스트리머 목록 자체는 계속 보여준다.
 */
export interface LiveProvider {
  readonly platform: StreamerPlatform;

  /** 채널 URL에서 플랫폼 채널 식별자를 뽑는다. 형식이 안 맞으면 null. */
  parseChannelId(channelUrl: string): string | null;

  /** 채널 기본 정보 조회. 실패 시 null. */
  fetchIdentity(channelId: string): Promise<ChannelIdentity | null>;

  /** 라이브 상태 조회. 실패 시 null(= 모름). */
  fetchLiveSnapshot(channelId: string): Promise<LiveSnapshot | null>;
}
