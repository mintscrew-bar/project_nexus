"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Eye, Radio, Swords } from "lucide-react";
import { streamerApi, type StreamerListItem } from "@/lib/api-client";

const PLATFORM_LABELS: Record<string, string> = {
  CHZZK: "치지직",
  SOOP: "숲",
  YOUTUBE: "유튜브",
};

/** 썸네일이 방송 내내 같은 URL이라 폴링 시각을 붙여 갱신되게 한다. */
function withCacheBuster(url: string, checkedAt: string): string {
  const stamp = new Date(checkedAt).getTime();
  if (Number.isNaN(stamp)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${stamp}`;
}

/**
 * 메인 홈의 "지금 방송 중" 섹션.
 *
 * 방송 중인 스트리머가 하나도 없으면 섹션째 렌더하지 않는다.
 * 스트리머가 적은 초기에 빈 영역이 자리만 차지하는 걸 막으려는 의도.
 */
export function LiveStreamersSection({
  className = "",
}: {
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["streamers", "live"],
    queryFn: streamerApi.list,
    refetchInterval: 60_000,
    staleTime: 30_000,
    // 실패해도 홈 다른 영역에 영향을 주지 않게 조용히 넘어간다.
    retry: 1,
  });

  const liveStreamers = (data ?? []).filter(
    (streamer) => streamer.live?.isLive,
  );

  if (liveStreamers.length === 0) return null;

  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text-primary">
          <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
          지금 방송 중
          <span className="text-text-muted">({liveStreamers.length})</span>
        </h2>

        <Link
          href="/streamers"
          className="flex items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-accent-primary"
        >
          전체 보기
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {liveStreamers.slice(0, 3).map((streamer) => (
          <LiveStreamerTile
            key={`${streamer.userId}-${streamer.platform}`}
            streamer={streamer}
          />
        ))}
      </div>
    </section>
  );
}

function LiveStreamerTile({ streamer }: { streamer: StreamerListItem }) {
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const live = streamer.live;

  const thumbnail =
    live?.thumbnailUrl && live.checkedAt
      ? withCacheBuster(live.thumbnailUrl, live.checkedAt)
      : live?.thumbnailUrl;
  const thumbnailFailed = !!thumbnail && failedThumbnail === thumbnail;

  return (
    <div className="group overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-secondary transition-colors hover:border-accent-primary/40">
      <a href={streamer.channelUrl} target="_blank" rel="noopener noreferrer">
        <div className="relative aspect-video w-full overflow-hidden bg-bg-tertiary">
          {thumbnail && !thumbnailFailed ? (
            <Image
              src={thumbnail}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              onError={() => thumbnail && setFailedThumbnail(thumbnail)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-text-muted">
              <Radio className="h-7 w-7" />
            </div>
          )}

          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
            <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
            LIVE
          </span>

          {typeof live?.viewerCount === "number" && (
            <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
              <Eye className="h-2.5 w-2.5" />
              {live.viewerCount.toLocaleString()}
            </span>
          )}
        </div>

        <div className="p-3">
          <p className="truncate text-sm font-semibold text-text-primary">
            {live?.title || streamer.channelName || streamer.username}
          </p>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {streamer.channelName ?? streamer.username} ·{" "}
            {PLATFORM_LABELS[streamer.platform] ?? streamer.platform}
          </p>
        </div>
      </a>

      {streamer.activeRoom && (
        <Link
          href={`/tournaments/${streamer.activeRoom.id}`}
          className="flex items-center gap-1.5 border-t border-white/[0.06] bg-accent-primary/10 px-3 py-2 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/20"
        >
          <Swords className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{streamer.activeRoom.name}</span>
          <span className="ml-auto flex-shrink-0">참가 →</span>
        </Link>
      )}
    </div>
  );
}
