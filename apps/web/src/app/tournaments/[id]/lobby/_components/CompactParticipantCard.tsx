"use client";

import { useRef } from "react";
import Image from "next/image";
import {
  Check,
  Crown,
  UserMinus,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { PositionIcon } from "./icons";
import { getRoleTier } from "@/lib/role-tier";

/* ─── Compact Participant Card (for large rooms) ─── */
export function CompactParticipantCard({
  p,
  isCurrentUserHost,
  isSelf,
  isFriend,
  isSent,
  addingFriend,
  setHoveredPlayer,
  scheduleHoverClose,
  cancelHoverClose,
  handleAddFriend,
  setKickTarget,
  cardRef: _,
}: any) {
  const riot = p.riotAccount;
  const mainRole = riot?.mainRole || null;
  const displayTier = getRoleTier(riot, mainRole);
  const compactRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    cancelHoverClose?.();
    if (compactRef.current) {
      setHoveredPlayer({
        id: p.userId ?? p.id,
        rect: compactRef.current.getBoundingClientRect(),
        participant: p,
      });
    }
  };

  return (
    <div
      ref={compactRef}
      className="group relative flex min-w-0 items-center gap-2 rounded-lg bg-bg-tertiary px-2.5 py-2 transition-colors hover:bg-bg-elevated"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={scheduleHoverClose ?? (() => setHoveredPlayer(null))}
    >
      {/* Avatar */}
      <div className="relative w-7 h-7 rounded-full bg-bg-elevated overflow-hidden flex-shrink-0">
        <Image
          src={p.avatar || "/images/placeholders/non-avatar-64.png"}
          alt={p.username}
          fill
          className="object-cover"
          unoptimized
        />
      </div>

      {/* Name + tier + position */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          {p.isHost && (
            <Crown className="h-3 w-3 text-accent-gold flex-shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
            {riot ? riot.gameName : p.username}
          </span>
          {riot?.tier && (
            <span
              className="flex-shrink-0"
              title={displayTier ? "주 포지션 티어" : "솔로랭크 티어"}
            >
              <TierBadge
                tier={displayTier?.tier || riot.tier}
                rank={displayTier?.rank || riot.rank || undefined}
                size="sm"
                showIcon={false}
              />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {mainRole && (
            <PositionIcon position={mainRole} className="!w-3 !h-3" />
          )}
          {riot && (
            <span className="text-[10px] text-text-tertiary truncate">
              {p.username}
            </span>
          )}
        </div>
      </div>

      {/* Ready status + actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {!isSelf && !isFriend && !isSent && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddFriend(p.userId);
            }}
            disabled={addingFriend === p.userId}
            className="opacity-60 group-hover:opacity-100 p-1.5 text-accent-primary hover:text-accent-hover hover:bg-accent-primary/10 rounded transition-all disabled:opacity-30"
            title="친구 추가"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        )}
        {/* Discord 음성채널 참가 상태 뱃지 (inVoice가 정의된 경우만 표시) */}
        {p.inVoice !== undefined &&
          (p.inVoice ? (
            <span title="음성채널 참가 중" className="flex items-center">
              <Volume2 className="h-4 w-4 text-green-400 flex-shrink-0" />
            </span>
          ) : (
            <span title="음성채널 미참가" className="flex items-center">
              <VolumeX className="h-4 w-4 text-text-tertiary/50 flex-shrink-0" />
            </span>
          ))}
        {p.isReady ? (
          <Check className="h-4 w-4 text-accent-success flex-shrink-0" />
        ) : (
          <X className="h-4 w-4 text-text-tertiary/50 flex-shrink-0" />
        )}
        {isCurrentUserHost && !isSelf && (
          <button
            onClick={() => setKickTarget({ id: p.id, username: p.username })}
            className="opacity-60 group-hover:opacity-100 p-1.5 text-accent-danger hover:text-accent-danger/80 hover:bg-accent-danger/10 rounded transition-all"
            title="강퇴"
          >
            <UserMinus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
