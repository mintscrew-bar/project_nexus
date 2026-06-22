"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { Activity, ArrowRight, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { userApi } from "@/lib/api-client";
import { ChampionIcon, PositionIcon, POSITION_LABELS } from "@/app/tournaments/[id]/lobby/_components/icons";

interface PlayerHoverCardProps {
  userId: string;
  anchorRect: DOMRect;
  onOpenProfile: (userId: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const ACCENT = "#667EEA"; // 사이트 메인 accent (로고 인디고)

const TIER_COLOR: Record<string, string> = {
  CHALLENGER: "#F59E0B", GRANDMASTER: "#F43F5E", MASTER: "#A855F7",
  DIAMOND: "#22D3EE", PLATINUM: "#2DD4BF", EMERALD: "#10B981",
  GOLD: "#EAB308", SILVER: "#94A3B8", BRONZE: "#F97316", IRON: "#78716C",
};

const TIER_KO: Record<string, string> = {
  CHALLENGER: "챌린저", GRANDMASTER: "그랜드마스터", MASTER: "마스터",
  DIAMOND: "다이아몬드", PLATINUM: "플래티넘", EMERALD: "에메랄드",
  GOLD: "골드", SILVER: "실버", BRONZE: "브론즈", IRON: "아이언",
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
  kda: { kills: number; deaths: number; assists: number; games?: number } | null;
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
      {kda?.games ? (
        <p className="mt-1 text-[10px] text-zinc-600">{kda.games}게임 기준</p>
      ) : null}
    </section>
  );
}

function ReputationStatCard({
  value,
  count,
}: {
  value: number;
  count: number;
}) {
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

function CardSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="flex gap-3">
        <div className="h-16 w-16 rounded-full bg-bg-tertiary" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 w-28 rounded-full bg-bg-tertiary" />
          <div className="h-2.5 w-20 rounded-full bg-bg-tertiary" />
          <div className="h-2.5 w-24 rounded-full bg-bg-tertiary" />
        </div>
      </div>
      <div className="h-24 rounded-xl bg-bg-tertiary" />
      <div className="h-20 rounded-xl bg-bg-tertiary" />
    </div>
  );
}

