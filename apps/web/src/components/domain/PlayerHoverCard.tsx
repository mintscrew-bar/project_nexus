"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { Users, ArrowRight } from "lucide-react";
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

const TIER_KO: Record<string, string> = {
  CHALLENGER: "챌린저", GRANDMASTER: "그랜드마스터", MASTER: "마스터",
  DIAMOND: "다이아몬드", PLATINUM: "플래티넘", EMERALD: "에메랄드",
  GOLD: "골드", SILVER: "실버", BRONZE: "브론즈", IRON: "아이언",
};

function WinRateBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return <span className="text-xs text-text-muted">전적 없음</span>;
  const rate = Math.round((wins / total) * 100);
  const color = rate >= 60 ? "bg-emerald-400" : rate >= 50 ? "bg-blue-400" : "bg-rose-400";
  const textColor = rate >= 60 ? "text-emerald-400" : rate >= 50 ? "text-blue-400" : "text-rose-400";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-text-secondary font-medium">{wins}승 {losses}패</span>
        <span className={`font-bold text-sm ${textColor}`}>{rate}%</span>
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
      <div className="h-14 rounded-xl bg-bg-tertiary" />
      <div className="h-10 rounded-xl bg-bg-tertiary" />
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
  const TOOLTIP_W = isMobileScreen ? Math.min(288, window.innerWidth - 16) : 300;
  const spaceOnRight = window.innerWidth - anchorRect.right;
  const rawLeft = spaceOnRight >= TOOLTIP_W + TOOLTIP_OFFSET
    ? anchorRect.right + TOOLTIP_OFFSET
    : anchorRect.left - TOOLTIP_W - TOOLTIP_OFFSET;
  const left = Math.max(8, Math.min(rawLeft, window.innerWidth - TOOLTIP_W - 8));
  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 520));

  const isActualBot = data ? /^testbot_\d+$/.test(data.username) : false;
  const riot = data?.riotAccount ?? null;
  const theme = getTierTheme(riot?.tier);

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
      className="fixed z-[9999] overflow-hidden rounded-2xl bg-bg-elevated shadow-[0_32px_64px_rgba(0,0,0,0.7)] animate-fade-in"
      style={{
        left, top, width: TOOLTIP_W,
        border: `1px solid ${theme.accent}35`,
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
                className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full"
                style={{ border: `2px solid ${hasTier ? theme.accent + "70" : "rgba(255,255,255,0.1)"}` }}
              >
                {data.avatar ? (
                  <Image src={data.avatar} alt={data.username} fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-bg-tertiary">
                    <Users className="h-8 w-8 text-text-tertiary" />
                  </div>
                )}
              </div>

              {/* 이름 + 클랜 + 티어 */}
              <div className="min-w-0 flex-1 pt-0.5">
                {/* 닉네임 행 — 클랜 우측 */}
                <div className="flex items-start justify-between gap-1.5">
                  <p className="truncate text-sm font-bold leading-tight text-text-primary">
                    {riot ? (
                      <>{riot.gameName}<span className="font-normal text-text-muted"> #{riot.tagLine}</span></>
                    ) : data.username}
                  </p>
                  {data.clan?.tag && (
                    <span
                      className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none"
                      style={{ color: theme.accent, backgroundColor: `${theme.accent}22` }}
                    >
                      {data.clan.tag}
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-[11px] text-text-tertiary">@{data.username}</p>

                {/* 현재 티어 */}
                {hasTier && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-sm font-bold" style={{ color: theme.accent }}>
                      {TIER_KO[riot!.tier] ?? riot!.tier}
                      {!isApexTier && riot?.rank ? ` ${riot.rank}` : ""}
                    </span>
                    {riot?.lp != null && (
                      <span className="text-xs font-semibold text-text-secondary">{riot.lp} LP</span>
                    )}
                  </div>
                )}
                {/* 최고 티어 */}
                {riot?.peakTier && riot.peakTier !== "UNRANKED" && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="text-[10px] text-text-muted">최고</span>
                    <span className="text-[11px] font-semibold text-text-secondary">
                      {TIER_KO[riot.peakTier] ?? riot.peakTier}
                      {riot.peakRank && !["MASTER","GRANDMASTER","CHALLENGER"].includes(riot.peakTier) ? ` ${riot.peakRank}` : ""}
                      {riot.peakLp != null && ["MASTER","GRANDMASTER","CHALLENGER"].includes(riot.peakTier) ? ` ${riot.peakLp}LP` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-2.5">
            {/* ── 선호 라인 ── */}
            {(mainRole || subRole) && (
              <div className="flex items-center gap-2">
                {mainRole && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-bg-secondary px-2.5 py-1.5">
                    <PositionIcon position={mainRole} className="!h-4 !w-4" />
                    <span className="text-xs font-semibold text-text-primary">{POSITION_LABELS[mainRole] || mainRole}</span>
                    <span className="rounded bg-bg-tertiary px-1 text-[9px] font-bold text-text-muted">주</span>
                  </div>
                )}
                {subRole && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-bg-secondary px-2.5 py-1.5">
                    <PositionIcon position={subRole} className="!h-4 !w-4" opacity={0.6} />
                    <span className="text-xs text-text-secondary">{POSITION_LABELS[subRole] || subRole}</span>
                    <span className="rounded bg-bg-tertiary px-1 text-[9px] font-bold text-text-muted">부</span>
                  </div>
                )}
              </div>
            )}

            {/* ── 선호 챔피언 ── */}
            {hasChampions && (
              <div className="rounded-xl bg-bg-secondary px-3 py-2.5">
                <p className="mb-2 text-[10px] font-medium text-text-muted">선호 챔피언</p>
                <div className="space-y-2">
                  {rolesToShow.map((role) => {
                    const champs = champsByRole[role] ?? [];
                    if (!champs.length) return null;
                    const label = role === mainRole ? "주" : role === subRole ? "부" : null;
                    return (
                      <div key={role} className="flex items-center gap-2">
                        <div className="flex w-12 shrink-0 items-center gap-1">
                          <PositionIcon position={role} className="!h-3.5 !w-3.5 opacity-50" />
                          {label && (
                            <span className="text-[9px] font-bold text-text-muted">{label}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {champs.slice(0, 5).map((id, i) => (
                            <ChampionIcon key={i} championId={id} size={26} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 전적 + 신뢰도 ── */}
            {!isActualBot && (
              <div className="rounded-xl bg-bg-secondary p-3 space-y-2">
                <WinRateBar wins={data.stats.wins} losses={data.stats.losses} />
                {data.reputation.totalRatings > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-tertiary">신뢰도</span>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                      <RatingStars value={data.reputation.overallAverage} />
                      <span>{data.reputation.overallAverage.toFixed(1)}</span>
                      <span className="text-text-muted">({data.reputation.totalRatings})</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {!riot && (
              <p className="text-xs italic text-text-muted">등록된 라이엇 계정이 없습니다</p>
            )}

            {/* ── 프로필 보기 버튼 ── */}
            {!isActualBot && (
              <button
                type="button"
                onClick={() => onOpenProfile(userId)}
                className="group flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition-all"
                style={{ background: `linear-gradient(135deg, ${theme.accent}CC, ${theme.accent}88)` }}
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
