"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crown,
  ExternalLink,
  Eye,
  Megaphone,
  Pencil,
  Pin,
  Radio,
  ThumbsUp,
  Trash2,
  Trophy,
  User,
} from "lucide-react";
import {
  streamerApi,
  userApi,
  type StreamerPageData,
  type StreamerPageMatch,
  type StreamerPageSession,
} from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { commendationTagLabel } from "@/lib/commendation";
import { userProfilePath } from "@/lib/profile-routes";
import { roomPath } from "@/lib/room-links";
import { getChampionIcon } from "@/components/matches/match-utils";
import { InternalMatchExpand } from "@/components/matches/internal-match/InternalMatchExpand";
import { StreamerPlatformBadge } from "@/components/domain/StreamerPlatformBadge";
import { UserAvatarDecoration } from "@/components/cosmetics/UserAvatarDecoration";
import { UserName } from "@/components/cosmetics/UserName";
import {
  LiveBanner,
  liveBannerAspect,
  type LiveBannerSource,
} from "@/components/cosmetics/live-banner";
import {
  findCosmetic,
  useCosmeticCatalog,
} from "@/components/cosmetics/catalog";
import { useCosmeticLoadouts } from "@/components/cosmetics/useCosmeticLoadouts";
import { getChampionKoreanName } from "@nexus/types";
import { StreamerPageEditor } from "./_StreamerPageEditor";

/*
 * 스트리머 페이지 (/streamers/:id) — 유저 프로필과 같은 틀.
 *   머리 카드(배너·아바타·이름·한마디·채널·버튼)
 *   → 위 두 칸(방송 내전 통계 · 칭찬 모음)
 *   → 왼쪽 방송 내전 기록(회차별/달력) · 오른쪽 공지사항·방송 일정·시청자 리그
 * 배너는 방송 중이면 방송 미리보기, 아니면 프로필 배경. 칸 크기가 같아 바뀌어도
 * 아래 내용이 밀리지 않는다. 방송 중 표시는 아바타 테두리(빨강) + LIVE 글자.
 */

