"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Eye, Radio, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamerListItem } from "@/lib/api-client";

const PLATFORM_LABELS: Record<string, string> = {
  CHZZK: "치지직",
  SOOP: "숲",
  YOUTUBE: "유튜브",
};

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
export function LiveStreamerCard({ streamer }: { streamer: StreamerListItem }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const live = streamer.live;
  const thumbnail = live?.thumbnailUrl;

  return (
    <div className="group overflow-hidden rounded-2xl border border-bg-tertiary bg-bg-secondary transition-colors hover:border-accent-primary/40">
      <a
        href={streamer.channelUrl}
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
              onError={() => setThumbnailFailed(true)}
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
          <StreamerAvatar streamer={streamer} size={40} />

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-text-primary">
              {live?.title || streamer.channelName || streamer.username}
            </p>
            <p className="mt-0.5 truncate text-sm text-text-secondary">
              {streamer.channelName ?? streamer.username}
            </p>
            <p className="mt-1 truncate text-xs text-text-muted">
              {PLATFORM_LABELS[streamer.platform] ?? streamer.platform}
              {live?.categoryName ? ` · ${live.categoryName}` : ""}
            </p>
          </div>
        </div>
      </a>

      {/* 내전 방을 열어둔 경우 — 치지직에서는 볼 수 없는 정보라 이 탭의 핵심이다 */}
      {streamer.activeRoom && (
        <Link
          href={`/tournaments/${streamer.activeRoom.id}`}
          className="flex items-center gap-2 border-t border-bg-tertiary bg-accent-primary/10 px-4 py-3 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/20"
        >
          <Swords className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">{streamer.activeRoom.name}</span>
          <span className="ml-auto flex-shrink-0 text-xs">참가하기 →</span>
        </Link>
      )}
    </div>
  );
}

/** 오프라인 스트리머 카드 — 목록이 비어 보이지 않게 하는 역할 */
export function OfflineStreamerCard({
  streamer,
}: {
  streamer: StreamerListItem;
}) {
  return (
    <a
      href={streamer.channelUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-bg-tertiary bg-bg-secondary p-3 transition-colors hover:border-bg-elevated hover:bg-bg-tertiary/60"
    >
      <StreamerAvatar streamer={streamer} size={44} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-text-primary">
          {streamer.channelName ?? streamer.username}
        </p>
        <p className="truncate text-xs text-text-muted">
          {PLATFORM_LABELS[streamer.platform] ?? streamer.platform} ·{" "}
          {formatLastLive(streamer.lastLiveAt)}
        </p>
      </div>
    </a>
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