export function PlayerHoverCard({ userId, anchorRect, onOpenProfile, onMouseEnter, onMouseLeave }: PlayerHoverCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["hoverProfile", userId],
    queryFn: () => userApi.getHoverProfile(userId),
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(userId),
  });

  const TOOLTIP_OFFSET = 8;
  const isMobileScreen = window.innerWidth < 640;
  const TOOLTIP_W = isMobileScreen ? Math.min(300, window.innerWidth - 16) : 300;
  const TOOLTIP_H = 468;
  const spaceOnRight = window.innerWidth - anchorRect.right;
  const rawLeft = spaceOnRight >= TOOLTIP_W + TOOLTIP_OFFSET
    ? anchorRect.right + TOOLTIP_OFFSET
    : anchorRect.left - TOOLTIP_W - TOOLTIP_OFFSET;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - 8));
  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - TOOLTIP_H - 8));

  const isActualBot = data ? /^testbot_\d+$/.test(data.username) : false;
  const riot = data?.riotAccount ?? null;

  const champions = [...(riot?.championPreferences ?? [])].sort((a, b) => a.order - b.order);
  const mainRole = riot?.mainRole ?? null;
  const subRole = riot?.subRole ?? null;

  const champsByRole: Record<string, string[]> = {};
  for (const cp of champions) {
    if (!champsByRole[cp.role]) champsByRole[cp.role] = [];
    champsByRole[cp.role].push(cp.championId);
  }

  // 주/부 우선, 나머지는 뒤에
  const rolesToShow: string[] = [];
  if (mainRole) rolesToShow.push(mainRole);
  if (subRole && subRole !== mainRole) rolesToShow.push(subRole);
  for (const role of Object.keys(champsByRole)) {
    if (!rolesToShow.includes(role)) rolesToShow.push(role);
  }

  const hasChampions = champions.length > 0;
  const isApexTier = riot?.tier && ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(riot.tier);
  const hasTier = riot?.tier && riot.tier !== "UNRANKED";

  return createPortal(
    <div
      className="fixed z-[9999] max-h-[calc(100vh-16px)] overflow-y-auto rounded-[18px] bg-[#101010] text-white shadow-[0_32px_70px_rgba(0,0,0,0.82)] animate-fade-in"
      style={{
        left, top, width: TOOLTIP_W,
        border: `1px solid ${ACCENT}66`,
        boxShadow: `0 32px 70px rgba(0,0,0,0.82), 0 0 0 1px ${ACCENT}18`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isLoading ? (
        <CardSkeleton />
      ) : data ? (
        <>
          {/* ── 헤더: 아바타 + 이름 + 티어 ── */}
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start gap-3">

              {/* 아바타 — 원형 + 티어 링 */}
              <div
                className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-[#171717]"
                style={{ border: `2px solid ${hasTier ? ACCENT + "88" : "rgba(255,255,255,0.14)"}` }}
              >
                {data.avatar ? (
                  <Image src={data.avatar} alt={data.username} fill className="object-cover" unoptimized />
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
                  <p className="truncate text-sm font-black leading-tight text-white">{data.username}</p>
                  {data.streamerProfile && (
                    <span className="shrink-0 rounded-md bg-yellow-400/15 px-1.5 py-0.5 text-[10px] font-black leading-none text-yellow-300">
                      streamer
                    </span>
                  )}
                  {data.clan?.tag && (
                    <span
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black leading-none"
                      style={{ color: ACCENT, backgroundColor: `${ACCENT}22` }}
                    >
                      {data.clan.tag}
                    </span>
                  )}
                </div>

                {/* 롤 닉네임 (서브) */}
                {riot && (
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {riot.gameName}<span className="text-zinc-600"> #{riot.tagLine}</span>
                  </p>
                )}

                {/* 현재 티어 */}
                {hasTier && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm font-black" style={{ color: TIER_COLOR[riot!.tier] ?? ACCENT }}>
                      {TIER_KO[riot!.tier] ?? riot!.tier}
                      {!isApexTier && riot?.rank ? ` ${riot.rank}` : ""}
                    </span>
                    {riot?.lp != null && (
                      <span className="text-xs font-bold text-zinc-200">{riot.lp} LP</span>
                    )}
                  </div>
                )}
                {/* 최고 티어 */}
                {riot?.peakTier && riot.peakTier !== "UNRANKED" && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="text-[10px] text-zinc-600">최고</span>
                    <span className="text-[11px] font-semibold text-zinc-400">
                      {TIER_KO[riot.peakTier] ?? riot.peakTier}
                      {riot.peakRank && !["MASTER","GRANDMASTER","CHALLENGER"].includes(riot.peakTier) ? ` ${riot.peakRank}` : ""}
                      {riot.peakLp != null && ["MASTER","GRANDMASTER","CHALLENGER"].includes(riot.peakTier) ? ` ${riot.peakLp}LP` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2.5 px-4 pb-4">
            {/* ── 선호 라인 ── */}
            {(mainRole || subRole) && (
              <div className="flex items-center gap-2">
                {mainRole && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5">
                    <PositionIcon position={mainRole} className="!h-4 !w-4" />
                    <span className="text-xs font-bold text-white">{POSITION_LABELS[mainRole] || mainRole}</span>
                    <span className="rounded bg-[#262626] px-1 text-[9px] font-black text-zinc-600">주</span>
                  </div>
                )}
                {subRole && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5">
                    <PositionIcon position={subRole} className="!h-4 !w-4" opacity={0.6} />
                    <span className="text-xs font-semibold text-zinc-400">{POSITION_LABELS[subRole] || subRole}</span>
                    <span className="rounded bg-[#262626] px-1 text-[9px] font-black text-zinc-600">부</span>
                  </div>
                )}
              </div>
            )}

            {/* ── 승률 / KDA ── */}
            {!isActualBot && (
              <div className="grid grid-cols-2 gap-2">
                <WinRateStatCard wins={data.stats.wins} losses={data.stats.losses} />
                <KdaStatCard kda={data.kda} />
              </div>
            )}

            {/* ── 선호 챔피언 ── */}
            {hasChampions && (
              <div className="rounded-xl bg-[#181818] px-3 py-3">
                <p className="mb-2 text-[10px] font-medium text-zinc-600">선호 챔피언</p>
                <div className="space-y-2">
                  {rolesToShow.map((role) => {
                    const champs = champsByRole[role] ?? [];
                    if (!champs.length) return null;
                    const label = role === mainRole ? "주" : role === subRole ? "부" : null;
                    return (
                      <div key={role} className="flex items-center gap-2">
                        <div className="flex w-12 shrink-0 items-center gap-1">
                          <PositionIcon position={role} className="!h-3.5 !w-3.5 opacity-70" />
                          {label && (
                            <span className="text-[9px] font-black text-zinc-500">{label}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {champs.slice(0, 5).map((id, i) => (
                            <ChampionIcon key={i} championId={id} size={25} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 신뢰도 ── */}
            {!isActualBot && (
              <ReputationStatCard
                value={data.reputation.overallAverage}
                count={data.reputation.totalRatings}
              />
            )}

            {!riot && (
              <p className="text-xs italic text-zinc-500">등록된 라이엇 계정이 없습니다</p>
            )}

            {/* ── 프로필 보기 버튼 ── */}
            {!isActualBot && (
              <button
                type="button"
                onClick={() => onOpenProfile(userId)}
                className="group flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-black text-white transition-all hover:brightness-110"
                style={{ background: `linear-gradient(135deg, ${ACCENT}CC, ${ACCENT}88)` }}
              >
                프로필 보기
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>,
    document.body
  );
}