/** 유저 프로필과 같은 강조색 */
const ACCENT = "#667EEA";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 썸네일 URL 은 방송 내내 같아서 폴링 시각을 붙여 새로 받게 한다(StreamerCard 와 같다) */
function withCacheBuster(url: string, checkedAt: string): string {
  const stamp = new Date(checkedAt).getTime();
  if (Number.isNaN(stamp)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${stamp}`;
}

/** "2026-11-25" → "11/25 (화)" */
function sessionLabel(date: string): string {
  const d = new Date(`${date}T12:00:00+09:00`);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

function durationLabel(sec: number | null): string | null {
  if (!sec) return null;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

const TEAM_MODE_KO: Record<string, string> = {
  AUCTION: "경매",
  SNAKE_DRAFT: "스네이크",
  AUTO_BALANCE: "자동 밸런스",
  MANUAL_TEAM: "자유 팀",
};

export function StreamerPageClient({ streamerId }: { streamerId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const [editOpen, setEditOpen] = useState(false);

  const pageQuery = useQuery<StreamerPageData>({
    queryKey: ["streamer-page", streamerId],
    queryFn: () => streamerApi.getPage(streamerId),
    // 라이브 상태는 서버가 1분마다 갱신한다
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  // 배너(프로필 배경 이미지)는 유저 프로필과 같은 조회를 쓴다
  const profileQuery = useQuery({
    queryKey: ["user-profile", streamerId],
    queryFn: () => userApi.getProfile(streamerId),
  });
  useCosmeticCatalog();
  const loadouts = useCosmeticLoadouts([streamerId]);
  const bannerFx = findCosmetic(
    loadouts[streamerId]?.PROFILE_BANNER,
  )?.liveBanner;

  const followMutation = useMutation({
    mutationFn: async (following: boolean) => {
      if (following) await streamerApi.unfollow(streamerId);
      else await streamerApi.follow(streamerId);
      return following;
    },
    onSuccess: (wasFollowing) => {
      void queryClient.invalidateQueries({ queryKey: ["streamer-page"] });
      void queryClient.invalidateQueries({ queryKey: ["streamers"] });
      addToast(
        wasFollowing
          ? "방송 시작 알림을 해제했습니다."
          : "방송을 시작하면 알림으로 알려드릴게요.",
        "success",
      );
    },
    onError: () => addToast("알림 설정을 변경하지 못했습니다.", "error"),
  });

  const data = pageQuery.data;
  if (pageQuery.isLoading) {
    return (
      <div className="flex flex-grow items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-grow items-center justify-center py-24 text-center">
        <div>
          <User className="mx-auto mb-4 h-16 w-16 text-text-tertiary" />
          <h2 className="mb-2 text-xl font-bold text-text-primary">
            스트리머를 찾을 수 없어요
          </h2>
          <Link
            href="/streamers"
            className="text-sm text-accent-primary hover:underline"
          >
            스트리머 목록으로
          </Link>
        </div>
      </div>
    );
  }

  const { streamer } = data;
  const channels = streamer.channels?.length ? streamer.channels : [streamer];
  const liveChannel = channels.find((c) => c.live?.isLive) ?? null;
  const primary = liveChannel ?? channels[0];
  const profile = profileQuery.data as
    { profileBanner?: string | null; avatar?: string | null } | undefined;

  const toggleFollow = () => {
    if (!isAuthenticated) {
      router.push(
        `/auth/login?redirect=${encodeURIComponent(`/streamers/${streamerId}`)}`,
      );
      return;
    }
    followMutation.mutate(streamer.isFollowing);
  };

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto max-w-[1480px]">
        {/* ── 머리 카드 (유저 프로필과 같은 틀) ── */}
        <Card className="mb-4 overflow-hidden rounded-lg border-bg-tertiary bg-bg-secondary p-0 shadow-sm">
          <HeaderBanner
            live={liveChannel}
            channelUrl={primary.channelUrl}
            bannerFx={bannerFx}
            profileBanner={profile?.profileBanner ?? null}
            username={streamer.username}
          />
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
                <LiveAvatar
                  userId={streamer.userId}
                  src={streamer.avatar ?? primary.channelImageUrl}
                  live={!!liveChannel}
                />
                <div className="min-w-0 flex-1 pt-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-black leading-tight text-text-primary md:text-2xl">
                      <UserName userId={streamer.userId}>
                        {streamer.username}
                      </UserName>
                    </h1>
                    <span
                      className="rounded-md px-2 py-1 text-xs font-black"
                      style={{
                        color: ACCENT,
                        backgroundColor: `${ACCENT}22`,
                      }}
                    >
                      스트리머
                    </span>
                    {data.ranking.globalRank ? (
                      <Link
                        href={`/lol/ranking?q=${encodeURIComponent(streamer.username)}`}
                        className="inline-flex items-center gap-1 rounded-md bg-accent-gold/15 px-2 py-1 text-xs font-black text-accent-gold transition-colors hover:bg-accent-gold/25"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        랭킹 #{data.ranking.globalRank}
                      </Link>
                    ) : null}
                  </div>

                  <p className="mb-3 max-w-2xl text-sm text-text-secondary">
                    {data.settings.tagline ?? (
                      <span className="italic text-text-tertiary">
                        {data.isOwner
                          ? "「페이지 꾸미기」에서 한마디를 남겨 보세요."
                          : "아직 한마디가 없어요."}
                      </span>
                    )}
                  </p>

                  {/* 채널 칩 — 프로필의 링크 칩과 같은 모양 */}
                  <div className="mb-3 flex flex-wrap gap-2">
                    {channels.map((channel) => (
                      <a
                        key={channel.platform}
                        href={channel.channelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 max-w-[260px] items-center gap-2 rounded-lg border border-bg-elevated bg-bg-tertiary px-2.5 py-2 transition-colors hover:border-accent-primary"
                      >
                        <StreamerPlatformBadge platform={channel.platform} />
                        <span className="truncate text-xs font-bold text-text-primary">
                          {channel.channelName ?? streamer.username}
                        </span>
                        {typeof channel.followerCount === "number" && (
                          <span className="flex-shrink-0 text-[11px] text-text-tertiary">
                            팔로워 {channel.followerCount.toLocaleString()}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
                    <span>
                      방송 내전{" "}
                      <b className="font-bold text-accent-primary">
                        {data.summary.hostedMatches}판
                      </b>
                    </span>
                    <span>
                      함께한 시청자{" "}
                      <b className="font-bold text-accent-primary">
                        {data.summary.viewers}명
                      </b>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="h-3 w-3 text-accent-primary" />
                      칭찬{" "}
                      <b className="font-bold text-accent-primary">
                        {data.summary.commendations}
                      </b>
                    </span>
                    {data.ranking.score !== null && (
                      <span className="text-accent-gold">
                        내전 점수 {data.ranking.score.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-shrink-0 flex-wrap gap-2 sm:w-auto lg:justify-end">
                {data.isOwner ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    페이지 꾸미기
                  </Button>
                ) : (
                  <Button
                    variant={streamer.isFollowing ? "secondary" : "outline"}
                    size="sm"
                    disabled={followMutation.isPending}
                    onClick={toggleFollow}
                  >
                    {streamer.isFollowing ? (
                      <BellOff className="mr-1 h-4 w-4" />
                    ) : (
                      <Bell className="mr-1 h-4 w-4" />
                    )}
                    {streamer.isFollowing ? "알림 끄기" : "방송 알림"}
                  </Button>
                )}
                <Link href={userProfilePath(streamer.userId)}>
                  <Button variant="outline" size="sm">
                    <User className="mr-1 h-4 w-4" />
                    프로필
                  </Button>
                </Link>
                <a
                  href={primary.channelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="primary" size="sm">
                    <ExternalLink className="mr-1 h-4 w-4" />
                    {liveChannel ? "방송 보러 가기" : "채널 가기"}
                  </Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── 위 두 칸 ── */}
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <StatsCard data={data} />
          <CommendationCard tags={data.commendationTags} />
        </div>

        {/* ── 아래: 기록 · 오른쪽 칸 ── */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <RecordsCard
            sessions={data.sessions}
            upcomingDates={data.upcoming
              .map((r) => r.scheduledAt)
              .filter((d): d is string => !!d)}
          />
          <aside className="space-y-4 self-start lg:sticky lg:top-20">
            <NoticesCard
              streamerId={streamerId}
              notices={data.notices}
              isOwner={data.isOwner}
            />
            <ScheduleCard data={data} />
            <LeagueCard league={data.league} />
          </aside>
        </div>
      </div>

      {data.isOwner && (
        <StreamerPageEditor
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          streamerId={streamerId}
          settings={data.settings}
        />
      )}
    </div>
  );
}

// ── 머리 ──────────────────────────────────────────────────────────

/**
 * 배너 칸 — 유저 프로필과 같은 크기. 방송 중이면 방송 미리보기(누르면 채널로),
 * 아니면 꾸미기 배경 → 올린 배경 이미지 → 기본 색 순.
 */
function HeaderBanner({
  live,
  channelUrl,
  bannerFx,
  profileBanner,
  username,
}: {
  live: StreamerPageData["streamer"]["channels"][number] | null;
  channelUrl: string;
  bannerFx: LiveBannerSource | undefined;
  profileBanner: string | null;
  username: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const thumb =
    live?.live?.thumbnailUrl && live.live.checkedAt
      ? withCacheBuster(live.live.thumbnailUrl, live.live.checkedAt)
      : (live?.live?.thumbnailUrl ?? null);
  const showPreview = !!live && !!thumb && failed !== thumb;

  return (
    <div
      className={cn(
        "relative w-full bg-bg-tertiary",
        // 방송 미리보기와 배경 이미지는 같은 높이 — 방송이 켜지고 꺼져도 아래가 안 밀린다
        (showPreview || !bannerFx) && "h-52 sm:h-64 md:h-80 lg:h-[360px]",
      )}
      style={{
        ...(!showPreview && bannerFx
          ? { aspectRatio: liveBannerAspect(bannerFx) }
          : {}),
        ...(!showPreview && !profileBanner
          ? {
              background: `linear-gradient(135deg, ${ACCENT}44, ${ACCENT}0d)`,
            }
          : {}),
      }}
    >
      {showPreview ? (
        <a
          href={channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group absolute inset-0 block overflow-hidden"
          aria-label="방송 보러 가기"
        >
          <Image
            src={thumb}
            alt=""
            fill
            unoptimized
            sizes="100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            onError={() => setFailed(thumb)}
          />
          <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-lg">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
          {typeof live?.live?.viewerCount === "number" && (
            <span className="absolute left-[76px] top-4 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
              <Eye className="h-3 w-3" />
              {live.live.viewerCount.toLocaleString()}
            </span>
          )}
          {live?.live?.title && (
            <span className="absolute bottom-4 left-4 right-4 truncate rounded-md bg-black/70 px-3 py-2 text-sm font-bold text-white">
              {live.live.title}
            </span>
          )}
        </a>
      ) : (
        <>
          {profileBanner && (
            <Image
              src={profileBanner}
              alt={`${username} 프로필 배경`}
              fill
              className="pointer-events-none object-cover"
              unoptimized
            />
          )}
          {bannerFx && <LiveBanner code={bannerFx} />}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-secondary to-transparent" />
        </>
      )}
    </div>
  );
}

/** 아바타 — 방송 중이면 테두리가 빨갛고 아래에 LIVE 글자가 걸린다 */
function LiveAvatar({
  userId,
  src,
  live,
}: {
  userId: string;
  src: string | null | undefined;
  live: boolean;
}) {
  return (
    <div className="relative flex-shrink-0 self-start">
      <UserAvatarDecoration userId={userId} size={96}>
        <div
          className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary md:h-24 md:w-24"
          style={{
            border: live ? "3px solid #ef4444" : `2px solid ${ACCENT}88`,
          }}
        >
          {src ? (
            <Image src={src} alt="" fill className="object-cover" unoptimized />
          ) : (
            <User className="h-12 w-12 text-text-tertiary" />
          )}
        </div>
      </UserAvatarDecoration>
      {live && (
        <span className="absolute -bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none tracking-wide text-white ring-2 ring-bg-secondary">
          LIVE
        </span>
      )}
    </div>
  );
}

// ── 위 두 칸 ──────────────────────────────────────────────────────

function StatsCard({ data }: { data: StreamerPageData }) {
  const s = data.summary;
  const tiles = [
    { label: "연 내전", value: `${s.hostedMatches}`, unit: "판" },
    { label: "방송 회차", value: `${s.sessions}`, unit: "회" },
    {
      label: "스트리머 팀",
      value: `${s.streamerWins}승 ${s.streamerLosses}패`,
      unit: "",
    },
    { label: "평균 참가", value: `${s.avgPlayers}`, unit: "명" },
  ];
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-text-primary">
        <Radio className="h-5 w-5 text-accent-primary" />
        방송 내전 통계
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-bg-tertiary p-3">
            <p className="text-xs text-text-tertiary">{t.label}</p>
            <p className="mt-1 text-2xl font-black text-text-primary">
              {t.value}
              {t.unit && (
                <span className="ml-0.5 text-sm font-medium text-text-tertiary">
                  {t.unit}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommendationCard({
  tags,
}: {
  tags: StreamerPageData["commendationTags"];
}) {
  const max = tags[0]?.count ?? 0;
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-6">
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-text-primary">
        <ThumbsUp className="h-5 w-5 text-accent-primary" />
        칭찬 모음
      </h2>
      {tags.length === 0 ? (
        <p className="py-4 text-sm text-text-tertiary">
          방송 내전에서 오간 칭찬이 아직 없어요.
        </p>
      ) : (
        <div className="space-y-2.5">
          {tags.slice(0, 5).map((t) => (
            <div key={t.tag} className="flex items-center gap-3 text-sm">
              <span className="w-20 flex-shrink-0 text-text-secondary">
                {commendationTagLabel(t.tag)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
                <div
                  className="h-full rounded-full bg-accent-primary"
                  style={{ width: `${(t.count / max) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs text-text-tertiary">
                {t.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 방송 내전 기록 ────────────────────────────────────────────────

function RecordsCard({
  sessions,
  upcomingDates,
}: {
  sessions: StreamerPageSession[];
  upcomingDates: string[];
}) {
  const [view, setView] = useState<"list" | "calendar">("list");
  return (
    <div className="min-w-0 self-start rounded-xl border border-bg-tertiary bg-bg-secondary p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold text-text-primary">
          <Trophy className="h-5 w-5 text-accent-primary" />
          방송 내전 기록
        </h2>
        {sessions.length > 0 && (
          <div className="ml-auto flex rounded-lg bg-bg-tertiary p-0.5">
            {(
              [
                ["list", "회차별"],
                ["calendar", "달력"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-bold transition-colors",
                  view === key
                    ? "bg-accent-primary text-accent-on"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="py-16 text-center">
          <Radio className="mx-auto mb-4 h-16 w-16 text-text-tertiary opacity-50" />
          <h3 className="mb-2 text-lg font-semibold text-text-primary">
            아직 방송 내전이 없어요
          </h3>
          <p className="text-sm text-text-secondary">
            스트리머가 방장으로 연 내전이 끝나면 여기에 쌓여요.
          </p>
        </div>
      ) : view === "list" ? (
        <div className="space-y-5">
          {sessions.map((s) => (
            <SessionBlock key={s.date} session={s} />
          ))}
        </div>
      ) : (
        <CalendarView sessions={sessions} upcomingDates={upcomingDates} />
      )}
      <p className="mt-4 text-xs text-text-tertiary">
        승·패와 챔피언·KDA 는 스트리머 기준 · 스트리머가 관전만 한 판은 회색
      </p>
    </div>
  );
}

function SessionBlock({ session }: { session: StreamerPageSession }) {
  return (
    <div>
      <p className="mb-2 text-sm text-text-secondary">
        <b className="font-bold text-text-primary">
          {sessionLabel(session.date)} 방송
        </b>{" "}
        · {session.matchCount}판 · 시청자 {session.viewerCount}명
      </p>
      <div className="space-y-1.5">
        {session.matches.map((m) => (
          <MatchRow key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}

/** 방송 내전 한 줄 — 프로필 내전 기록 줄과 같은 모양, 누르면 그 자리에서 펼친다 */
function MatchRow({ match }: { match: StreamerPageMatch }) {
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mine = match.streamerSlot
    ? match.streamerSlot === "A"
      ? match.teamA
      : match.teamB
    : null;
  const result = mine ? (mine.won ? "win" : "loss") : "spectate";
  const line = match.streamerLine;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl transition-colors",
        expanded
          ? "bg-bg-tertiary/40"
          : result === "win"
            ? "bg-accent-success/[0.08]"
            : result === "loss"
              ? "bg-accent-danger/[0.08]"
              : "bg-bg-tertiary/60",
      )}
    >
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setExpanded((v) => !v);
        }}
        className="w-full px-3 py-2.5 text-left transition-colors hover:bg-bg-tertiary/30 sm:px-4"
      >
        <div className="flex items-center gap-3">
          {line?.championName ? (
            <Image
              src={getChampionIcon(line.championName)}
              alt={line.championName}
              width={44}
              height={44}
              className="h-10 w-10 flex-shrink-0 rounded-lg sm:h-11 sm:w-11"
            />
          ) : (
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-[10px] font-bold text-text-tertiary sm:h-11 sm:w-11">
              {result === "spectate" ? "관전" : "내전"}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
              <span
                className={cn(
                  "text-sm font-bold",
                  result === "win"
                    ? "text-accent-success"
                    : result === "loss"
                      ? "text-accent-danger"
                      : "text-text-secondary",
                )}
              >
                {result === "win"
                  ? "승리"
                  : result === "loss"
                    ? "패배"
                    : "관전"}
              </span>
              {match.teamMode && (
                <span>· {TEAM_MODE_KO[match.teamMode] ?? match.teamMode}</span>
              )}
              {durationLabel(match.durationSec) && (
                <span>· {durationLabel(match.durationSec)}</span>
              )}
              {match.roomName && (
                <span className="truncate">· {match.roomName}</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <TeamSide team={match.teamA} />
              <span className="text-xs text-text-tertiary">vs</span>
              <TeamSide team={match.teamB} />
            </div>
          </div>
          <div className="hidden flex-shrink-0 text-right sm:block">
            {line && (
              <p className="text-sm font-bold text-text-primary">
                {line.kills}
                <span className="text-text-tertiary"> / </span>
                <span className="text-accent-danger">{line.deaths}</span>
                <span className="text-text-tertiary"> / </span>
                {line.assists}
              </p>
            )}
            {line?.championName && (
              <p className="text-[11px] text-text-tertiary">
                {getChampionKoreanName(line.championName)}
              </p>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            {match.mvp && (
              <span className="rounded-md bg-accent-gold/15 px-1.5 py-0.5 text-[10px] font-black text-accent-gold">
                MVP {match.mvp.username}
              </span>
            )}
            {match.highlight && (
              <span className="rounded-md bg-accent-primary/15 px-1.5 py-0.5 text-[10px] font-black text-accent-primary">
                {match.highlight}
              </span>
            )}
          </div>
        </div>
      </button>
      {mounted && (
        <div className={expanded ? "block" : "hidden"}>
          <InternalMatchExpand matchId={match.id} />
        </div>
      )}
    </div>
  );
}

function TeamSide({ team }: { team: StreamerPageMatch["teamA"] }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "truncate font-semibold",
          team.won ? "text-accent-success" : "text-text-secondary",
        )}
      >
        {team.name}
      </span>
      {team.champions.length > 0 && (
        <span className="flex -space-x-1">
          {team.champions.slice(0, 5).map((c, i) => (
            <Image
              key={`${c}-${i}`}
              src={getChampionIcon(c)}
              alt={c}
              width={18}
              height={18}
              className="h-[18px] w-[18px] rounded ring-1 ring-bg-secondary"
            />
          ))}
        </span>
      )}
    </span>
  );
}

/** 달력 — 방송 내전 한 날은 파랑(판수), 예약은 금색. 날짜를 누르면 그날 기록 */
function CalendarView({
  sessions,
  upcomingDates,
}: {
  sessions: StreamerPageSession[];
  upcomingDates: string[];
}) {
  const byDate = useMemo(
    () => new Map(sessions.map((s) => [s.date, s])),
    [sessions],
  );
  const upcoming = useMemo(
    () =>
      new Set(
        upcomingDates.map((iso) =>
          // 예약 시각도 같은 방송 날짜 기준(KST 새벽 6시)으로 맞춘다
          new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
        ),
      ),
    [upcomingDates],
  );
  // 처음엔 가장 최근 방송한 달
  const latest = sessions[0]?.date ?? new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(latest.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(latest);

  const [y, m] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const pickedSession = picked ? byDate.get(picked) : undefined;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-tertiary"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold text-text-primary">
          {y}년 {m}월
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded-lg p-1.5 text-text-secondary hover:bg-bg-tertiary"
          aria-label="다음 달"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((d) => (
          <span
            key={d}
            className="text-center text-[11px] font-bold text-text-tertiary"
          >
            {d}
          </span>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const key = `${month}-${String(day).padStart(2, "0")}`;
          const session = byDate.get(key);
          const isUpcoming = upcoming.has(key);
          return (
            <button
              key={key}
              type="button"
              disabled={!session}
              onClick={() => setPicked(key)}
              className={cn(
                "relative h-12 rounded-lg p-1.5 text-left text-xs transition-colors sm:h-14",
                session
                  ? "bg-accent-primary/15 text-text-primary hover:bg-accent-primary/25"
                  : isUpcoming
                    ? "bg-accent-gold/10 text-accent-gold"
                    : "bg-bg-tertiary/50 text-text-tertiary",
                picked === key && "ring-2 ring-accent-primary",
              )}
            >
              {day}
              {session && (
                <span className="absolute bottom-1 right-1.5 text-[10px] font-black text-accent-primary">
                  {session.matchCount}판
                </span>
              )}
              {isUpcoming && !session && (
                <span className="absolute bottom-1 right-1.5 text-[10px] font-black">
                  예약
                </span>
              )}
            </button>
          );
        })}
      </div>
      {pickedSession && (
        <div className="mt-5">
          <SessionBlock session={pickedSession} />
        </div>
      )}
    </div>
  );
}

// ── 오른쪽 칸 ─────────────────────────────────────────────────────

function NoticesCard({
  streamerId,
  notices,
  isOwner,
}: {
  streamerId: string;
  notices: StreamerPageData["notices"];
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [draft, setDraft] = useState("");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["streamer-page", streamerId] });
  const onError = (error: unknown) => {
    const message =
      (error as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message ?? "공지를 저장하지 못했어요.";
    addToast(Array.isArray(message) ? message[0] : message, "error");
  };
  const create = useMutation({
    mutationFn: () => streamerApi.createNotice({ content: draft }),
    onSuccess: () => {
      setDraft("");
      void refresh();
    },
    onError,
  });
  const pin = useMutation({
    mutationFn: (n: { id: string; pinned: boolean }) =>
      streamerApi.updateNotice(n.id, { pinned: !n.pinned }),
    onSuccess: () => void refresh(),
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => streamerApi.deleteNotice(id),
    onSuccess: () => void refresh(),
    onError,
  });

  if (!isOwner && notices.length === 0) return null;

  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text-primary">
        <Megaphone className="h-4 w-4 text-accent-primary" />
        공지사항
      </h2>
      {isOwner && (
        <div className="mb-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="예: 이번 주는 목요일만 해요!"
            className="w-full resize-none rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[11px] text-text-muted">
              {draft.length}/500
            </span>
            <Button
              size="sm"
              disabled={!draft.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              공지 올리기
            </Button>
          </div>
        </div>
      )}
      {notices.length === 0 ? (
        <p className="text-sm text-text-tertiary">아직 공지가 없어요.</p>
      ) : (
        <ul className="space-y-2">
          {notices.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-lg px-3 py-2.5",
                n.pinned ? "bg-accent-primary/10" : "bg-bg-tertiary",
              )}
            >
              <div className="mb-1 flex items-center gap-1.5 text-[11px] text-text-tertiary">
                {n.pinned && (
                  <span className="inline-flex items-center gap-0.5 font-bold text-accent-primary">
                    <Pin className="h-3 w-3" />
                    고정
                  </span>
                )}
                <span>
                  {new Date(n.createdAt).toLocaleDateString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </span>
                {isOwner && (
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => pin.mutate(n)}
                      className="rounded p-1 hover:bg-bg-elevated hover:text-text-primary"
                      aria-label={n.pinned ? "고정 풀기" : "고정"}
                      title={n.pinned ? "고정 풀기" : "고정"}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("이 공지를 지울까요?")) {
                          remove.mutate(n.id);
                        }
                      }}
                      className="rounded p-1 hover:bg-bg-elevated hover:text-accent-danger"
                      aria-label="삭제"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
                {n.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScheduleCard({ data }: { data: StreamerPageData }) {
  const { scheduleDays, scheduleTime } = data.settings;
  const days = new Set(scheduleDays);
  if (!data.isOwner && days.size === 0 && data.upcoming.length === 0) {
    return null;
  }
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-text-primary">
        <CalendarDays className="h-4 w-4 text-accent-primary" />
        방송 일정
        {scheduleTime && (
          <span className="ml-auto text-sm font-bold text-accent-primary">
            {scheduleTime}
          </span>
        )}
      </h2>
      <div className="mb-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label, i) => (
          <span
            key={label}
            className={cn(
              "rounded-md py-1.5 text-center text-xs font-bold",
              days.has(i)
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-tertiary text-text-muted",
            )}
          >
            {label}
          </span>
        ))}
      </div>
      {days.size === 0 && (
        <p className="mb-2 text-xs text-text-tertiary">
          {data.isOwner
            ? "「페이지 꾸미기」에서 정기 방송 요일을 정할 수 있어요."
            : "정해 둔 방송 요일이 없어요."}
        </p>
      )}
      {data.upcoming.length > 0 && (
        <div className="space-y-1.5">
          {data.upcoming.map((room) => (
            <div
              key={room.id}
              className="flex items-center gap-3 rounded-lg bg-bg-tertiary px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-text-primary">
                  {room.scheduledAt &&
                    new Date(room.scheduledAt).toLocaleString("ko-KR", {
                      month: "numeric",
                      day: "numeric",
                      weekday: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                </p>
                <p className="truncate text-xs text-text-tertiary">
                  {room.name} · {room.players}/{room.maxParticipants}명
                </p>
              </div>
              <Link href={roomPath(room)}>
                <Button size="sm">참가</Button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeagueCard({ league }: { league: StreamerPageData["league"] }) {
  if (league.length === 0) return null;
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-5">
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-text-primary">
        <Crown className="h-4 w-4 text-accent-gold" />
        시청자 리그
      </h2>
      <p className="mb-3 text-xs text-text-tertiary">
        이 방송 내전만 따로 센 순위 · 점수는 50에서 시작해요
      </p>
      <ol className="space-y-1">
        {league.map((e, i) => (
          <li key={e.userId}>
            <Link
              href={userProfilePath(e.userId)}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-bg-tertiary"
            >
              <span
                className={cn(
                  "w-5 text-center text-sm font-black",
                  i < 3 ? "text-accent-gold" : "text-text-tertiary",
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-text-primary">
                  <UserName userId={e.userId}>{e.username}</UserName>
                </span>
                <span className="text-[11px] text-text-tertiary">
                  {e.games}판 {e.wins}승{e.mvp > 0 ? ` · MVP ${e.mvp}` : ""}
                </span>
              </span>
              <span className="text-sm font-black text-text-primary">
                {e.score.toFixed(1)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
