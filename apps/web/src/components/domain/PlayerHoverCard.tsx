"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useState } from "react";
import { Users, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { TierBadge } from "@/components/domain/TierBadge";
import { userApi } from "@/lib/api-client";
import { ChampionIcon, PositionIcon, POSITION_LABELS } from "@/app/tournaments/[id]/lobby/_components/icons";

interface PlayerHoverCardProps {
  userId: string;
  anchorRect: DOMRect;
  onOpenProfile: (userId: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

// 티어별 헤더 그라디언트 + 강조색
function getTierTheme(tier?: string | null): { gradient: string; accent: string; text: string } {
  switch (tier) {
    case "CHALLENGER":  return { gradient: "from-amber-400 via-yellow-300 to-amber-500",   accent: "#F59E0B", text: "#FEF3C7" };
    case "GRANDMASTER": return { gradient: "from-rose-500 via-rose-400 to-red-600",         accent: "#F43F5E", text: "#FFE4E6" };
    case "MASTER":      return { gradient: "from-purple-500 via-violet-400 to-purple-700",  accent: "#A855F7", text: "#F3E8FF" };
    case "DIAMOND":     return { gradient: "from-cyan-400 via-sky-300 to-cyan-600",         accent: "#22D3EE", text: "#CFFAFE" };
    case "PLATINUM":    return { gradient: "from-teal-400 via-teal-300 to-teal-600",        accent: "#2DD4BF", text: "#CCFBF1" };
    case "EMERALD":     return { gradient: "from-emerald-400 via-green-300 to-emerald-600", accent: "#10B981", text: "#D1FAE5" };
    case "GOLD":        return { gradient: "from-yellow-400 via-amber-300 to-yellow-600",   accent: "#F59E0B", text: "#FEF9C3" };
    case "SILVER":      return { gradient: "from-slate-300 via-slate-200 to-slate-500",     accent: "#94A3B8", text: "#F1F5F9" };
    case "BRONZE":      return { gradient: "from-orange-600 via-orange-500 to-orange-800",  accent: "#F97316", text: "#FED7AA" };
    case "IRON":        return { gradient: "from-stone-400 via-stone-300 to-stone-600",     accent: "#78716C", text: "#F5F5F4" };
    default:            return { gradient: "from-zinc-600 via-zinc-500 to-zinc-700",        accent: "#6366F1", text: "#E0E7FF" };
  }
}

function WinRateBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return <span className="text-text-muted">전적 없음</span>;
  const rate = Math.round((wins / total) * 100);
  const color = rate >= 60 ? "bg-emerald-400" : rate >= 50 ? "bg-blue-400" : "bg-rose-400";
  const textColor = rate >= 60 ? "text-emerald-400" : rate >= 50 ? "text-blue-400" : "text-rose-400";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-text-secondary font-medium">{wins}승 {losses}패</span>
        <span className={`font-bold text-sm ${textColor}`}>{rate}%</span>
      </div>
      <div className="h-1 w-full rounded-full bg-bg-tertiary overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${rate}%` }} />
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
      <div className="h-3 w-32 rounded-full bg-bg-tertiary" />
      <div className="h-3 w-44 rounded-full bg-bg-tertiary" />
      <div className="h-3 w-28 rounded-full bg-bg-tertiary" />
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
  const champions = [...(riot?.championPreferences ?? [])].sort((a, b) => a.order - b.order);
  const mainRole = riot?.mainRole ?? null;
  const subRole = riot?.subRole ?? null;

  const champsByRole: Record<string, string[]> = {};
  for (const cp of champions) {
    if (!champsByRole[cp.role]) champsByRole[cp.role] = [];
    champsByRole[cp.role].push(cp.championId);
  }
  const rolesToShow: string[] = [];
  if (mainRole) rolesToShow.push(mainRole);
  if (subRole && subRole !== mainRole) rolesToShow.push(subRole);
  for (const role of Object.keys(champsByRole)) {
    if (!rolesToShow.includes(role)) rolesToShow.push(role);
  }

  const hasRoles = mainRole || subRole;
  const hasChampions = champions.length > 0;
  const theme = getTierTheme(riot?.tier);

  return createPortal(
    <div
      className="fixed z-[9999] overflow-hidden rounded-2xl border border-white/8 bg-bg-elevated shadow-[0_32px_64px_rgba(0,0,0,0.7)] animate-fade-in"
      style={{ left, top, width: TOOLTIP_W }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isLoading ? (
        <CardSkeleton />
      ) : data ? (
        <>
          {/* 아이덴티티 영역 */}
          <div className="px-4 pb-3 pt-4">
            <div className="flex items-center gap-3 mb-3">
              {/* 아바타 */}
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-white/8 shadow-lg">
                {data.avatar ? (
                  <Image src={data.avatar} alt={data.username} fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-bg-tertiary">
                    <Users className="h-7 w-7 text-text-tertiary" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                {riot ? (
                  <>
                    <p className="truncate text-sm font-bold leading-tight text-text-primary">
                      {riot.gameName}
                      <span className="font-normal text-text-muted">#{riot.tagLine}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-text-tertiary">@{data.username}</p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-text-primary truncate">{data.username}</p>
                )}
              </div>
            </div>

            {/* 전적 + 신뢰도 + 클랜 */}
            {!isActualBot && (
              <div className="mb-3 space-y-2.5 rounded-xl bg-bg-secondary p-3">
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
              {data.clan && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-tertiary">클랜</span>
                  <span className="truncate text-xs font-medium" style={{ color: theme.accent }}>
                    {data.clan.tag ? `[${data.clan.tag}] ` : ""}{data.clan.name}
                  </span>
                </div>
              )}
            </div>
            )}

            {/* 포지션 */}
            {hasRoles && (
              <div className="mb-3">
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
              </div>
            )}

            {/* 선호 챔피언 */}
            {rolesToShow.length > 0 && hasChampions && (
              <div className="mb-3 rounded-lg bg-bg-secondary px-3 py-2.5">
                <p className="mb-2 text-[10px] font-medium text-text-muted">선호 챔피언</p>
                <div className="space-y-1.5">
                  {rolesToShow.map((role) => {
                    const champs = champsByRole[role] ?? [];
                    if (!champs.length) return null;
                    return (
                      <div key={role} className="flex items-center gap-2">
                        <PositionIcon position={role} className="!h-3.5 !w-3.5 flex-shrink-0 opacity-50" />
                        <div className="flex items-center gap-1">
                          {champs.slice(0, 5).map((id, i) => <ChampionIcon key={i} championId={id} size={28} />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!riot && (
              <p className="mb-3 text-xs italic text-text-muted">등록된 라이엇 계정이 없습니다</p>
            )}

            {/* 티어 + 최고티어 */}
            {riot?.tier && riot.tier !== "UNRANKED" && (
              <div className="mb-3 flex gap-2">
                <div className="flex-1 rounded-lg bg-bg-secondary px-3 py-2">
                  <p className="mb-0.5 text-[10px] font-medium text-text-muted">현재 티어</p>
                  <p className="text-sm font-bold text-text-primary">
                    {riot.tier}{riot.rank ? ` ${riot.rank}` : ""}{riot.lp != null ? ` ${riot.lp}LP` : ""}
                  </p>
                </div>
                {riot.peakTier && (
                  <div className="flex-1 rounded-lg bg-bg-secondary px-3 py-2">
                    <p className="mb-0.5 text-[10px] font-medium text-text-muted">최고 티어</p>
                    <p className="text-sm font-bold text-text-secondary">
                      {riot.peakTier}
                      {riot.peakRank ? ` ${riot.peakRank}` : ""}
                      {riot.peakLp != null && ["MASTER","GRANDMASTER","CHALLENGER"].includes(riot.peakTier ?? "") ? ` ${riot.peakLp}LP` : ""}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 프로필 보기 버튼 */}
          {!isActualBot && (
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => onOpenProfile(userId)}
                className="group flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white transition-all"
                style={{ background: `linear-gradient(135deg, ${theme.accent}CC, ${theme.accent}99)` }}
              >
                프로필 보기
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>,
    document.body
  );
}
