"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { useRiotStore } from "@/stores/riot-store";
import { userApi, roomApi, communityApi, statsApi } from "@/lib/api-client";
import { Card, CardContent, Button, Skeleton } from "@/components/ui";
import { TierBadge } from "@/components/domain/TierBadge";
import {
  Trophy,
  Users,
  TrendingUp,
  MessageSquare,
  Swords,
  ChevronRight,
  Eye,
  Heart,
  Plus,
  ArrowRight,
  Shield,
  Lock,
  ChevronLeft,
  Flame,
  Megaphone,
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
  AUTO: "자동",
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
// Banner Carousel — 보라 테마 통일
// ─────────────────────────────────────────────────────────────────────────────

const BANNER_SLIDES = [
  {
    id: 1,
    gradient: "from-[#1e1245] via-[#2a1a5e] to-[#1a0d3a]",
    accentHex: "#8b5cf6",
    tag: "NEW",
    title: "경매 드래프트 시스템",
    description: "실시간 입찰로 팀을 구성하세요. 포인트 전략이 승부를 가른다.",
    link: "/tournaments",
    linkLabel: "내전 만들기",
  },
  {
    id: 2,
    gradient: "from-[#1a1040] via-[#2d1b5e] to-[#15082e]",
    accentHex: "#a855f7",
    tag: "FEATURE",
    title: "Discord 봇 연동",
    description: "내전 알림, 음성 채널 자동 이동, 결과 공유. 봇이 모든 걸 처리합니다.",
    link: "/profile",
    linkLabel: "설정하기",
  },
  {
    id: 3,
    gradient: "from-[#0f1a30] via-[#162040] to-[#0a1020]",
    accentHex: "#6366f1",
    tag: "UPDATE",
    title: "내전 전적 통계",
    description: "KDA, 챔피언, 포지션 통계를 자동으로 기록. 나의 성장을 한눈에.",
    link: "/matches",
    linkLabel: "전적 보기",
  },
];

function BannerCarousel() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % BANNER_SLIDES.length);
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

  const slide = BANNER_SLIDES[current];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-r",
        slide.gradient,
        "min-h-[180px] md:min-h-[220px] transition-[background] duration-700"
      )}
    >
      {/* 배경 글로우 */}
      <div
        className="absolute top-0 right-0 w-1/2 h-full opacity-20"
        style={{
          background: `radial-gradient(circle at 70% 50%, ${slide.accentHex}40 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10 px-7 py-9 md:px-10 md:py-10">
        <div className="max-w-lg">
          <span
            className="inline-block px-3 py-1 rounded-full text-[11px] font-bold mb-4 tracking-wider"
            style={{
              backgroundColor: `${slide.accentHex}20`,
              color: slide.accentHex,
              border: `1px solid ${slide.accentHex}40`,
            }}
          >
            {slide.tag}
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-white mb-2.5">{slide.title}</h2>
          <p className="text-sm md:text-base text-white/60 mb-6 leading-relaxed">
            {slide.description}
          </p>
          <button
            onClick={() => router.push(slide.link)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${slide.accentHex}, ${slide.accentHex}cc)`,
              boxShadow: `0 4px 20px ${slide.accentHex}30`,
            }}
          >
            {slide.linkLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 네비게이션 */}
      <button
        onClick={() => goTo((current - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length)}
        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all z-20 backdrop-blur-sm"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        onClick={() => goTo((current + 1) % BANNER_SLIDES.length)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-all z-20 backdrop-blur-sm"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {BANNER_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-500",
              i === current ? "w-8 bg-white" : "w-1.5 bg-white/30"
            )}
          />
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
  primaryAccount: any;
  championStats: ChampionStat[];
  positionStats: PositionStat[];
}) {
  const router = useRouter();
  const winRate = stats?.winRate ?? 0;
  const topPositions = positionStats.slice(0, 3);
  const topChampions = championStats.slice(0, 3);

  return (
    <GlassCard>
      <CardHeader
        icon={Shield}
        iconColor="bg-violet-500/80"
        title="내 전적"
        actionLabel="프로필"
        onAction={() => router.push("/profile")}
      />

      <div className="px-5 pb-5">
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
          <div className="flex flex-col md:flex-row gap-5">
            {/* 왼쪽: 계정 정보 */}
            <div className="flex items-center gap-4 md:w-60 flex-shrink-0">
              <TierBadge tier={primaryAccount.tier} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-text-primary truncate text-base">
                  {primaryAccount.gameName}
                  <span className="text-text-tertiary font-normal text-sm ml-0.5">
                    #{primaryAccount.tagLine}
                  </span>
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {primaryAccount.tier} {primaryAccount.rank} · {primaryAccount.lp} LP
                </p>
                <button
                  onClick={() =>
                    router.push(
                      `/matches/summoner/${encodeURIComponent(primaryAccount.gameName)}/${encodeURIComponent(primaryAccount.tagLine)}`
                    )
                  }
                  className="text-[11px] text-violet-400/70 hover:text-violet-400 transition-colors flex items-center gap-0.5 mt-1.5"
                >
                  전적 상세 <ChevronRight className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>

            <div className="w-px bg-white/[0.06] hidden md:block flex-shrink-0" />

            {/* 가운데: 내전 통계 */}
            {stats && (
              <div className="flex-grow">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-3 text-center">
                    <p className="text-[10px] text-text-tertiary mb-1 uppercase tracking-wider">내전</p>
                    <p className="text-2xl font-bold text-text-primary">{stats.gamesPlayed}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-3 text-center">
                    <p className="text-[10px] text-text-tertiary mb-1 uppercase tracking-wider">승률</p>
                    <p
                      className={cn(
                        "text-2xl font-bold",
                        winRate >= 50 ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {winRate.toFixed(0)}%
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-3 text-center">
                    <p className="text-[10px] text-text-tertiary mb-1 uppercase tracking-wider">승 / 패</p>
                    <p className="text-lg font-bold">
                      <span className="text-emerald-400">{stats.wins}</span>
                      <span className="text-text-tertiary mx-1">/</span>
                      <span className="text-red-400">{stats.losses}</span>
                    </p>
                  </div>
                </div>
                {stats.gamesPlayed > 0 && (
                  <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${winRate}%`,
                        background: "linear-gradient(90deg, #8b5cf6, #6366f1)",
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="w-px bg-white/[0.06] hidden md:block flex-shrink-0" />

            {/* 오른쪽: 포지션 + 챔피언 */}
            <div className="flex gap-6 md:flex-shrink-0">
              {topPositions.length > 0 && (
                <div>
                  <p className="text-[10px] text-text-tertiary mb-2 uppercase tracking-wider">포지션</p>
                  <div className="flex flex-col gap-1.5">
                    {topPositions.map((pos, i) => (
                      <span
                        key={pos.position}
                        className={cn(
                          "px-3 py-1 rounded-lg text-xs font-medium",
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
                  <p className="text-[10px] text-text-tertiary mb-2 uppercase tracking-wider">챔피언</p>
                  <div className="flex gap-3">
                    {topChampions.map((champ) => {
                      const wr =
                        champ.games > 0 ? Math.round((champ.wins / champ.games) * 100) : 0;
                      return (
                        <div key={champ.championId} className="flex flex-col items-center gap-1.5">
                          <Image
                            src={`/icons/champions/${champ.championId}.png`}
                            alt={champ.championName}
                            width={40}
                            height={40}
                            className="rounded-xl border-2 border-white/[0.08]"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                          <span className="text-[10px] text-text-tertiary">{wr}%</span>
                        </div>
                      );
                    })}
                  </div>
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
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-white/[0.08] text-text-tertiary hover:text-violet-400 hover:border-violet-500/30 transition-all duration-200 min-h-[80px]"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs">새 내전 만들기</span>
            </button>
          </div>
        )}
      </div>
    </GlassCard>
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
      {/* 배너 */}
      <div className="relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.06] min-h-[180px] md:min-h-[220px] p-7 md:p-10">
        <div className="max-w-lg space-y-3">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-10 w-32 rounded-xl mt-2" />
        </div>
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

  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [popularPosts, setPopularPosts] = useState<Post[]>([]);
  const [noticePosts, setNoticePosts] = useState<Post[]>([]);
  const [championStats, setChampionStats] = useState<ChampionStat[]>([]);
  const [positionStats, setPositionStats] = useState<PositionStat[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;

    setIsDataLoading(true);
    fetchAccounts();

    const [statsResult, roomsResult, postsResult, noticeResult, champResult, posResult] =
      await Promise.allSettled([
        userApi.getStats(),
        roomApi.getRooms({ status: "WAITING" }),
        communityApi.getPosts({ limit: 20 }),
        communityApi.getPosts({ category: "NOTICE", limit: 5 }),
        statsApi.getUserChampionStats(user.id),
        statsApi.getUserPositionStats(user.id),
      ]);

    if (statsResult.status === "fulfilled") setUserStats(statsResult.value);

    if (roomsResult.status === "fulfilled") {
      const data = roomsResult.value;
      const list = Array.isArray(data) ? data : (data?.rooms ?? data?.data ?? []);
      setRooms(list.slice(0, 6));
    }

    if (postsResult.status === "fulfilled") {
      const data = postsResult.value;
      const arr = Array.isArray(data) ? data : (data?.posts ?? []);
      const sorted = [...arr].sort(
        (a: Post, b: Post) => (b._count?.likes || 0) - (a._count?.likes || 0)
      );
      setPopularPosts(sorted.slice(0, 5));
    }

    if (noticeResult.status === "fulfilled") {
      const data = noticeResult.value;
      const arr = Array.isArray(data) ? data : (data?.posts ?? []);
      setNoticePosts(arr.slice(0, 5));
    }

    if (champResult.status === "fulfilled") {
      const data = champResult.value;
      const list = Array.isArray(data) ? data : (data?.stats ?? data?.data ?? []);
      setChampionStats(list.slice(0, 3));
    }

    if (posResult.status === "fulfilled") {
      const data = posResult.value;
      const list = Array.isArray(data) ? data : (data?.stats ?? data?.data ?? []);
      setPositionStats(list.slice(0, 3));
    }

    setIsDataLoading(false);
  }, [user?.id, fetchAccounts]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAll();
    }
  }, [isAuthenticated, fetchAll]);

  if (isDataLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* 배너 */}
      <BannerCarousel />

      {/* 내 전적 */}
      <MyStatsCard
        stats={userStats}
        primaryAccount={primaryAccount}
        championStats={championStats}
        positionStats={positionStats}
      />

      {/* 모집중인 내전 */}
      <ActiveRoomsCard rooms={rooms} />

      {/* 인기글 + 공지사항 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PopularPostsCard posts={popularPosts} />
        <NoticePostsCard posts={noticePosts} />
      </div>
    </div>
  );
}
