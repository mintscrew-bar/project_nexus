"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { TierBadge } from "@/components/domain/TierBadge";
import { reputationApi, userApi } from "@/lib/api-client";
import { ChampionIcon, PositionIcon, POSITION_LABELS } from "./icons";

interface PlayerHoverCardProps {
  participant: any;
  anchorRect: DOMRect;
  onOpenProfile: (userId: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function getTierGradient(tier?: string | null) {
  switch (tier) {
    case "CHALLENGER": return "from-amber-300 to-amber-500";
    case "GRANDMASTER": return "from-rose-400 to-rose-600";
    case "MASTER": return "from-purple-400 to-purple-600";
    case "DIAMOND": return "from-cyan-400 to-cyan-600";
    case "PLATINUM": return "from-teal-400 to-teal-600";
    case "EMERALD": return "from-emerald-400 to-emerald-600";
    case "GOLD": return "from-yellow-400 to-yellow-600";
    case "SILVER": return "from-slate-300 to-slate-500";
    case "BRONZE": return "from-orange-700 to-orange-900";
    case "IRON": return "from-stone-500 to-stone-700";
    default: return "from-bg-tertiary to-bg-elevated";
  }
}

function formatPeakTier(riot: any) {
  if (!riot?.peakTier) return "Peak 없음";
  return `Peak ${riot.peakTier}${riot.peakRank ? ` ${riot.peakRank}` : ""}`;
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="tracking-normal text-[11px] text-yellow-400">
      {"★".repeat(rounded)}<span className="text-text-muted">{"★".repeat(Math.max(0, 5 - rounded))}</span>
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">{children}</p>;
}

function StatSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-44 rounded bg-bg-tertiary animate-pulse" />
      <div className="h-4 w-52 rounded bg-bg-tertiary animate-pulse" />
    </div>
  );
}

