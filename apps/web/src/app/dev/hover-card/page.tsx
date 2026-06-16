"use client";

// 개발용 프리뷰 — PlayerHoverCard 목업 확인 페이지
// 접속: http://localhost:3000/dev/hover-card

import Image from "next/image";
import { ArrowRight, Users } from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { PositionIcon, POSITION_LABELS, ChampionIcon } from "@/app/tournaments/[id]/lobby/_components/icons";

type Tier = "CHALLENGER" | "GRANDMASTER" | "MASTER" | "DIAMOND" | "PLATINUM" | "EMERALD" | "GOLD" | "SILVER" | "BRONZE" | "IRON" | null;

const MOCK_PROFILES: Array<{
  tier: Tier;
  rank: string;
  lp?: number;
  gameName: string;
  tagLine: string;
  username: string;
  peakTier: string;
  peakLp?: number;
  avatar: string | null;
  mainRole: string;
  subRole: string;
  champions: Array<{ role: string; ids: string[] }>;
  wins: number;
  losses: number;
  rating: number;
  ratingCount: number;
  clan: { tag: string; name: string } | null;
}> = [
  {
    tier: "DIAMOND",
    rank: "IV",
    lp: 64,
    gameName: "진혁",
    tagLine: "진혁",
    username: "mintscrew",
    peakTier: "DIAMOND",
    avatar: null,
    mainRole: "TOP",
    subRole: "JUNGLE",
    champions: [
      { role: "TOP", ids: ["Darius", "Garen", "Sett", "Mordekaiser", "Fiora"] },
      { role: "JUNGLE", ids: ["Vi", "Warwick", "Hecarim"] },
      { role: "MID", ids: ["Galio"] },
    ],
    wins: 48,
    losses: 39,
    rating: 4.2,
    ratingCount: 17,
    clan: { tag: "NXS", name: "Nexus 공식" },
  },
  {
    tier: "GOLD",
    rank: "II",
    lp: 33,
    gameName: "하루",
    tagLine: "KR1",
    username: "harudev",
    peakTier: "PLATINUM",
    avatar: null,
    mainRole: "MID",
    subRole: "BOTTOM",
    champions: [
      { role: "MID", ids: ["Zed", "Akali", "Yasuo", "Syndra", "Orianna"] },
      { role: "BOTTOM", ids: ["Jinx", "Caitlyn", "Ezreal", "Jhin", "Aphelios"] },
      { role: "SUPPORT", ids: ["Lulu", "Thresh"] },
    ],
    wins: 102,
    losses: 98,
    rating: 3.8,
    ratingCount: 42,
    clan: null,
  },
  {
    tier: "MASTER",
    rank: "",
    lp: 412,
    gameName: "고수유저",
    tagLine: "KR1",
    username: "master_kr",
    peakTier: "GRANDMASTER",
    peakLp: 890,
    avatar: null,
    mainRole: "MID",
    subRole: "",
    champions: [
      { role: "MID", ids: ["Azir", "Ryze", "Orianna", "LeBlanc", "Syndra"] },
    ],
    wins: 312,
    losses: 198,
    rating: 5,
    ratingCount: 289,
    clan: { tag: "T1", name: "T1 공식" },
  },
  {
    tier: null,
    rank: "",
    gameName: "",
    tagLine: "",
    username: "newbie2024",
    peakTier: "",
    avatar: null,
    mainRole: "",
    subRole: "",
    champions: [],
    wins: 0,
    losses: 0,
    rating: 0,
    ratingCount: 0,
    clan: null,
  },
];

function getTierTheme(tier?: string | null): { gradient: string; accent: string } {
  switch (tier) {
    case "CHALLENGER":  return { gradient: "from-amber-400 via-yellow-300 to-amber-500",   accent: "#F59E0B" };
    case "GRANDMASTER": return { gradient: "from-rose-500 via-rose-400 to-red-600",         accent: "#F43F5E" };
    case "MASTER":      return { gradient: "from-purple-500 via-violet-400 to-purple-700",  accent: "#A855F7" };
    case "DIAMOND":     return { gradient: "from-cyan-400 via-sky-300 to-cyan-600",         accent: "#22D3EE" };
    case "PLATINUM":    return { gradient: "from-teal-400 via-teal-300 to-teal-600",        accent: "#2DD4BF" };
    case "EMERALD":     return { gradient: "from-emerald-400 via-green-300 to-emerald-600", accent: "#10B981" };
    case "GOLD":        return { gradient: "from-yellow-400 via-amber-300 to-yellow-600",   accent: "#F59E0B" };
    case "SILVER":      return { gradient: "from-slate-300 via-slate-200 to-slate-500",     accent: "#94A3B8" };
    case "BRONZE":      return { gradient: "from-orange-600 via-orange-500 to-orange-800",  accent: "#F97316" };
    case "IRON":        return { gradient: "from-stone-400 via-stone-300 to-stone-600",     accent: "#78716C" };
    default:            return { gradient: "from-zinc-600 via-zinc-500 to-zinc-700",        accent: "#6366F1" };
  }
}

function WinRateBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return <span className="text-xs text-text-muted">전적 없음</span>;
  const rate = Math.round((wins / total) * 100);
  const color = rate >= 60 ? "bg-emerald-400" : rate >= 50 ? "bg-blue-400" : "bg-rose-400";
  const textColor = rate >= 60 ? "text-emerald-400" : rate >= 50 ? "text-blue-400" : "text-rose-400";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-text-secondary">{wins}승 {losses}패</span>
        <span className={`text-sm font-bold ${textColor}`}>{rate}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
    </div>
  );
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="text-xs text-yellow-400">
      {"★".repeat(rounded)}
      <span className="text-text-muted/40">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

