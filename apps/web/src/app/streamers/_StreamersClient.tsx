"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radio, Sparkles } from "lucide-react";
import { streamerApi } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/ui";
import {
  LiveStreamerCard,
  OfflineStreamerCard,
} from "@/components/domain/StreamerCard";
import type { StreamerListItem } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { StreamersTour } from "@/components/onboarding/PrimaryPageTours";

export function StreamersClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const { addToast } = useToast();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["streamers"],
    queryFn: streamerApi.list,
    // 라이브 상태는 서버가 1분마다 갱신하므로 화면도 비슷한 주기로 따라간다.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const followMutation = useMutation({
    mutationFn: async (streamer: StreamerListItem) => {
      if (streamer.isFollowing) {
        await streamerApi.unfollow(streamer.userId);
      } else {
        await streamerApi.follow(streamer.userId);
      }
      return streamer;
    },
    onSuccess: (streamer) => {
      queryClient.setQueryData<StreamerListItem[]>(["streamers"], (current) =>
        current?.map((item) =>
          item.userId === streamer.userId
            ? { ...item, isFollowing: !streamer.isFollowing }
            : item,
        ),
      );
      addToast(
        streamer.isFollowing
          ? "방송 시작 알림을 해제했습니다."
          : "방송을 시작하면 알림으로 알려드릴게요.",
        "success",
      );
    },
    onError: () => addToast("알림 설정을 변경하지 못했습니다.", "error"),
  });

  const toggleFollow = (streamer: StreamerListItem) => {
    if (!isAuthenticated) {
      router.push("/auth/login?callbackUrl=/streamers");
      return;
    }
    followMutation.mutate(streamer);
  };

  const streamers = data ?? [];
  const liveStreamers = streamers.filter((streamer) => streamer.live?.isLive);
  const offlineStreamers = streamers.filter(
    (streamer) => !streamer.live?.isLive,
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <StreamersTour />
      <header data-tour="streamers-intro" className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary md:text-3xl">
          스트리머
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          NEXUS와 함께하는 스트리머들입니다. 방송 중이면 위에 올라옵니다.
        </p>
      </header>

      <div data-tour="streamers-list">
      {isLoading && (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      )}

      {isError && (
        <p className="rounded-xl border border-bg-tertiary bg-bg-secondary p-6 text-center text-sm text-text-secondary">
          스트리머 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </p>
      )}

      {!isLoading && !isError && streamers.length === 0 && <EmptyState />}

      {liveStreamers.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
            지금 방송 중
            <span className="text-text-muted">({liveStreamers.length})</span>
          </h2>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {liveStreamers.map((streamer) => (
              <LiveStreamerCard
                key={streamer.userId}
                streamer={streamer}
                onToggleFollow={toggleFollow}
                followPending={
                  followMutation.isPending &&
                  followMutation.variables?.userId === streamer.userId
                }
              />
            ))}
          </div>
        </section>
      )}

      {offlineStreamers.length > 0 && (
        <section>
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            전체 스트리머
            <span className="ml-1.5 text-text-muted">
              ({offlineStreamers.length})
            </span>
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {offlineStreamers.map((streamer) => (
              <OfflineStreamerCard
                key={streamer.userId}
                streamer={streamer}
                onToggleFollow={toggleFollow}
                followPending={
                  followMutation.isPending &&
                  followMutation.variables?.userId === streamer.userId
                }
              />
            ))}
          </div>
        </section>
      )}
      </div>
    </div>
  );
}

/** 등록된 스트리머가 아예 없을 때만 보이는 화면 */
function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-bg-tertiary bg-bg-secondary/60 px-6 py-16 text-center">
      <Radio className="mx-auto h-10 w-10 text-text-muted" />
      <p className="mt-4 font-semibold text-text-primary">
        아직 등록된 스트리머가 없어요
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
        방송하면서 내전을 진행하신다면 NEXUS와 함께해요. 방송 중일 때 이
        페이지와 내전 방 목록에 노출됩니다.
      </p>
      <Link
        href="/partners"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Sparkles className="h-4 w-4" />
        스트리머로 함께하기
      </Link>
    </div>
  );
}
