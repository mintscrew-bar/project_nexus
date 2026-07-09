"use client";

import { useRef } from "react";
import Image from "next/image";
import { Check, CheckCircle, Crown, UserMinus, UserPlus, Users, Volume2, VolumeX, X } from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { ChampionIcon, PositionIcon } from "./icons";

/* ─── Participant Card ─── */
export function ParticipantCard({
  p, isCurrentUserHost, isSelf, isFriend, isSent, addingFriend,
  setHoveredPlayer, scheduleHoverClose, cancelHoverClose, handleAddFriend, setKickTarget,
}: any) {
  const riot = p.riotAccount;
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const mainRoleChamps = (riot?.championPreferences || [])
    .filter((cp: any) => cp.role === mainRole)
    .sort((a: any, b: any) => a.order - b.order)
    .slice(0, 3);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    cancelHoverClose?.();
    if (cardRef.current) {
      setHoveredPlayer({ id: p.userId ?? p.id, rect: cardRef.current.getBoundingClientRect() });
    }
  };

  return (
    <div
      ref={cardRef}
      className="relative flex items-center justify-between bg-bg-tertiary p-3 rounded-lg hover:bg-bg-elevated transition-colors group animate-slide-in-right"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={scheduleHoverClose ?? (() => setHoveredPlayer(null))}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative w-10 h-10 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
          <Image
            src={p.avatar || "/images/placeholders/non-avatar-128.png"}
            alt={p.username}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            {p.isHost && <Crown className="h-3.5 w-3.5 text-accent-gold flex-shrink-0" />}
            <span className="font-semibold text-sm text-text-primary truncate">{riot ? riot.gameName : p.username}</span>
            {riot && <span className="text-xs text-text-tertiary flex-shrink-0">#{riot.tagLine}</span>}
            {riot?.tier && <TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon={false} className="flex-shrink-0" />}
            {/^testbot_\d+$/.test(p.username) && (
              <span className="text-[9px] font-bold bg-bg-secondary text-text-muted px-1 py-0.5 rounded border border-bg-elevated flex-shrink-0">BOT</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {riot && <span className="text-[11px] text-text-tertiary truncate">{p.username}</span>}
            {(mainRole || subRole) && (
              <div className="flex items-center gap-1">
                {mainRole && <PositionIcon position={mainRole} className="!w-4 !h-4" />}
                {subRole && <PositionIcon position={subRole} className="!w-3.5 !h-3.5" opacity={0.5} />}
              </div>
            )}
          </div>
          {mainRoleChamps.length > 0 && (
            <div className="flex items-center gap-0.5 mt-1">
              {mainRoleChamps.map((cp: any, idx: number) => <ChampionIcon key={idx} championId={cp.championId} size={20} />)}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        {!isSelf && !isFriend && !isSent && (
          <button onClick={(e) => { e.stopPropagation(); handleAddFriend(p.userId); }} disabled={addingFriend === p.userId} className="opacity-60 group-hover:opacity-100 p-2 text-accent-primary hover:text-accent-hover hover:bg-accent-primary/10 rounded-md transition-all disabled:opacity-30" title="친구 추가">
            <UserPlus className="h-5 w-5" />
          </button>
        )}
        {!isSelf && isSent && <span className="p-2 text-text-tertiary" title="친구 요청됨"><CheckCircle className="h-5 w-5" /></span>}
        {!isSelf && isFriend && <span className="p-2 text-accent-success" title="친구"><Check className="h-5 w-5" /></span>}
        {/* Discord 음성채널 참가 상태 뱃지 (inVoice가 정의된 경우만 표시) */}
        {p.inVoice !== undefined && (
          p.inVoice ? (
            <span title="음성채널 참가 중" className="flex items-center text-green-400">
              <Volume2 className="h-4 w-4" />
            </span>
          ) : (
            <span title="음성채널 미참가" className="flex items-center text-text-tertiary/50">
              <VolumeX className="h-4 w-4" />
            </span>
          )
        )}
        {p.isReady ? (
          <span className="flex items-center gap-1 text-xs font-medium text-accent-success bg-accent-success/10 px-2 py-1 rounded-md">
            <Check className="h-3.5 w-3.5 animate-bounce-in" />준비
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-text-tertiary bg-bg-secondary px-2 py-1 rounded-md">
            <X className="h-3.5 w-3.5" />대기
          </span>
        )}
        {isCurrentUserHost && !isSelf && (
          <button onClick={() => setKickTarget({ id: p.id, username: p.username })} className="opacity-60 group-hover:opacity-100 p-2 text-accent-danger hover:text-accent-danger/80 hover:bg-accent-danger/10 rounded-md transition-all" title="강퇴">
            <UserMinus className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Empty Slot ─── */
export function EmptySlot({ index }: { index: number }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg border-2 border-dashed border-bg-elevated/60"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="w-10 h-10 rounded-full bg-bg-tertiary/40 flex items-center justify-center flex-shrink-0">
        <Users className="h-4 w-4 text-text-muted" />
      </div>
      <span className="text-sm text-text-muted">참가자 대기 중...</span>
    </div>
  );
}