export function PlayerHoverCard({ participant, anchorRect, onOpenProfile, onMouseEnter, onMouseLeave }: PlayerHoverCardProps) {
  const riot = participant.riotAccount;
  const isBot = /^testbot_\d+$/.test(participant.username);
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const champions = [...(riot?.championPreferences || [])].sort((a: any, b: any) => a.order - b.order);
  const clan = participant.clanMemberships?.[0]?.clan || participant.clanMembership?.clan || null;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["userStats", participant.userId],
    queryFn: () => userApi.getUserStats(participant.userId),
    staleTime: 60_000,
    enabled: Boolean(participant.userId) && !isBot,
  });

  const { data: rep, isLoading: repLoading } = useQuery({
    queryKey: ["reputationStats", participant.userId],
    queryFn: () => reputationApi.getUserStats(participant.userId),
    staleTime: 60_000,
    enabled: Boolean(participant.userId) && !isBot,
  });

  const champsByRole: Record<string, string[]> = {};
  for (const cp of champions) {
    if (!champsByRole[cp.role]) champsByRole[cp.role] = [];
    champsByRole[cp.role].push(cp.championId);
  }

  // mainRole, subRole 우선 + 챔피언이 등록된 나머지 역할도 포함한다.
  const rolesToShow: string[] = [];
  if (mainRole) rolesToShow.push(mainRole);
  if (subRole && subRole !== mainRole) rolesToShow.push(subRole);
  for (const role of Object.keys(champsByRole)) {
    if (!rolesToShow.includes(role)) rolesToShow.push(role);
  }

  const hasRoles = mainRole || subRole;
  const hasChampions = champions.length > 0;

  // fixed 포지셔닝: overflow-hidden 컨테이너 밖으로 탈출한다.
  const TOOLTIP_W = 320;
  const TOOLTIP_OFFSET = 8;
  const spaceOnRight = window.innerWidth - anchorRect.right;
  const left = spaceOnRight >= TOOLTIP_W + TOOLTIP_OFFSET
    ? anchorRect.right + TOOLTIP_OFFSET
    : anchorRect.left - TOOLTIP_W - TOOLTIP_OFFSET;
  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 480));
  const showSkeleton = !isBot && statsLoading && repLoading;

  return createPortal(
    <div
      className="fixed w-80 overflow-hidden bg-bg-elevated border border-bg-tertiary rounded-xl shadow-2xl z-[9999] animate-fade-in"
      style={{ left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={`h-14 bg-gradient-to-r ${getTierGradient(riot?.tier)}`} />
      <div className="px-4 pb-4">
        <div className="flex items-end gap-3 -mt-7 mb-3">
          <div className="relative w-14 h-14 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0 border-4 border-bg-elevated">
            {participant.avatar ? (
              <Image src={participant.avatar} alt={participant.username} fill className="object-cover" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Users className="h-6 w-6 text-text-tertiary" /></div>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            {riot?.tier && <TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon />}
          </div>
        </div>
        <div className="mb-3 pb-3 border-b border-bg-tertiary">
          {riot ? (
            <>
              <p className="text-sm font-bold text-text-primary truncate">{riot.gameName}<span className="text-text-tertiary font-normal">#{riot.tagLine}</span></p>
              <p className="text-xs text-text-tertiary truncate">@{participant.username} · {formatPeakTier(riot)}</p>
            </>
          ) : (
            <p className="text-sm font-bold text-text-primary truncate">{participant.username}</p>
          )}
        </div>
      {hasRoles && (
        <div className={`${hasChampions ? "mb-3 pb-3 border-b border-bg-tertiary" : ""}`}>
          <SectionLabel>POSITION</SectionLabel>
          <div className="flex items-center gap-3">
            {mainRole && (
              <div className="flex items-center gap-1.5">
                <PositionIcon position={mainRole} className="!w-5 !h-5" />
                <span className="text-xs font-medium text-text-primary">{POSITION_LABELS[mainRole] || mainRole}</span>
                <span className="text-[10px] text-accent-primary font-semibold">주</span>
              </div>
            )}
            {subRole && (
              <div className="flex items-center gap-1.5">
                <PositionIcon position={subRole} className="!w-5 !h-5" opacity={0.7} />
                <span className="text-xs font-medium text-text-secondary">{POSITION_LABELS[subRole] || subRole}</span>
                <span className="text-[10px] text-text-tertiary font-semibold">부</span>
              </div>
            )}
          </div>
        </div>
      )}
      {rolesToShow.length > 0 && hasChampions && (
        <div className="mb-3 pb-3 border-b border-bg-tertiary">
          <SectionLabel>선호 챔피언</SectionLabel>
          <div className="space-y-2">
            {rolesToShow.map((role) => {
              const champs = champsByRole[role] || [];
              if (champs.length === 0) return null;
              return (
                <div key={role} className="flex items-center gap-2">
                  <PositionIcon position={role} className="!w-3.5 !h-3.5 flex-shrink-0" />
                  <div className="flex items-center gap-1">
                    {champs.slice(0, 4).map((champId, idx) => <ChampionIcon key={idx} championId={champId} size={28} />)}
                    {champs.length > 4 && <span className="text-[10px] text-text-tertiary ml-0.5">+{champs.length - 4}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!isBot && (
        <div className="space-y-2 text-xs">
          {showSkeleton ? (
            <StatSkeleton />
          ) : (
            <>
              {stats && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-tertiary">전적</span>
                  <span className="rounded bg-bg-tertiary px-2 py-1 font-medium text-text-primary">
                    {stats.wins ?? 0}승 {stats.losses ?? 0}패 · {Math.round(stats.winRate ?? 0)}%
                  </span>
                </div>
              )}
              {rep && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-tertiary">신뢰도</span>
                  <span className="flex items-center gap-1 rounded bg-bg-tertiary px-2 py-1 font-medium text-text-primary">
                    <RatingStars value={rep.overallAverage ?? 0} />
                    {(rep.overallAverage ?? 0).toFixed(1)} ({rep.totalRatings ?? 0}평가)
                  </span>
                </div>
              )}
              {clan && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-tertiary">클랜</span>
                  <span className="min-w-0 truncate rounded bg-accent-primary/10 px-2 py-1 text-accent-primary">
                    {clan.tag ? `[${clan.tag}] ` : ""}{clan.name}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {riot && !hasRoles && !hasChampions && (
        <p className="mt-3 text-xs text-text-tertiary italic">등록된 포지션/선호 챔피언이 없습니다</p>
      )}
      {!riot && <p className="text-xs text-text-tertiary italic">등록된 라이엇 계정이 없습니다</p>}
      {!isBot && (
        <button
          type="button"
          onClick={() => onOpenProfile(participant.userId)}
          className="mt-3 w-full px-3 py-2 bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary text-xs font-semibold rounded-lg transition-colors"
        >
          프로필 보기
        </button>
      )}
      </div>
    </div>,
    document.body
  );
}
