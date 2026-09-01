"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { useRiotStore, type RiotAccount } from "@/stores/riot-store";
import { DiscordBanner } from "@/components/home/DiscordBanner";
import { AuctionBanner } from "@/components/home/AuctionBanner";
import { StatsBanner } from "@/components/home/StatsBanner";
import { CreatorBanner } from "@/components/home/CreatorBanner";
import { LiveStreamersSection } from "@/components/home/LiveStreamersSection";
import {
  userApi,
  roomApi,
  communityApi,
  statsApi,
  clanApi,
} from "@/lib/api-client";
import { Skeleton, ErrorBoundary } from "@/components/ui";
import { TierBadge } from "@/components/domain/TierBadge";
import {
  Trophy,
  Users,
  MessageSquare,
  Swords,
  ChevronRight,
  Eye,
  Heart,
  Plus,
  Shield,
  Lock,
  ChevronLeft,
  Flame,
  Megaphone,
  ArrowRight,
  Activity,
  UserRound,
  PenLine,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface UserStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  participations: number;
}

interface Room {
  id: string;
  name: string;
  status: string;
  maxParticipants: number;
  teamMode: string;
  isPrivate: boolean;
  participants: { id: string }[];
}

interface Post {
  id: string;
  title: string;
  category: "NOTICE" | "FREE" | "TIP" | "QNA";
  views: number;
  createdAt: string;
  author: { username: string };
  _count?: { likes: number; comments: number };
}

interface ChampionStat {
  championId: string;
  championName: string;
  games: number;
  wins: number;
}

interface PositionStat {
  position: string;
  games: number;
  wins: number;
}

interface ClanSummary {
  id: string;
  name: string;
  tag: string;
  accentColor?: string | null;
  members?: Array<{ id: string }>;
  _count?: { members: number };
}

const POSITION_LABEL: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  MID: "미드",
  BOTTOM: "원딜",
  ADC: "원딜",
  UTILITY: "서포터",
  SUPPORT: "서포터",
};

const TEAM_MODE_LABEL: Record<string, string> = {
  AUCTION: "경매",
  SNAKE_DRAFT: "스네이크",
  AUTO_BALANCE: "자동 밸런스",
  MANUAL_TEAM: "자유 팀 선택",
};

const CATEGORY_CONFIG = {
  NOTICE: { label: "공지", color: "text-red-400" },
  FREE: { label: "자유", color: "text-text-secondary" },
  TIP: { label: "팁", color: "text-amber-400" },
  QNA: { label: "Q&A", color: "text-violet-400" },
};

// ─────────────────────────────────────────────────────────────────────────────
// 공통 카드 헤더
// ─────────────────────────────────────────────────────────────────────────────

