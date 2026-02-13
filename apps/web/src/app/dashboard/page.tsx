"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { useRiotStore } from "@/stores/riot-store";
import { userApi, roomApi, communityApi, statsApi } from "@/lib/api-client";
import { Card, CardContent, Button } from "@/components/ui";
import { TierBadge } from "@/components/domain/TierBadge";
import {
  Trophy,
  Users,
  TrendingUp,
  MessageSquare,
  Swords,
  ChevronRight,
  Target,
  Eye,
  Heart,
  Plus,
  ArrowRight,
  Shield,
  Zap,
  Lock,
  ChevronLeft,
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
  NOTICE: { label: "공지", color: "text-accent-danger" },
  FREE: { label: "자유", color: "text-text-secondary" },
  TIP: { label: "팁", color: "text-accent-gold" },
  QNA: { label: "Q&A", color: "text-accent-primary" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Banner Carousel
// ─────────────────────────────────────────────────────────────────────────────

const BANNER_SLIDES = [
  {
    id: 1,
    gradient: "from-[#1a1f3e] via-[#1e3a5f] to-[#0d2137]",
    accentHex: "#4f9ef8",
    accentBg: "bg-[#4f9ef8]",
    tag: "NEW",
    title: "경매 드래프트 시스템",
    description:
      "실시간 입찰로 팀을 구성하세요. 포인트를 써서 원하는 선수를 영입하는 새로운 경험.",
    link: "/tournaments",
    linkLabel: "내전 만들기",
  },
  {
    id: 2,
    gradient: "from-[#2d1b4e] via-[#3d1a5e] to-[#1a0d2e]",
    accentHex: "#a855f7",
    accentBg: "bg-[#a855f7]",
    tag: "FEATURE",
    title: "Discord 봇 연동",
    description:
      "내전 알림, 음성 채널 자동 이동, 결과 공유까지. Discord 봇이 모든 걸 처리합니다.",
    link: "/profile",
    linkLabel: "설정하기",
  },
  {
    id: 3,
    gradient: "from-[#1a2e1a] via-[#1f3d1f] to-[#0d200d]",
    accentHex: "#4ade80",
    accentBg: "bg-[#4ade80]",
    tag: "UPDATE",
    title: "내전 전적 통계",
    description:
      "모든 내전의 KDA, 챔피언, 포지션 통계를 자동으로 기록. 나의 성장을 한눈에.",
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
        "min-h-[160px] md:min-h-[200px] transition-[background] duration-700"
      )}
    >
      <div className="relative z-10 px-6 py-8 md:px-10 md:py-10">
        <div className="max-w-lg">
          <span
            className="inline-block px-2.5 py-1 rounded-full text-xs font-bold mb-3 border"
            style={{
              backgroundColor: `${slide.accentHex}22`,
              borderColor: `${slide.accentHex}55`,
              color: slide.accentHex,
            }}
          >
            {slide.tag}
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{slide.title}</h2>
          <p className="text-sm md:text-base text-white/70 mb-5 leading-relaxed">
            {slide.description}
          </p>
          <button
            onClick={() => router.push(slide.link)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 active:scale-95",
              slide.accentBg
            )}
          >
            {slide.linkLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Prev */}
      <button
        onClick={() => goTo((current - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length)}
        className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white/70 hover:bg-black/50 hover:text-white transition-colors z-20"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {/* Next */}
      <button
        onClick={() => goTo((current + 1) % BANNER_SLIDES.length)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white/70 hover:bg-black/50 hover:text-white transition-colors z-20"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
        {BANNER_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === current ? "w-6 bg-white" : "w-1.5 bg-white/40"
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
    <Card className="overflow-hidden">
      <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent-primary" />
          <h2 className="text-base font-semibold text-text-primary">내 전적</h2>
        </div>
        <button
          onClick={() => router.push("/profile")}
          className="text-xs text-text-tertiary hover:text-accent-primary transition-colors flex items-center gap-1"
        >
          프로필 <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <CardContent className="p-4">
        {!primaryAccount ? (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center">
              <Shield className="h-6 w-6 text-text-tertiary" />
            </div>
            <p className="text-text-secondary text-sm">
              라이엇 계정을 연동하면 소환사 통계를 볼 수 있어요
            </p>
            <Button size="sm" variant="outline" onClick={() => router.push("/profile")}>
              계정 연동하기
            </Button>
          </div>
        ) : (
          /* 가로 레이아웃 (full-width 카드) */
          <div className="flex flex-col md:flex-row gap-5">
            {/* 왼쪽: 계정 정보 */}
            <div className="flex items-center gap-3 md:w-56 flex-shrink-0">
              <TierBadge tier={primaryAccount.tier} size="lg" />
              <div className="min-w-0">
                <p className="font-semibold text-text-primary truncate">
                  {primaryAccount.gameName}
                  <span className="text-text-tertiary font-normal text-sm">
                    #{primaryAccount.tagLine}
                  </span>
                </p>
                <p className="text-xs text-text-secondary">
                  {primaryAccount.tier} {primaryAccount.rank} · {primaryAccount.lp} LP
                </p>
                <button
                  onClick={() =>
                    router.push(
                      `/matches/summoner/${encodeURIComponent(primaryAccount.gameName)}/${encodeURIComponent(primaryAccount.tagLine)}`
                    )
                  }
                  className="text-[11px] text-text-tertiary hover:text-accent-primary transition-colors flex items-center gap-0.5 mt-1"
                >
                  전적 상세 <ChevronRight className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>

            <div className="w-px bg-bg-elevated hidden md:block flex-shrink-0" />

            {/* 가운데: 내전 통계 */}
            {stats && (
              <div className="flex-grow">
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="bg-bg-tertiary rounded-lg p-2.5 text-center">
                    <p className="text-xs text-text-tertiary mb-1">내전 수</p>
                    <p className="text-xl font-bold text-text-primary">{stats.gamesPlayed}</p>
                  </div>
                  <div className="bg-bg-tertiary rounded-lg p-2.5 text-center">
                    <p className="text-xs text-text-tertiary mb-1">승률</p>
                    <p
                      className={cn(
                        "text-xl font-bold",
                        winRate >= 50 ? "text-accent-success" : "text-accent-danger"
                      )}
                    >
                      {winRate.toFixed(0)}%
                    </p>
                  </div>
                  <div className="bg-bg-tertiary rounded-lg p-2.5 text-center">
                    <p className="text-xs text-text-tertiary mb-1">승 / 패</p>
                    <p className="text-base font-bold">
                      <span className="text-accent-success">{stats.wins}</span>
                      <span className="text-text-tertiary"> / </span>
                      <span className="text-accent-danger">{stats.losses}</span>
                    </p>
                  </div>
                </div>
                {stats.gamesPlayed > 0 && (
                  <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-success rounded-full"
                      style={{ width: `${winRate}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="w-px bg-bg-elevated hidden md:block flex-shrink-0" />

            {/* 오른쪽: 포지션 + 챔피언 */}
            <div className="flex gap-6 md:flex-shrink-0">
              {topPositions.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary mb-2">선호 포지션</p>
                  <div className="flex flex-col gap-1">
                    {topPositions.map((pos, i) => (
                      <span
                        key={pos.position}
                        className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-medium",
                          i === 0
                            ? "bg-accent-primary/20 text-accent-primary"
                            : "bg-bg-tertiary text-text-secondary"
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
                  <p className="text-xs text-text-tertiary mb-2">모스트 챔피언</p>
                  <div className="flex gap-3">
                    {topChampions.map((champ) => {
                      const wr =
                        champ.games > 0 ? Math.round((champ.wins / champ.games) * 100) : 0;
                      return (
                        <div key={champ.championId} className="flex flex-col items-center gap-1">
                          <Image
                            src={`https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/${champ.championId}.png`}
                            alt={champ.championName}
                            width={40}
                            height={40}
                            className="rounded-full border-2 border-bg-elevated"
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
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Rooms Card
// ─────────────────────────────────────────────────────────────────────────────

function ActiveRoomsCard({ rooms }: { rooms: Room[] }) {
  const router = useRouter();

  return (
    <Card className="overflow-hidden h-full">
      <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-accent-gold" />
          <h2 className="text-base font-semibold text-text-primary">모집중인 내전</h2>
        </div>
        <button
          onClick={() => router.push("/tournaments")}
          className="text-xs text-text-tertiary hover:text-accent-primary transition-colors flex items-center gap-1"
        >
          전체 <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <CardContent className="p-4">
        {rooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
            <Swords className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">모집 중인 내전이 없습니다</p>
            <Button size="sm" onClick={() => router.push("/tournaments")}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              방 만들기
            </Button>
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
                  className="flex flex-col gap-2 p-3 bg-bg-tertiary rounded-xl hover:bg-bg-elevated cursor-pointer transition-colors border border-transparent hover:border-accent-primary/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {room.isPrivate && (
                        <Lock className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                      )}
                      <p className="text-sm font-medium text-text-primary truncate">
                        {room.name}
                      </p>
                    </div>
                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent-primary/10 text-accent-primary">
                      {TEAM_MODE_LABEL[room.teamMode] ?? room.teamMode}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-grow h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          isFull
                            ? "bg-accent-danger"
                            : fillRatio > 0.7
                            ? "bg-accent-gold"
                            : "bg-accent-success"
                        )}
                        style={{ width: `${fillRatio * 100}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium flex-shrink-0 tabular-nums",
                        isFull ? "text-accent-danger" : "text-text-secondary"
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
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-dashed border-bg-elevated text-text-tertiary hover:text-accent-primary hover:border-accent-primary/50 transition-colors min-h-[72px]"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs">새 내전 만들기</span>
            </button>
          </div>
        )}
      </CardContent>
    </Card>
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
    <Card className="overflow-hidden h-full">
      <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-accent-success" />
          <h2 className="text-base font-semibold text-text-primary">인기글</h2>
        </div>
        <button
          onClick={() => router.push("/community")}
          className="text-xs text-text-tertiary hover:text-accent-primary transition-colors flex items-center gap-1"
        >
          커뮤니티 <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <CardContent className="p-0">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <MessageSquare className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">게시글이 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-bg-elevated">
            {posts.map((post, i) => {
              const cfg = CATEGORY_CONFIG[post.category];
              return (
                <div
                  key={post.id}
                  onClick={() => router.push(`/community/${post.id}`)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-bg-tertiary cursor-pointer transition-colors"
                >
                  {/* Rank */}
                  <span
                    className={cn(
                      "flex-shrink-0 w-5 text-center text-xs font-bold",
                      i === 0
                        ? "text-accent-gold"
                        : i === 1
                        ? "text-[#C0C0C0]"
                        : i === 2
                        ? "text-[#CD7F32]"
                        : "text-text-tertiary"
                    )}
                  >
                    {i + 1}
                  </span>

                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={cn("text-[10px] font-medium flex-shrink-0", cfg.color)}>
                        [{cfg.label}]
                      </span>
                      <p className="text-sm text-text-primary truncate">{post.title}</p>
                      {(post._count?.comments || 0) > 0 && (
                        <span className="text-accent-primary text-xs flex-shrink-0">
                          [{post._count?.comments}]
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                      <span>{post.author.username}</span>
                      <span>·</span>
                      <span className="flex items-center gap-0.5">
                        <Heart className="h-2.5 w-2.5" />
                        {post._count?.likes || 0}
                      </span>
                      <span>·</span>
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

        <div className="px-4 py-3 border-t border-bg-elevated">
          <button
            onClick={() => router.push("/community/write")}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-bg-elevated text-text-tertiary hover:text-accent-primary hover:border-accent-primary/50 text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            글쓰기
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Notice Posts Card
// ─────────────────────────────────────────────────────────────────────────────

function NoticePostsCard({ posts }: { posts: Post[] }) {
  const router = useRouter();

  return (
    <Card className="overflow-hidden h-full">
      <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-accent-danger" />
          <h2 className="text-base font-semibold text-text-primary">공지사항</h2>
        </div>
        <button
          onClick={() => router.push("/community?category=NOTICE")}
          className="text-xs text-text-tertiary hover:text-accent-primary transition-colors flex items-center gap-1"
        >
          전체 <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <CardContent className="p-0">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <MessageSquare className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm text-text-secondary">공지사항이 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-bg-elevated">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => router.push(`/community/${post.id}`)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-bg-tertiary cursor-pointer transition-colors"
              >
                <div className="flex-grow min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{post.title}</p>
                  <div className="flex items-center gap-2 text-[10px] text-text-tertiary mt-0.5">
                    <span>{post.author.username}</span>
                    <span>·</span>
                    <span>{formatRelativeDate(post.createdAt)}</span>
                  </div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Actions Card
// ─────────────────────────────────────────────────────────────────────────────

function QuickActionsCard() {
  const actions = [
    {
      icon: Swords,
      label: "내전 참가",
      desc: "모집중인 방 목록",
      href: "/tournaments",
      color: "text-accent-gold",
      bg: "bg-accent-gold/10",
    },
    {
      icon: Plus,
      label: "내전 만들기",
      desc: "새 내전 방 개설",
      href: "/tournaments",
      color: "text-accent-primary",
      bg: "bg-accent-primary/10",
    },
    {
      icon: Trophy,
      label: "내전 전적",
      desc: "경기 기록 확인",
      href: "/matches",
      color: "text-accent-success",
      bg: "bg-accent-success/10",
    },
    {
      icon: Users,
      label: "클랜",
      desc: "클랜 활동 확인",
      href: "/clans",
      color: "text-accent-danger",
      bg: "bg-accent-danger/10",
    },
    {
      icon: MessageSquare,
      label: "커뮤니티",
      desc: "자유게시판 · 팁",
      href: "/community",
      color: "text-text-secondary",
      bg: "bg-bg-elevated",
    },
    {
      icon: Target,
      label: "내 프로필",
      desc: "계정 및 설정",
      href: "/profile",
      color: "text-accent-primary",
      bg: "bg-accent-primary/10",
    },
  ];

  return (
    <Card className="overflow-hidden h-full">
      <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3 flex items-center gap-2">
        <Zap className="h-5 w-5 text-accent-gold" />
        <h2 className="text-base font-semibold text-text-primary">빠른 메뉴</h2>
      </div>
      <CardContent className="p-3">
        <div className="grid grid-cols-2 gap-1">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-bg-tertiary transition-colors group"
              >
                <div className={cn("p-2 rounded-lg flex-shrink-0", action.bg)}>
                  <Icon className={cn("h-4 w-4", action.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary group-hover:text-accent-primary transition-colors leading-tight">
                    {action.label}
                  </p>
                  <p className="text-[10px] text-text-tertiary truncate">{action.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { primaryAccount, fetchAccounts } = useRiotStore();

  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [popularPosts, setPopularPosts] = useState<Post[]>([]);
  const [noticePosts, setNoticePosts] = useState<Post[]>([]);
  const [championStats, setChampionStats] = useState<ChampionStat[]>([]);
  const [positionStats, setPositionStats] = useState<PositionStat[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;

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

    if (statsResult.status === "fulfilled") {
      setUserStats(statsResult.value);
    }

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
  }, [user?.id, fetchAccounts]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAll();
    }
  }, [isAuthenticated, fetchAll]);

  if (authLoading || !isAuthenticated) return null;

  return (
    <div className="flex-grow p-4 md:p-6 animate-fade-in">
      <div className="container mx-auto max-w-7xl space-y-5">
        {/* 배너 */}
        <BannerCarousel />

        {/* Row 1: 내 전적 (전체) */}
        <MyStatsCard
          stats={userStats}
          primaryAccount={primaryAccount}
          championStats={championStats}
          positionStats={positionStats}
        />

        {/* Row 2: 모집중인 내전 (전체) */}
        <ActiveRoomsCard rooms={rooms} />

        {/* Row 3: 인기글 (1/2) + 공지사항 (1/2) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <PopularPostsCard posts={popularPosts} />
          <NoticePostsCard posts={noticePosts} />
        </div>
      </div>
    </div>
  );
}
