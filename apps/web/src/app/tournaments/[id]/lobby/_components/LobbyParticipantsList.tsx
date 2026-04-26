"use client";

import Image from "next/image";
import { Users } from "lucide-react";
import { CompactParticipantCard } from "./CompactParticipantCard";

interface LobbyParticipantsListProps {
  room: any;
  currentUser: any;
  currentUserParticipant: any;
  currentUserIsSpectator: boolean;
  players: any[];
  spectators: any[];
  emptySlots: number;
  isCurrentUserHost: boolean;
  friendUserIds: Set<string>;
  sentFriendIds: Set<string>;
  addingFriend: string | null;
  setHoveredPlayer: (value: { id: string; rect: DOMRect; participant: any } | null) => void;
  scheduleHoverClose: () => void;
  cancelHoverClose: () => void;
  handleAddFriend: (userId: string) => void;
  setKickTarget: (value: { id: string; username: string } | null) => void;
  toggleSpectator: (onError?: (message: string) => void) => void;
  addToast: (message: string, type: "success" | "error" | "info" | "warning") => void;
}

export function LobbyParticipantsList({
  room,
  currentUser,
  currentUserParticipant,
  currentUserIsSpectator,
  players,
  spectators,
  emptySlots,
  isCurrentUserHost,
  friendUserIds,
  sentFriendIds,
  addingFriend,
  setHoveredPlayer,
  scheduleHoverClose,
  cancelHoverClose,
  handleAddFriend,
  setKickTarget,
  toggleSpectator,
  addToast,
}: LobbyParticipantsListProps) {
  return (
    <div>
      {/* 관전자 전환 버튼 */}
      {room.allowSpectators && room.status === "WAITING" && currentUserParticipant && (
        <button
          onClick={() => toggleSpectator((err) => addToast(err, "error"))}
          className={`w-full mb-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
            currentUserIsSpectator
              ? "border-accent-primary/30 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20"
              : "border-bg-tertiary bg-bg-tertiary/50 text-text-secondary hover:bg-bg-tertiary"
          }`}
        >
          {currentUserIsSpectator ? "플레이어로 전환" : "관전자로 전환"}
        </button>
      )}

      {/* 플레이어 목록 */}
      <div className="grid grid-cols-2 gap-1.5">
        {players.map((p: any) => {
          const isSelf = p.userId === currentUser?.id;
          return (
            <CompactParticipantCard
              key={p.id}
              p={p}
              isCurrentUserHost={isCurrentUserHost}
              isSelf={isSelf}
              isFriend={friendUserIds.has(p.userId)}
              isSent={sentFriendIds.has(p.userId)}
              addingFriend={addingFriend}
              setHoveredPlayer={setHoveredPlayer}
              scheduleHoverClose={scheduleHoverClose}
              cancelHoverClose={cancelHoverClose}
              handleAddFriend={handleAddFriend}
              setKickTarget={setKickTarget}
              cardRef={null}
            />
          );
        })}
      </div>
      {emptySlots > 0 && (
        <div className="mt-2 text-center py-2 rounded-lg border border-dashed border-bg-elevated/60 text-sm text-text-muted">
          <Users className="h-4 w-4 inline mr-1.5 opacity-50" />
          {emptySlots}자리 남음
        </div>
      )}

      {/* 관전자 섹션 */}
      {spectators.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">관전자</span>
            <span className="text-xs text-text-muted">{spectators.length}명</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {spectators.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-bg-tertiary/50 rounded-lg text-sm text-text-secondary"
              >
                {p.avatar ? (
                  <Image src={p.avatar} alt="" width={20} height={20} className="rounded-full" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] font-bold text-text-muted">
                    {p.username?.[0]?.toUpperCase()}
                  </div>
                )}
                <span className="truncate max-w-[80px]">{p.username}</span>
                {p.userId === currentUser?.id && (
                  <span className="text-[10px] text-accent-primary font-semibold">(나)</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
