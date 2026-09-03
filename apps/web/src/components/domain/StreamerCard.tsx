"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Bell, BellOff, Eye, Radio, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamerChannelItem, StreamerListItem } from "@/lib/api-client";
import { StreamerPlatformBadge } from "@/components/domain/StreamerPlatformBadge";

const PLATFORM_LABELS: Record<string, string> = {
  CHZZK: "치지직",
  SOOP: "SOOP",
  YOUTUBE: "유튜브",
};

/**
 * 썸네일 URL은 방송 내내 고정이라 그냥 쓰면 브라우저가 첫 프레임을 캐시해
 * 화면이 멈춘 것처럼 보인다. 폴링 시각을 붙여 갱신될 때마다 새로 받게 한다.
 */
function withCacheBuster(url: string, checkedAt: string): string {
  const stamp = new Date(checkedAt).getTime();
  if (Number.isNaN(stamp)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${stamp}`;
}

/** 마지막 방송 시각을 "3일 전 방송" 형태로 표현한다. */
function formatLastLive(lastLiveAt: string | null): string {
  if (!lastLiveAt) return "방송 기록 없음";

  const diff = Date.now() - new Date(lastLiveAt).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return "방금 전 방송";
  if (hours < 24) return `${hours}시간 전 방송`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전 방송`;
  return `${Math.floor(days / 30)}개월 전 방송`;
}

/**
 * 방송 중인 스트리머 카드 — 썸네일 미리보기를 크게 보여준다.
 * 카드를 누르면 NEXUS에 붙잡아두지 않고 스트리머의 방송으로 보낸다.
 * (임베드로 여기서 시청하게 하면 플랫폼 시청자 수에 안 잡혀 홍보에 손해)
 */
interface StreamerCardProps {
  streamer: StreamerListItem;
  onToggleFollow?: (streamer: StreamerListItem) => void;
  followPending?: boolean;
}

export function LiveStreamerCard({
  streamer,
  onToggleFollow,
  followPending,
}: StreamerCardProps) {
  // 실패한 URL 자체를 기억한다. 폴링으로 URL이 바뀌면 자연히 다시 시도하게 된다.
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const channels = getStreamerChannels(streamer);
  const liveChannels = channels.filter((channel) => channel.live?.isLive);
  const [selectedPlatform, setSelectedPlatform] = useState(streamer.platform);
  const selectedChannel =
    liveChannels.find((channel) => channel.platform === selectedPlatform) ??
    liveChannels[0] ??
    channels[0];
  const live = selectedChannel.live;
  const displayStreamer = { ...streamer, ...selectedChannel };
  const thumbnail =
    live?.thumbnailUrl && live.checkedAt
      ? withCacheBuster(live.thumbnailUrl, live.checkedAt)
      : live?.thumbnailUrl;
  const thumbnailFailed = !!thumbnail && failedThumbnail === thumbnail;

  return (
    <div className="group overflow-hidden rounded-2xl border border-bg-tertiary bg-bg-secondary transition-colors hover:border-accent-primary/40">
      <a
        href={selectedChannel.channelUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {/* 썸네일 미리보기 */}
        <div className="relative aspect-video w-full overflow-hidden bg-bg-tertiary">
          {thumbnail && !thumbnailFailed ? (
            <Image
              src={thumbnail}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 420px"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              onError={() => thumbnail && setFailedThumbnail(thumbnail)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-text-muted">
              <Radio className="h-8 w-8" />
            </div>
          )}

          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>

          {typeof live?.viewerCount === "number" && (
            <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-xs font-medium text-white">
              <Eye className="h-3 w-3" />
              {live.viewerCount.toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex gap-3 p-4">
          <StreamerAvatar streamer={displayStreamer} size={40} />

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-text-primary">
              {streamer.username}
            </p>
            <p className="mt-0.5 truncate text-sm text-text-secondary">
              {live?.title || selectedChannel.channelName || streamer.username}
            </p>
            <p className="mt-1 truncate text-xs text-text-muted">
              {PLATFORM_LABELS[selectedChannel.platform] ??
                selectedChannel.platform}
              {live?.categoryName ? ` · ${live.categoryName}` : ""}
            </p>
          </div>
        </div>
      </a>

      {liveChannels.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-t border-bg-tertiary px-4 py-2">
          {liveChannels.map((channel) => (
            <button
              key={channel.platform}
              type="button"
              onClick={() => setSelectedPlatform(channel.platform)}
              title={`${PLATFORM_LABELS[channel.platform] ?? channel.platform} 미리보기`}
              className={cn(
                "rounded-md transition-opacity hover:opacity-80",
                channel.platform === selectedChannel.platform
                  ? "ring-2 ring-accent-primary ring-offset-1 ring-offset-bg-secondary"
                  : "opacity-60",
              )}
            >
              <StreamerPlatformBadge platform={channel.platform} />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-bg-tertiary px-4 py-3">
        {streamer.activeRoom && (
          <Link
            href={`/lol/tournaments/${streamer.activeRoom.id}`}
            className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-accent-primary"
          >
            <Swords className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{streamer.activeRoom.name}</span>
            <span className="ml-auto flex-shrink-0 text-xs">참가하기 →</span>
          </Link>
        )}
        {!streamer.activeRoom && (
          <span className="flex-1 text-xs text-text-muted">방송 시작 알림</span>
        )}
        {onToggleFollow && (
          <FollowButton
            streamer={streamer}
            pending={followPending}
            onClick={() => onToggleFollow(streamer)}
          />
        )}
      </div>
    </div>
  );
}

/** 오프라인 스트리머 카드 — 목록이 비어 보이지 않게 하는 역할 */
export function OfflineStreamerCard({
  streamer,
  onToggleFollow,
  followPending,
}: StreamerCardProps) {
  const channels = getStreamerChannels(streamer);

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-bg-tertiary bg-bg-secondary p-3 transition-colors hover:border-bg-elevated hover:bg-bg-tertiary/60">
      <a
        href={streamer.channelUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <StreamerAvatar streamer={streamer} size={44} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-text-primary">
            {streamer.username}
          </p>
          <p className="truncate text-xs text-text-muted">
            {formatLastLive(streamer.lastLiveAt)}
          </p>
        </div>
      </a>
      <div className="flex min-w-0 flex-wrap justify-end gap-1">
        {channels.map((channel) => (
          <a
            key={channel.platform}
            href={channel.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={channel.channelName ?? channel.platform}
            className="rounded-md transition-opacity hover:opacity-80"
          >
            <StreamerPlatformBadge platform={channel.platform} />
          </a>
        ))}
      </div>
      {onToggleFollow && (
        <FollowButton
          streamer={streamer}
          pending={followPending}
          onClick={() => onToggleFollow(streamer)}
        />
      )}
    </div>
  );
}

function getStreamerChannels(
  streamer: StreamerListItem,
): StreamerChannelItem[] {
  return streamer.channels?.length ? streamer.channels : [streamer];
}

function FollowButton({
  streamer,
  pending,
  onClick,
}: {
  streamer: StreamerListItem;
  pending?: boolean;
  onClick: () => void;
}) {
  const Icon = streamer.isFollowing ? BellOff : Bell;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      aria-label={streamer.isFollowing ? "방송 알림 끄기" : "방송 알림 받기"}
      title={streamer.isFollowing ? "방송 알림 끄기" : "방송 알림 받기"}
      className={cn(
        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
        streamer.isFollowing
          ? "border-accent-primary/40 bg-accent-primary/15 text-accent-primary"
          : "border-bg-elevated text-text-muted hover:border-accent-primary/40 hover:text-accent-primary",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function StreamerAvatar({
  streamer,
  size,
}: {
  streamer: StreamerListItem;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = streamer.channelImageUrl ?? streamer.avatar;

  return (
    <div
      className={cn(
        "relative flex-shrink-0 overflow-hidden rounded-full bg-bg-tertiary",
      )}
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        <Image
          src={src}
          alt=""
          fill
          unoptimized
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-full items-center justify-center text-sm font-bold text-text-muted">
          {(streamer.channelName ?? streamer.username).charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
