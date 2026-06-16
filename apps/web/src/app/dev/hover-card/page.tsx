"use client";

// 개발용 프리뷰 — PlayerHoverCard 목업 확인 페이지
// 접속: http://localhost:3000/dev/hover-card

import Image from "next/image";
import { ArrowRight, Users } from "lucide-react";
import { PositionIcon, POSITION_LABELS, ChampionIcon } from "@/app/tournaments/[id]/lobby/_components/icons";

type Tier = "CHALLENGER" | "GRANDMASTER" | "MASTER" | "DIAMOND" | "PLATINUM" | "EMERALD" | "GOLD" | "SILVER" | "BRONZE" | "IRON" | null;

const TIER_KO: Record<string, string> = {
  CHALLENGER: "챌린저", GRANDMASTER: "그랜드마스터", MASTER: "마스터",
  DIAMOND: "다이아몬드", PLATINUM: "플래티넘", EMERALD: "에메랄드",
  GOLD: "골드", SILVER: "실버", BRONZE: "브론즈", IRON: "아이언",
};

const MOCK_PROFILES: Array<{
  tier: Tier;
  rank: string;
  lp?: number;
  gameName: string;
  tagLine: string;
  username: string;
  peakTier: string;
  peakRank?: string;
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
    peakTier: "MASTER",
    peakLp: 124,
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
    peakRank: "II",
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

function getTierTheme(tier?: string | null): { accent: string } {
  switch (tier) {
    case "CHALLENGER":  return { accent: "#F59E0B" };
    case "GRANDMASTER": return { accent: "#F43F5E" };
    case "MASTER":      return { accent: "#A855F7" };
    case "DIAMOND":     return { accent: "#22D3EE" };
    case "PLATINUM":    return { accent: "#2DD4BF" };
    case "EMERALD":     return { accent: "#10B981" };
    case "GOLD":        return { accent: "#F59E0B" };
    case "SILVER":      return { accent: "#94A3B8" };
    case "BRONZE":      return { accent: "#F97316" };
    case "IRON":        return { accent: "#78716C" };
    default:            return { accent: "#6366F1" };
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
      {"★".repeat(rounded)}<span className="text-text-muted/40">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

function HoverCardPreview({ p }: { p: typeof MOCK_PROFILES[number] }) {
  const theme = getTierTheme(p.tier);
  const hasRiot = !!p.gameName;
  const hasChampions = p.champions.length > 0;
  const isApexTier = p.tier && ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(p.tier);
  const hasTier = !!p.tier;

  // 주/부 우선, 나머지 뒤로
  const champsByRole: Record<string, string[]> = {};
  for (const { role, ids } of p.champions) champsByRole[role] = ids;
  const rolesToShow: string[] = [];
  if (p.mainRole) rolesToShow.push(p.mainRole);
  if (p.subRole && p.subRole !== p.mainRole) rolesToShow.push(p.subRole);
  for (const role of Object.keys(champsByRole)) {
    if (!rolesToShow.includes(role)) rolesToShow.push(role);
  }

  return (
    <div
      className="w-[300px] overflow-hidden rounded-2xl bg-bg-primary shadow-[0_32px_64px_rgba(0,0,0,0.8)]"
      style={{ border: `1px solid ${theme.accent}35` }}
    >
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* 아바타 원형 + 티어 링 */}
          <div
            className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full"
            style={{ border: `2px solid ${hasTier ? theme.accent + "70" : "rgba(255,255,255,0.1)"}` }}
          >
            {p.avatar ? (
              <Image src={p.avatar} alt={p.username} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-bg-tertiary">
                <Users className="h-8 w-8 text-text-tertiary" />
              </div>
            )}
          </div>

          {/* 이름 + 클랜 + 티어 */}
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-start justify-between gap-1.5">
              <p className="truncate text-sm font-bold leading-tight text-text-primary">
                {hasRiot ? (
                  <>{p.gameName}<span className="font-normal text-text-muted"> #{p.tagLine}</span></>
                ) : p.username}
              </p>
              {p.clan?.tag && (
                <span
                  className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none"
                  style={{ color: theme.accent, backgroundColor: `${theme.accent}22` }}
                >
                  {p.clan.tag}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-text-tertiary">@{p.username}</p>

            {/* 현재 티어 */}
            {hasTier && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-sm font-bold" style={{ color: theme.accent }}>
                  {TIER_KO[p.tier!] ?? p.tier}
                  {!isApexTier && p.rank ? ` ${p.rank}` : ""}
                </span>
                {p.lp != null && (
                  <span className="text-xs font-semibold text-text-secondary">{p.lp} LP</span>
                )}
              </div>
            )}
            {/* 최고 티어 */}
            {p.peakTier && p.peakTier !== "UNRANKED" && (
              <div className="mt-0.5 flex items-center gap-1">
                <span className="text-[10px] text-text-muted">최고</span>
                <span className="text-[11px] font-semibold text-text-secondary">
                  {TIER_KO[p.peakTier] ?? p.peakTier}
                  {p.peakRank && !["MASTER","GRANDMASTER","CHALLENGER"].includes(p.peakTier) ? ` ${p.peakRank}` : ""}
                  {p.peakLp != null && ["MASTER","GRANDMASTER","CHALLENGER"].includes(p.peakTier) ? ` ${p.peakLp}LP` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-2.5">
        {/* 선호 라인 */}
        {(p.mainRole || p.subRole) && (
          <div className="flex items-center gap-2">
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
          <div className="rounded-xl bg-bg-secondary px-3 py-2.5">
            <p className="mb-2 text-[10px] font-medium text-text-muted">선호 챔피언</p>
            <div className="space-y-2">
              {rolesToShow.map((role) => {
                const ids = champsByRole[role] ?? [];
                if (!ids.length) return null;
                const label = role === p.mainRole ? "주" : role === p.subRole ? "부" : null;
                return (
                  <div key={role} className="flex items-center gap-2">
                    <div className="flex w-12 shrink-0 items-center gap-1">
                      <PositionIcon position={role} className="!h-3.5 !w-3.5 opacity-50" />
                      {label && <span className="text-[9px] font-bold text-text-muted">{label}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {ids.slice(0, 5).map((id, i) => <ChampionIcon key={i} championId={id} size={26} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 전적 + 신뢰도 */}
        <div className="rounded-xl bg-bg-secondary p-3 space-y-2">
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
        </div>

        {!hasRiot && (
          <p className="text-xs italic text-text-muted">등록된 라이엇 계정이 없습니다</p>
        )}

        <button
          type="button"
          className="group flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition-all"
          style={{ background: `linear-gradient(135deg, ${theme.accent}CC, ${theme.accent}88)` }}
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
