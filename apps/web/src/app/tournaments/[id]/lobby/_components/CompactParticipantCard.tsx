"use client";

import { useRef } from "react";
import Image from "next/image";
import { Check, Crown, UserMinus, UserPlus, Users, Volume2, VolumeX, X } from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { PositionIcon } from "./icons";

/* ─── Compact Participant Card (for large rooms) ─── */
export function CompactParticipantCard({
  p, isCurrentUserHost, isSelf, isFriend, isSent, addingFriend,
  setHoveredPlayer, scheduleHoverClose, cancelHoverClose, handleAddFriend, setKickTarget, cardRef: _,
}: any) {
  const riot = p.riotAccount;
  const mainRole = riot?.mainRole || null;
  const compactRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    cancelHoverClose?.();
    if (compactRef.current) {
      setHoveredPlayer({ id: p.id, rect: compactRef.current.getBoundingClientRect(), participant: p });
    }
  };

  return (
    <div
      ref={compactRef}
      className="relative flex items-center gap-2 bg-bg-tertiary px-2.5 py-2 rounded-lg hover:bg-bg-elevated transition-colors group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={scheduleHoverClose ?? (() => setHoveredPlayer(null))}
    >
      {/* Avatar */}
      <div className="relative w-7 h-7 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
        {p.avatar ? (
          <Image src={p.avatar} alt={p.username} fill className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Users className="h-3 w-3 text-text-tertiary" /></div>
        )}
      </div>

      {/* Name + tier + position */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {p.isHost && <Crown className="h-3 w-3 text-accent-gold flex-shrink-0" />}
          <span className="font-medium text-xs text-text-primary truncate">
            {riot ? riot.gameName : p.username}
          </span>
          {riot?.tier && <TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon={false} className="flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-1">
          {mainRole && <PositionIcon position={mainRole} className="!w-3 !h-3" />}
          {riot && <span className="text-[10px] text-text-tertiary truncate">{p.username}</span>}
        </div>
      </div>

      {/* Ready status + actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {!isSelf && !isFriend && !isSent && (
          <button onClick={(e) => { e.stopPropagation(); handleAddFriend(p.userId); }} disabled={addingFriend === p.userId} className="opacity-60 group-hover:opacity-100 p-1 text-accent-primary hover:text-accent-hover hover:bg-accent-primary/10 rounded transition-all disabled:opacity-30" title="친구 추가">
            <UserPlus className="h-3 w-3" />
          </button>
        )}
        {/* Discord 음성채널 참가 상태 뱃지 (inVoice가 정의된 경우만 표시) */}
        {p.inVoice !== undefined && (
          p.inVoice ? (
            <span title="음성채널 참가 중" className="flex items-center">
              <Volume2 className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
            </span>
          ) : (
            <span title="음성채널 미참가" className="flex items-center">
              <VolumeX className="h-3.5 w-3.5 text-text-tertiary/50 flex-shrink-0" />
            </span>
          )
        )}
        {p.isReady ? (
          <Check className="h-3.5 w-3.5 text-accent-success flex-shrink-0" />
        ) : (
          <X className="h-3.5 w-3.5 text-text-tertiary/50 flex-shrink-0" />
        )}
        {isCurrentUserHost && !isSelf && (
          <button onClick={() => setKickTarget({ id: p.id, username: p.username })} className="opacity-60 group-hover:opacity-100 p-0.5 text-accent-danger hover:text-accent-danger/80 hover:bg-accent-danger/10 rounded transition-all" title="강퇴">
            <UserMinus className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
