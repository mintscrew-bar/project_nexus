"use client";

// 개발용 프리뷰 — PlayerHoverCard 목업 확인 페이지
// 접속: http://localhost:3000/dev/hover-card

import Image from "next/image";
import { Activity, ArrowRight, ShieldCheck, TrendingUp, Users } from "lucide-react";
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
  kda: { kills: number; deaths: number; assists: number } | null;
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
    kda: { kills: 5.2, deaths: 3.1, assists: 7.8 },
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
    kda: { kills: 3.8, deaths: 4.2, assists: 6.1 },
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
    kda: { kills: 8.1, deaths: 2.3, assists: 9.4 },
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
    kda: null,
    rating: 0,
    ratingCount: 0,
    clan: null,
  },
];

const ACCENT = "#667EEA";

const TIER_COLOR: Record<string, string> = {
  CHALLENGER: "#F59E0B", GRANDMASTER: "#F43F5E", MASTER: "#A855F7",
  DIAMOND: "#22D3EE", PLATINUM: "#2DD4BF", EMERALD: "#10B981",
  GOLD: "#EAB308", SILVER: "#94A3B8", BRONZE: "#F97316", IRON: "#78716C",
};

function formatOne(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function WinRateStatCard({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  const rate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const tone =
    total === 0
      ? { text: "text-zinc-500" }
      : rate >= 60
        ? { text: "text-emerald-300" }
        : rate >= 50
          ? { text: "text-sky-300" }
          : { text: "text-rose-300" };

  return (
    <section className="flex min-h-[96px] flex-col rounded-xl bg-[#181818] p-3">
      <div className="flex h-4 items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <TrendingUp className="h-3.5 w-3.5" />
          승률
        </div>
        <span className="text-[10px] text-zinc-600">{total > 0 ? `${total}게임` : "전적 없음"}</span>
      </div>

      <p className={`mt-3 text-center text-[30px] font-black leading-none tracking-[-0.01em] ${tone.text}`}>
        {total > 0 ? `${rate}%` : "-"}
      </p>
      <p className="mt-2 text-center text-[11px] font-bold leading-none text-zinc-400">
        {total > 0 ? (
          <>
            {wins}승 <span className="text-zinc-600">{losses}패</span>
          </>
        ) : (
          "전적 없음"
        )}
      </p>
    </section>
  );
}

function KdaStatCard({
  kda,
}: {
  kda: { kills: number; deaths: number; assists: number } | null;
}) {
  const ratio = kda ? (kda.kills + kda.assists) / Math.max(kda.deaths, 1) : null;

  return (
    <section className="flex min-h-[96px] flex-col rounded-xl bg-[#181818] p-3">
      <div className="flex h-4 items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <Activity className="h-3.5 w-3.5" />
          KDA
        </div>
        <span className="text-[10px] font-bold leading-none text-emerald-300">
          평균
        </span>
      </div>

      <p className="mt-3 text-center text-[30px] font-black leading-none tracking-[-0.01em] text-white">
        {ratio ? ratio.toFixed(2) : "-"}
      </p>
      <p className="mt-2 text-center text-[11px] font-bold leading-none text-zinc-400">
        {kda ? (
          <>
            {formatOne(kda.kills)} /{" "}
            <span className="text-rose-400">{formatOne(kda.deaths)}</span> /{" "}
            {formatOne(kda.assists)}
          </>
        ) : (
          "기록 없음"
        )}
      </p>
    </section>
  );
}

function ReputationStatCard({ value, count }: { value: number; count: number }) {
  return (
    <section className="rounded-xl bg-[#181818] p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5" />
          신뢰도
        </div>
        <span className="text-[10px] text-zinc-600">
          {count > 0 ? `${count}개 평가` : "평가 없음"}
        </span>
      </div>

      {count > 0 ? (
        <div className="flex items-center justify-between">
          <RatingStars value={value} />
          <span className="text-base font-black text-white">
            {value.toFixed(1)}
          </span>
        </div>
      ) : (
        <p className="text-sm font-semibold text-zinc-500">아직 받은 평가가 없습니다</p>
      )}
    </section>
  );
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="text-sm text-yellow-400">
      {"★".repeat(rounded)}<span className="text-zinc-700">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

function HoverCardPreview({ p }: { p: typeof MOCK_PROFILES[number] }) {
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
      className="w-[300px] overflow-hidden rounded-[18px] bg-[#101010] text-white shadow-[0_32px_70px_rgba(0,0,0,0.82)]"
      style={{
        border: `1px solid ${ACCENT}66`,
        boxShadow: `0 32px 70px rgba(0,0,0,0.82), 0 0 0 1px ${ACCENT}18`,
      }}
    >
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* 아바타 원형 + 티어 링 */}
          <div
            className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-[#171717]"
            style={{ border: `2px solid ${hasTier ? ACCENT + "88" : "rgba(255,255,255,0.14)"}` }}
          >
            {p.avatar ? (
              <Image src={p.avatar} alt={p.username} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#171717]">
                <Users className="h-8 w-8 text-zinc-500" />
              </div>
            )}
          </div>

          {/* 이름 + 클랜 + 티어 */}
          <div className="min-w-0 flex-1 pt-0.5">
            {/* 디스코드 닉네임 (메인) + 클랜 태그 */}
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-black leading-tight text-white">{p.username}</p>
              {p.clan?.tag && (
                <span
                  className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black leading-none"
                  style={{ color: ACCENT, backgroundColor: `${ACCENT}22` }}
                >
                  {p.clan.tag}
                </span>
              )}
            </div>

            {/* 롤 닉네임 (서브) */}
            {hasRiot && (
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {p.gameName}<span className="text-zinc-600"> #{p.tagLine}</span>
              </p>
            )}

            {/* 현재 티어 */}
            {hasTier && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-sm font-black" style={{ color: TIER_COLOR[p.tier!] ?? ACCENT }}>
                  {TIER_KO[p.tier!] ?? p.tier}
                  {!isApexTier && p.rank ? ` ${p.rank}` : ""}
                </span>
                {p.lp != null && (
                  <span className="text-xs font-bold text-zinc-200">{p.lp} LP</span>
                )}
              </div>
            )}
            {/* 최고 티어 */}
            {p.peakTier && p.peakTier !== "UNRANKED" && (
              <div className="mt-0.5 flex items-center gap-1">
                <span className="text-[10px] text-zinc-600">최고</span>
                <span className="text-[11px] font-semibold text-zinc-400">
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
              <div className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5">
                <PositionIcon position={p.mainRole} className="!h-4 !w-4" />
                <span className="text-xs font-bold text-white">{POSITION_LABELS[p.mainRole] || p.mainRole}</span>
                <span className="rounded bg-[#262626] px-1 text-[9px] font-black text-zinc-600">주</span>
              </div>
            )}
            {p.subRole && (
              <div className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5">
                <PositionIcon position={p.subRole} className="!h-4 !w-4" opacity={0.6} />
                <span className="text-xs font-semibold text-zinc-400">{POSITION_LABELS[p.subRole] || p.subRole}</span>
                <span className="rounded bg-[#262626] px-1 text-[9px] font-black text-zinc-600">부</span>
              </div>
            )}
          </div>
        )}

        {/* 승률 / KDA */}
        <div className="grid grid-cols-2 gap-2">
          <WinRateStatCard wins={p.wins} losses={p.losses} />
          <KdaStatCard kda={p.kda} />
        </div>

        {/* 선호 챔피언 */}
        {hasChampions && (
          <div className="rounded-xl bg-[#181818] px-3 py-3">
            <p className="mb-2 text-[10px] font-medium text-zinc-600">선호 챔피언</p>
            <div className="space-y-2">
              {rolesToShow.map((role) => {
                const ids = champsByRole[role] ?? [];
                if (!ids.length) return null;
                const label = role === p.mainRole ? "주" : role === p.subRole ? "부" : null;
                return (
                  <div key={role} className="flex items-center gap-2">
                    <div className="flex w-12 shrink-0 items-center gap-1">
                      <PositionIcon position={role} className="!h-3.5 !w-3.5 opacity-70" />
                      {label && <span className="text-[9px] font-black text-zinc-500">{label}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {ids.slice(0, 5).map((id, i) => <ChampionIcon key={i} championId={id} size={25} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 신뢰도 */}
        <ReputationStatCard value={p.rating} count={p.ratingCount} />

        {!hasRiot && (
          <p className="text-xs italic text-zinc-500">등록된 라이엇 계정이 없습니다</p>
        )}

        <button
          type="button"
          className="group flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-black text-white transition-all hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${ACCENT}CC, ${ACCENT}88)` }}
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