function HoverCardPreview({ p }: { p: typeof MOCK_PROFILES[number] }) {
  const theme = getTierTheme(p.tier);
  const hasRoles = p.mainRole || p.subRole;
  const hasChampions = p.champions.length > 0;
  const hasRiot = !!p.gameName;

  return (
    <div className="w-[300px] overflow-hidden rounded-2xl border border-white/8 bg-bg-elevated shadow-[0_32px_64px_rgba(0,0,0,0.7)]">
      {/* 아이덴티티 */}
      <div className="px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-bg-secondary px-3 py-2.5">
          <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-white/8 shadow-lg">
            <div className="flex h-full w-full items-center justify-center bg-bg-tertiary">
              <Users className="h-7 w-7 text-text-tertiary" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            {hasRiot ? (
              <>
                <p className="truncate text-sm font-bold leading-tight text-text-primary">
                  {p.gameName}
                  <span className="font-normal text-text-muted">#{p.tagLine}</span>
                </p>
                <p className="mt-0.5 truncate text-[11px] text-text-tertiary">@{p.username}</p>
              </>
            ) : (
              <p className="truncate text-sm font-bold text-text-primary">{p.username}</p>
            )}
          </div>
        </div>

        {!hasRiot && (
          <p className="mb-3 text-xs italic text-text-muted">등록된 라이엇 계정이 없습니다</p>
        )}

        {/* 티어 + 최고티어 */}
        {p.tier && (
          <div className="mb-3 flex gap-2">
            <div className="flex-1 rounded-lg bg-bg-secondary px-3 py-2">
              <p className="mb-0.5 text-[10px] font-medium text-text-muted">현재 티어</p>
              <p className="text-sm font-bold text-text-primary">
                {p.tier}{p.rank ? ` ${p.rank}` : ""}{p.lp != null ? ` ${p.lp}LP` : ""}
              </p>
            </div>
            {p.peakTier && (
              <div className="flex-1 rounded-lg bg-bg-secondary px-3 py-2">
                <p className="mb-0.5 text-[10px] font-medium text-text-muted">최고 티어</p>
                <p className="text-sm font-bold text-text-secondary">
                  {p.peakTier}{p.peakLp != null ? ` ${p.peakLp}LP` : ""}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 전적 + 신뢰도 + 클랜 */}
        <div className="mb-3 space-y-2.5 rounded-xl bg-bg-secondary p-3">
          <WinRateBar wins={p.wins} losses={p.losses} />
          {p.ratingCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">신뢰도</span>
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                <RatingStars value={p.rating} />
                <span>{p.rating.toFixed(1)}</span>
                <span className="text-text-muted">({p.ratingCount})</span>
              </span>
            </div>
          )}
          {p.clan && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-tertiary">클랜</span>
              <span className="text-xs font-medium" style={{ color: theme.accent }}>
                {p.clan.tag ? `[${p.clan.tag}] ` : ""}{p.clan.name}
              </span>
            </div>
          )}
        </div>

        {/* 포지션 */}
        {hasRoles && (
          <div className="mb-3 flex items-center gap-2">
            {p.mainRole && (
              <div className="flex items-center gap-1.5 rounded-lg bg-bg-secondary px-2.5 py-1.5">
                <PositionIcon position={p.mainRole} className="!h-4 !w-4" />
                <span className="text-xs font-semibold text-text-primary">{POSITION_LABELS[p.mainRole] || p.mainRole}</span>
                <span className="rounded bg-bg-tertiary px-1 text-[9px] font-bold text-text-muted">주</span>
              </div>
            )}
            {p.subRole && (
              <div className="flex items-center gap-1.5 rounded-lg bg-bg-secondary px-2.5 py-1.5">
                <PositionIcon position={p.subRole} className="!h-4 !w-4" opacity={0.6} />
                <span className="text-xs text-text-secondary">{POSITION_LABELS[p.subRole] || p.subRole}</span>
                <span className="rounded bg-bg-tertiary px-1 text-[9px] font-bold text-text-muted">부</span>
              </div>
            )}
          </div>
        )}

        {/* 선호 챔피언 */}
        {hasChampions && (
          <div className="mb-3 rounded-lg bg-bg-secondary px-3 py-2.5">
            <p className="mb-2 text-[10px] font-medium text-text-muted">선호 챔피언</p>
            <div className="space-y-1.5">
              {p.champions.map(({ role, ids }) => (
                <div key={role} className="flex items-center gap-2">
                  <PositionIcon position={role} className="!h-3.5 !w-3.5 flex-shrink-0 opacity-50" />
                  <div className="flex items-center gap-1">
                    {ids.slice(0, 5).map((id, i) => <ChampionIcon key={i} championId={id} size={28} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 버튼 */}
      <div className="px-4 pb-4">
        <button
          type="button"
          className="group flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition-all"
          style={{ background: `linear-gradient(135deg, ${theme.accent}CC, ${theme.accent}99)` }}
        >
          프로필 보기
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

export default function HoverCardDevPage() {
  return (
    <div className="min-h-screen bg-bg-primary px-8 py-12">
      <div className="mb-8">
        <p className="text-xs font-mono text-text-muted">개발 프리뷰 · /dev/hover-card</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">PlayerHoverCard</h1>
      </div>
      <div className="flex flex-wrap gap-6">
        {MOCK_PROFILES.map((p, i) => (
          <HoverCardPreview key={i} p={p} />
        ))}
      </div>
    </div>
  );
}
