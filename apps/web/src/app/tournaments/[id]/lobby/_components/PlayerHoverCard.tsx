"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { Users } from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { ChampionIcon, PositionIcon, POSITION_LABELS } from "./icons";

interface PlayerHoverCardProps {
  participant: any;
  anchorRect: DOMRect;
}

export function PlayerHoverCard({ participant, anchorRect }: PlayerHoverCardProps) {
  const riot = participant.riotAccount;
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const champions = [...(riot?.championPreferences || [])].sort((a: any, b: any) => a.order - b.order);

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
  const TOOLTIP_W = 256;
  const TOOLTIP_OFFSET = 8;
  const spaceOnRight = window.innerWidth - anchorRect.right;
  const left = spaceOnRight >= TOOLTIP_W + TOOLTIP_OFFSET
    ? anchorRect.right + TOOLTIP_OFFSET
    : anchorRect.left - TOOLTIP_W - TOOLTIP_OFFSET;
  const top = Math.min(anchorRect.top, window.innerHeight - 320);

  return createPortal(
    <div
      className="fixed w-64 bg-bg-elevated border border-bg-tertiary rounded-xl shadow-2xl p-4 z-[9999] animate-fade-in pointer-events-none"
      style={{ left, top }}
    >
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-bg-tertiary">
        <div className="relative w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
          {participant.avatar ? (
            <Image src={participant.avatar} alt={participant.username} fill className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Users className="h-5 w-5 text-text-tertiary" /></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {riot ? (
            <>
              <p className="text-sm font-bold text-text-primary truncate">{riot.gameName}<span className="text-text-tertiary font-normal">#{riot.tagLine}</span></p>
              <p className="text-xs text-text-tertiary truncate">{participant.username}</p>
            </>
          ) : (
            <p className="text-sm font-bold text-text-primary truncate">{participant.username}</p>
          )}
          {riot?.tier && <div className="mt-1"><TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon /></div>}
        </div>
      </div>
      {hasRoles && (
        <div className={`${hasChampions ? "mb-3 pb-3 border-b border-bg-tertiary" : ""}`}>
          <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">포지션</p>
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
        <div>
          <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">선호 챔피언</p>
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
      {riot && !hasRoles && !hasChampions && (
        <p className="text-xs text-text-tertiary italic">등록된 포지션/선호 챔피언이 없습니다</p>
      )}
      {!riot && <p className="text-xs text-text-tertiary italic">등록된 라이엇 계정이 없습니다</p>}
    </div>,
    document.body
  );
}