function CardHeader({
  icon: Icon,
  iconColor,
  title,
  actionLabel,
  onAction,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", iconColor)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h2 className="text-sm font-semibold text-text-primary tracking-wide uppercase">
          {title}
        </h2>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="text-xs text-text-tertiary hover:text-violet-400 transition-colors flex items-center gap-1 group"
        >
          {actionLabel}
          <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 공통 글래스 카드
// ─────────────────────────────────────────────────────────────────────────────

function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-bg-secondary/60 backdrop-blur-sm overflow-hidden",
        "hover:border-violet-500/10 transition-colors duration-300",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 로그인 홈 히어로 — 랜딩의 시각 언어를 작업 중심 대시보드로 변환
// ─────────────────────────────────────────────────────────────────────────────

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "늦은 시간에도 반가워요";
  if (hour < 12) return "좋은 아침이에요";
  if (hour < 18) return "오늘도 반가워요";
  return "좋은 저녁이에요";
}

function DashboardHero({
  username,
  rooms,
  stats,
  primaryAccount,
  clan,
}: {
  username: string;
  rooms: Room[];
  stats: UserStats | null;
  primaryAccount: RiotAccount | null;
  clan: ClanSummary | null;
}) {
  const router = useRouter();
  const clanMemberCount = clan?._count?.members ?? clan?.members?.length ?? 0;
  const metrics = [
    {
      label: "참가 가능한 내전",
      value: `${rooms.length}개`,
      detail: rooms.length > 0 ? "지금 참가자를 기다리는 중" : "새 내전을 열어보세요",
      icon: Swords,
      color: "text-amber-200",
      href: "/tournaments",
    },
    {
      label: "내전 기록",
      value: stats ? `${stats.gamesPlayed}전` : "기록 전",
      detail:
        stats && stats.gamesPlayed > 0
          ? `승률 ${stats.winRate.toFixed(0)}%`
          : "첫 경기를 시작해보세요",
      icon: Trophy,
      color: "text-cyan-200",
      href: "/profile",
    },
    {
      label: "내 클랜",
      value: clan ? `[${clan.tag}]` : "미가입",
      detail: clan ? `${clan.name} · ${clanMemberCount}명` : "함께할 클랜을 찾아보세요",
      icon: Shield,
      color: "text-violet-200",
      href: "/clans",
    },
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0b0c11] px-5 py-7 shadow-[0_35px_100px_rgba(0,0,0,0.28)] sm:px-8 sm:py-9 lg:px-10 lg:py-10">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-20 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:44px_44px]"
      />
      <div
        aria-hidden="true"
        className="absolute -left-24 -top-32 -z-10 h-96 w-96 rounded-full bg-violet-500/20 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-40 right-0 -z-10 h-96 w-96 rounded-full bg-cyan-400/10 blur-[120px]"
      />

      <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end lg:gap-12">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200/75">
            <Sparkles className="h-3.5 w-3.5" />
            Nexus command center
          </div>
          <h1 className="mt-5 max-w-3xl text-3xl font-black leading-[1.08] tracking-[-0.045em] text-white sm:text-4xl lg:text-5xl">
            {getTimeGreeting()},
            <br />
            <span className="bg-gradient-to-r from-violet-200 via-white to-cyan-200 bg-clip-text text-transparent">
              {username}님.
            </span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-white/45 sm:text-base sm:leading-7">
            {rooms.length > 0
              ? `${rooms.length}개의 내전이 참가자를 기다리고 있습니다. 로비에 합류하거나 직접 새로운 경기를 시작해보세요.`
              : "현재 모집 중인 내전이 없습니다. 새 로비를 열고 오늘의 경기를 시작해보세요."}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => router.push("/tournaments")}
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#111218] transition-all hover:bg-violet-100"
            >
              참가할 내전 찾기
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/tournaments?create=true")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white/75 transition-colors hover:border-violet-300/25 hover:bg-violet-300/[0.08] hover:text-white"
            >
              <Plus className="h-4 w-4" />
              새 내전 만들기
            </button>
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/profile")}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs text-white/50 transition-colors hover:text-white/80"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              {primaryAccount
                ? `${primaryAccount.gameName} #${primaryAccount.tagLine}`
                : "Riot 계정 연결하기"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/clans")}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-xs text-white/50 transition-colors hover:text-white/80"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: clan?.accentColor || "#a78bfa" }}
              />
              {clan ? `[${clan.tag}] ${clan.name}` : "클랜 찾기"}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/20 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">
                Today at nexus
              </p>
              <p className="mt-0.5 text-xs font-semibold text-white/70">
                지금 확인할 항목
              </p>
            </div>
            <Activity className="h-4 w-4 text-emerald-300/70" />
          </div>
          <div className="divide-y divide-white/[0.06]">
            {metrics.map((metric, index) => (
              <button
                key={metric.label}
                type="button"
                onClick={() => router.push(metric.href)}
                className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.035]"
              >
                <span className="text-[10px] font-bold tabular-nums text-white/20">
                  0{index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-xs font-semibold text-white/65">
                    <metric.icon className={cn("h-3.5 w-3.5", metric.color)} />
                    {metric.label}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-white/30">
                    {metric.detail}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-black tabular-nums text-white/85">
                    {metric.value}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-white/50" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 퀵액션 — "무언가를 새로 만드는" 행동만 둔다.
 *
 * 위쪽 히어로 지표(참가 가능한 내전 / 내전 기록 / 내 클랜)는 상태를 읽는 곳이고,
 * 여기는 행동을 시작하는 곳이다. 예전에는 "내 클랜"·"내 전적"처럼 단순 이동도
 * 섞여 있었는데, 목적지가 지표와 완전히 같은 데다 헤더 내비게이션에도 있어서
 * 같은 곳으로 가는 입구가 셋씩 됐다. 이동은 지표와 헤더에 맡기고 뺐다.
 *
 * 남는 자리는 지금 상태에서 실제로 할 만한 것으로 채운다 —
 * 계정을 안 걸었으면 연동, 클랜이 없으면 클랜 만들기.
 */
function QuickActions({
  clan,
  primaryAccount,
}: {
  clan: ClanSummary | null;
  primaryAccount: RiotAccount | null;
}) {
  const router = useRouter();
  const actions = [
    {
      label: "내전 만들기",
      description: "새 로비를 열고 참가자를 모집하세요",
      icon: Plus,
      href: "/tournaments?create=true",
      tone: "text-amber-300 bg-amber-300/[0.08] border-amber-300/10",
    },
    // 라이엇 계정이 없으면 전적·티어가 아무것도 안 잡히므로 이게 가장 먼저 할 일이다.
    ...(primaryAccount
      ? []
      : [
          {
            label: "라이엇 계정 연동",
            description: "티어와 전적을 불러오려면 계정이 필요해요",
            icon: UserRound,
            href: "/settings?tab=accounts",
            tone: "text-cyan-300 bg-cyan-300/[0.08] border-cyan-300/10",
          },
        ]),
    // 클랜이 없을 때만 노출. 있으면 지표의 "내 클랜"이 그 역할을 한다.
    ...(clan
      ? []
      : [
          {
            label: "클랜 만들기",
            description: "같이 할 사람들을 모아보세요",
            icon: Users,
            href: "/clans/create",
            tone: "text-violet-300 bg-violet-300/[0.08] border-violet-300/10",
          },
        ]),
    {
      label: "글쓰기",
      description: "커뮤니티에 새로운 이야기를 남겨보세요",
      icon: PenLine,
      href: "/community/write",
      tone: "text-emerald-300 bg-emerald-300/[0.08] border-emerald-300/10",
    },
  ];

  // 상황에 따라 2~4개로 달라지므로 열 수를 개수에 맞춘다.
  // 고정 4열로 두면 항목이 2개일 때 절반이 빈 채로 남는다.
  const columnClass =
    actions.length >= 4
      ? "sm:grid-cols-2 xl:grid-cols-4"
      : actions.length === 3
        ? "sm:grid-cols-2 xl:grid-cols-3"
        : "sm:grid-cols-2";

  return (
    <div className={cn("grid gap-3", columnClass)}>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => router.push(action.href)}
          className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-bg-secondary/55 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-violet-400/20 hover:bg-bg-secondary"
        >
          <span
            className={cn(
              "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border",
              action.tone,
            )}
          >
            <action.icon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-text-primary">
              {action.label}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">
              {action.description}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-violet-400" />
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Banner Carousel — 보라 테마 통일
// ─────────────────────────────────────────────────────────────────────────────

// 배너 슬라이드 총 개수 — 각각 전용 컴포넌트로 렌더링
const TOTAL_SLIDES = 4;

function BannerCarousel() {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 터치 스와이프 지원 ──
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const SWIPE_THRESHOLD = 50; // 최소 스와이프 거리(px)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) < SWIPE_THRESHOLD) return;

    if (timerRef.current) clearInterval(timerRef.current);
    if (diff > 0) {
      // 왼쪽 스와이프 → 다음 슬라이드
      setCurrent((c) => (c + 1) % TOTAL_SLIDES);
    } else {
      // 오른쪽 스와이프 → 이전 슬라이드
      setCurrent((c) => (c - 1 + TOTAL_SLIDES) % TOTAL_SLIDES);
    }
    startTimer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % TOTAL_SLIDES);
    }, 5000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer]);

  const goTo = (idx: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrent(idx);
    startTimer();
  };

  // 슬라이드 목록 — 모든 슬라이드를 렌더링하되 현재만 보이게 (페이드 전환)
  // isActive prop으로 활성 슬라이드에서만 애니메이션 시작
  const slides = [
    <CreatorBanner
      key="creator"
      className="h-full aspect-auto"
      isActive={current === 0}
      priority
    />,
    <AuctionBanner key="auction" isActive={current === 1} />,
    <StatsBanner key="stats" isActive={current === 2} />,
    <DiscordBanner key="discord" />,
  ];

  return (
    // 모든 배너는 3:2 고정 비율로 통일 — 새 배너 추가 시 1536x1024 기준
    <div
      className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 페이드 크로스페이드 전환 — 모든 슬라이드를 절대 배치, 현재만 visible */}
      {slides.map((slide, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-all duration-500 ease-out"
          style={{
            opacity: i === current ? 1 : 0,
            // 비활성 슬라이드는 마우스/터치 이벤트 무시 + 스케일 살짝 줄여 깊이감
            pointerEvents: i === current ? "auto" : "none",
            transform: i === current ? "scale(1)" : "scale(0.98)",
          }}
        >
          {slide}
        </div>
      ))}

      {/* 좌우 화살표 — 좁은 폭에서는 콘텐츠와 겹치므로 데스크톱에서만 노출 */}
      <button
        onClick={() => goTo((current - 1 + TOTAL_SLIDES) % TOTAL_SLIDES)}
        aria-label="이전 슬라이드"
        className="hidden lg:block absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/5 text-white/45 hover:bg-white/10 hover:text-white transition-all z-20 backdrop-blur-sm"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => goTo((current + 1) % TOTAL_SLIDES)}
        aria-label="다음 슬라이드"
        className="hidden lg:block absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/5 text-white/45 hover:bg-white/10 hover:text-white transition-all z-20 backdrop-blur-sm"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {/* 닷 네비게이션 — 터치 영역 확대 (시각 6px, 터치 44px) */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1 z-20">
        {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`슬라이드 ${i + 1}/${TOTAL_SLIDES}`}
            aria-current={i === current ? "true" : undefined}
            className="flex items-center justify-center h-7 px-1"
          >
            <span
              className={cn(
                "block rounded-full transition-all duration-500",
                i === current ? "h-1.5 w-6 bg-violet-500" : "h-1.5 w-1.5 bg-white/50"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// My Stats Card
// ─────────────────────────────────────────────────────────────────────────────

function MyStatsCard({
  stats,
  primaryAccount,
  championStats,
  positionStats,
}: {
  stats: UserStats | null;
  primaryAccount: RiotAccount | null;
  championStats: ChampionStat[];
  positionStats: PositionStat[];
}) {
  const router = useRouter();
  const winRate = stats?.winRate ?? 0;
  const topPositions = positionStats.slice(0, 3);
  const topChampions = championStats.slice(0, 3);

  return (
    <GlassCard className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-violet-500/[0.08] blur-[90px]"
      />
      <CardHeader
        icon={Shield}
        iconColor="bg-violet-500/80"
        title="내 전적"
        actionLabel="프로필"
        onAction={() => router.push("/profile")}
      />

      <div className="relative px-5 pb-5">
        {!primaryAccount ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Shield className="h-7 w-7 text-violet-400" />
            </div>
            <div>
              <p className="text-text-secondary text-sm mb-1">
                라이엇 계정을 연동하면
              </p>
              <p className="text-text-secondary text-sm">
                소환사 통계를 볼 수 있어요
              </p>
            </div>
            <button
              onClick={() => router.push("/profile")}
              className="px-5 py-2 rounded-xl text-sm font-medium text-violet-400 border border-violet-500/30 hover:bg-violet-500/10 transition-colors"
            >
              계정 연동하기
            </button>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(250px,0.8fr)_minmax(300px,1.1fr)_auto]">
            {/* 왼쪽: 계정 정보 */}
            <div className="flex items-center gap-4 rounded-2xl border border-violet-400/10 bg-gradient-to-br from-violet-500/[0.09] to-transparent p-4">
              <TierBadge tier={primaryAccount.tier} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-text-primary">
                  {primaryAccount.gameName}
                  <span className="ml-0.5 text-sm font-normal text-text-tertiary">
                    #{primaryAccount.tagLine}
                  </span>
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {primaryAccount.tier} {primaryAccount.rank} · {primaryAccount.lp} LP
                </p>
                <button
                  onClick={() =>
                    router.push(
                      `/matches/summoner/${encodeURIComponent(primaryAccount.gameName)}/${encodeURIComponent(primaryAccount.tagLine)}`
                    )
                  }
                  className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-violet-400/80 transition-colors hover:text-violet-300"
                >
                  소환사 전적 보기 <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* 가운데: 내전 통계 */}
            <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    내전
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums text-text-primary">
                    {stats?.gamesPlayed ?? 0}
                  </p>
                </div>
                <div className="border-x border-white/[0.06] text-center">
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    승률
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-2xl font-black tabular-nums",
                      winRate >= 50 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {winRate.toFixed(0)}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    승 / 패
                  </p>
                  <p className="mt-2 text-base font-black tabular-nums">
                    <span className="text-emerald-400">{stats?.wins ?? 0}</span>
                    <span className="mx-1 text-text-tertiary">/</span>
                    <span className="text-red-400">{stats?.losses ?? 0}</span>
                  </p>
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-500"
                  style={{ width: `${stats?.gamesPlayed ? winRate : 0}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-text-tertiary">
                {stats?.gamesPlayed
                  ? `${stats.participations}회 참가 · 총 ${stats.gamesPlayed}경기 기록`
                  : "내전에 참가하면 승률과 경기 기록이 여기에 쌓입니다."}
              </p>
            </div>

            {/* 오른쪽: 포지션 + 챔피언 */}
            <div className="flex min-w-[220px] gap-6 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
              {topPositions.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-text-tertiary">
                    포지션
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {topPositions.map((pos, i) => (
                      <span
                        key={pos.position}
                        className={cn(
                          "rounded-lg px-3 py-1 text-xs font-medium",
                          i === 0
                            ? "bg-violet-500/15 text-violet-400"
                            : "bg-white/[0.04] text-text-secondary"
                        )}
                      >
                        {POSITION_LABEL[pos.position] ?? pos.position}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {topChampions.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-text-tertiary">
                    챔피언
                  </p>
                  <div className="flex gap-3">
                    {topChampions.map((champ) => {
                      const wr =
                        champ.games > 0 ? Math.round((champ.wins / champ.games) * 100) : 0;
                      return (
                        <div
                          key={champ.championId}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <Image
                            src={`/icons/champions/${champ.championName}.png`}
                            alt={champ.championName}
                            width={40}
                            height={40}
                            className="rounded-xl border-2 border-white/[0.08]"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <span className="text-[10px] font-semibold text-text-tertiary">
                            {wr}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {topPositions.length === 0 && topChampions.length === 0 && (
                <div className="flex flex-1 items-center justify-center text-center text-xs leading-5 text-text-tertiary">
                  경기를 기록하면 선호 포지션과 챔피언이 표시됩니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Rooms Card
// ─────────────────────────────────────────────────────────────────────────────

function ActiveRoomsCard({ rooms }: { rooms: Room[] }) {
  const router = useRouter();

  return (
    <div data-tour="home-active-rooms">
      <GlassCard>
      <CardHeader
        icon={Swords}
        iconColor="bg-amber-500/80"
        title="모집중인 내전"
        actionLabel="전체"
        onAction={() => router.push("/tournaments")}
      />

      <div className="px-5 pb-5">
        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Swords className="h-7 w-7 text-amber-400" />
            </div>
            <p className="text-sm text-text-secondary">모집 중인 내전이 없습니다</p>
            <button
              onClick={() => router.push("/tournaments")}
              data-tour="home-create-room"
              className="px-5 py-2 rounded-xl text-sm font-medium text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              방 만들기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {rooms.map((room) => {
              const filled = room.participants?.length ?? 0;
              const fillRatio =
                room.maxParticipants > 0 ? filled / room.maxParticipants : 0;
              const isFull = filled >= room.maxParticipants;
              return (
                <div
                  key={room.id}
                  onClick={() => router.push(`/tournaments/${room.id}/lobby`)}
                  className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-violet-500/20 hover:bg-white/[0.04] cursor-pointer transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {room.isPrivate && (
                        <Lock className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                      )}
                      <p className="text-sm font-medium text-text-primary truncate group-hover:text-violet-300 transition-colors">
                        {room.name}
                      </p>
                    </div>
                    <span className="flex-shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/10 text-violet-400">
                      {TEAM_MODE_LABEL[room.teamMode] ?? room.teamMode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-grow h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isFull
                            ? "bg-red-400"
                            : fillRatio > 0.7
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                        )}
                        style={{ width: `${fillRatio * 100}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium flex-shrink-0 tabular-nums",
                        isFull ? "text-red-400" : "text-text-secondary"
                      )}
                    >
                      {filled}/{room.maxParticipants}
                    </span>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => router.push("/tournaments")}
              data-tour="home-create-room"
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-white/[0.08] text-text-tertiary hover:text-violet-400 hover:border-violet-500/30 transition-all duration-200 min-h-[80px]"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs">새 내전 만들기</span>
            </button>
          </div>
        )}
      </div>
      </GlassCard>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Popular Posts Card
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function PopularPostsCard({ posts }: { posts: Post[] }) {
  const router = useRouter();

  return (
    <GlassCard className="h-full">
      <CardHeader
        icon={Flame}
        iconColor="bg-emerald-500/80"
        title="인기글"
        actionLabel="커뮤니티"
        onAction={() => router.push("/community")}
      />

      <div>
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <MessageSquare className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">게시글이 없습니다</p>
          </div>
        ) : (
          <div>
            {posts.map((post, i) => {
              const cfg = CATEGORY_CONFIG[post.category];
              return (
                <div
                  key={post.id}
                  onClick={() => router.push(`/community/${post.id}`)}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors border-t border-white/[0.04] first:border-t-0"
                >
                  {/* 순위 뱃지 */}
                  <span
                    className={cn(
                      "flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold",
                      i === 0
                        ? "bg-amber-500/15 text-amber-400"
                        : i === 1
                        ? "bg-slate-400/15 text-slate-400"
                        : i === 2
                        ? "bg-orange-700/15 text-orange-500"
                        : "bg-white/[0.03] text-text-tertiary"
                    )}
                  >
                    {i + 1}
                  </span>

                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn("text-[10px] font-semibold flex-shrink-0", cfg.color)}>
                        {cfg.label}
                      </span>
                      <p className="text-sm text-text-primary truncate">{post.title}</p>
                      {(post._count?.comments || 0) > 0 && (
                        <span className="text-violet-400 text-[11px] flex-shrink-0">
                          {post._count?.comments}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                      <span>{post.author.username}</span>
                      <span className="opacity-40">·</span>
                      <span className="flex items-center gap-0.5">
                        <Heart className="h-2.5 w-2.5" />
                        {post._count?.likes || 0}
                      </span>
                      <span className="opacity-40">·</span>
                      <span className="flex items-center gap-0.5">
                        <Eye className="h-2.5 w-2.5" />
                        {post.views}
                      </span>
                      <span className="ml-auto">{formatRelativeDate(post.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="px-5 py-3.5 border-t border-white/[0.04]">
          <button
            onClick={() => router.push("/community/write")}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/[0.08] text-text-tertiary hover:text-violet-400 hover:border-violet-500/30 text-sm transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
            글쓰기
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notice Posts Card
// ─────────────────────────────────────────────────────────────────────────────

function NoticePostsCard({ posts }: { posts: Post[] }) {
  const router = useRouter();

  return (
    <GlassCard className="h-full">
      <CardHeader
        icon={Megaphone}
        iconColor="bg-red-500/80"
        title="공지사항"
        actionLabel="전체"
        onAction={() => router.push("/community?category=NOTICE")}
      />

      <div>
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Megaphone className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">공지사항이 없습니다</p>
          </div>
        ) : (
          <div>
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => router.push(`/community/${post.id}`)}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] cursor-pointer transition-colors border-t border-white/[0.04] first:border-t-0 group"
              >
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate group-hover:text-violet-300 transition-colors">
                    {post.title}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-text-tertiary mt-1">
                    <span>{post.author.username}</span>
                    <span className="opacity-40">·</span>
                    <span>{formatRelativeDate(post.createdAt)}</span>
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0 group-hover:text-violet-400 transition-colors" />
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 대시보드 스켈레톤
// ─────────────────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* 작업 중심 히어로 */}
      <div className="relative min-h-[360px] overflow-hidden rounded-[28px] border border-white/[0.06] bg-white/[0.03] p-7 md:p-10">
        <div className="max-w-xl space-y-4">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-4 w-full max-w-md" />
          <div className="flex gap-3 pt-2">
            <Skeleton className="h-11 w-36 rounded-xl" />
            <Skeleton className="h-11 w-36 rounded-xl" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[78px] rounded-2xl" />
        ))}
      </div>

      {/* 내 전적 */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5">
        <div className="flex items-center gap-3 mb-5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="flex flex-col md:flex-row gap-5">
          <div className="flex items-center gap-4 md:w-60">
            <Skeleton className="w-12 h-12 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex-grow">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 모집중인 내전 */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5">
        <div className="flex items-center gap-3 mb-5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </div>

      {/* 인기글 + 공지사항 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((section) => (
          <div key={section} className="rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-3 p-5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-16" />
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-t border-white/[0.04]">
                {section === 1 && <Skeleton className="h-6 w-6 rounded-lg flex-shrink-0" />}
                <div className="flex-grow space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DashboardContent
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardContent() {
  const { user, isAuthenticated } = useAuthStore();
  const { primaryAccount, fetchAccounts } = useRiotStore();

  // 로그인 직후 riot 계정 목록 1회 동기화
  useEffect(() => {
    if (isAuthenticated) fetchAccounts();
  }, [isAuthenticated, fetchAccounts]);

  const enabled = isAuthenticated && !!user?.id;

  const { data: userStats = null, isLoading: isStatsLoading } = useQuery<UserStats | null>({
    queryKey: ["dashboard", "userStats", user?.id],
    queryFn: () => userApi.getStats(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const { data: rooms = [], isLoading: isRoomsLoading } = useQuery<Room[]>({
    queryKey: ["dashboard", "rooms"],
    queryFn: async () => {
      const data = await roomApi.getRooms({ status: "WAITING" });
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      return list.slice(0, 6);
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const { data: popularPosts = [], isLoading: isPopularPostsLoading } = useQuery<Post[]>({
    queryKey: ["dashboard", "popularPosts"],
    queryFn: async () => {
      const data = await communityApi.getPosts({ limit: 20 });
      const arr = Array.isArray(data) ? data : (data?.posts ?? []);
      return [...arr].sort((a: Post, b: Post) => (b._count?.likes || 0) - (a._count?.likes || 0)).slice(0, 5);
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const { data: noticePosts = [], isLoading: isNoticePostsLoading } = useQuery<Post[]>({
    queryKey: ["dashboard", "noticePosts"],
    queryFn: async () => {
      const data = await communityApi.getPosts({ category: "NOTICE", limit: 5 });
      const arr = Array.isArray(data) ? data : (data?.posts ?? []);
      return arr.slice(0, 5);
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const { data: championStats = [] } = useQuery<ChampionStat[]>({
    queryKey: ["dashboard", "championStats", user?.id],
    queryFn: async () => {
      const data = await statsApi.getUserChampionStats(user!.id);
      const list = Array.isArray(data) ? data : (data?.stats ?? data?.data ?? []);
      return list.slice(0, 3);
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const { data: positionStats = [] } = useQuery<PositionStat[]>({
    queryKey: ["dashboard", "positionStats", user?.id],
    queryFn: async () => {
      const data = await statsApi.getUserPositionStats(user!.id);
      const list = Array.isArray(data) ? data : (data?.stats ?? data?.data ?? []);
      return list.slice(0, 3);
    },
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const { data: myClan = null, isLoading: isClanLoading } = useQuery<ClanSummary | null>({
    queryKey: ["clans", "my", user?.id],
    queryFn: () => clanApi.getMyClan().catch(() => null),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });

  const isDataLoading =
    enabled &&
    (isStatsLoading ||
      isRoomsLoading ||
      isPopularPostsLoading ||
      isNoticePostsLoading ||
      isClanLoading);

  if (isDataLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        username={user?.username || "플레이어"}
        rooms={rooms}
        stats={userStats}
        primaryAccount={primaryAccount}
        clan={myClan}
      />

      <QuickActions clan={myClan} primaryAccount={primaryAccount} />

      {/* 방송 중인 스트리머가 있을 때만 나타나는 섹션 */}
      <ErrorBoundary>
        <LiveStreamersSection />
      </ErrorBoundary>

      {/* 모집중인 내전 */}
      <ActiveRoomsCard rooms={rooms} />

      {/* 내 전적 */}
      <div data-tour="home-my-stats">
        <MyStatsCard
          stats={userStats}
          primaryAccount={primaryAccount}
          championStats={championStats}
          positionStats={positionStats}
        />
      </div>

      {/* 인기글 + 공지사항 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PopularPostsCard posts={popularPosts} />
        <NoticePostsCard posts={noticePosts} />
      </div>

      {/* 프로모션은 핵심 작업을 방해하지 않도록 대시보드 하단에 배치한다. */}
      <ErrorBoundary>
        <BannerCarousel />
      </ErrorBoundary>
    </div>
  );
}
