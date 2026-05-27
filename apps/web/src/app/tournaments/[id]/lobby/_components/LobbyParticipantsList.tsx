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
  selectTeam: (
    teamId: string | null,
    onError?: (message: string) => void,
    onSuccess?: () => void,
  ) => void;
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
  selectTeam,
  addToast,
}: LobbyParticipantsListProps) {
  const manualTeams = room.teamMode === "MANUAL_TEAM" ? room.teams ?? [] : [];
  const isManualTeamMode = manualTeams.length > 0 && room.status === "WAITING";
  const waitingPlayers = isManualTeamMode
    ? players.filter((player: any) => !player.teamId)
    : players;
  const participantCard = (participant: any) => (
    <CompactParticipantCard
      key={participant.id}
      p={participant}
      isCurrentUserHost={isCurrentUserHost}
      isSelf={participant.userId === currentUser?.id}
      isFriend={friendUserIds.has(participant.userId)}
      isSent={sentFriendIds.has(participant.userId)}
      addingFriend={addingFriend}
      setHoveredPlayer={setHoveredPlayer}
      scheduleHoverClose={scheduleHoverClose}
      cancelHoverClose={cancelHoverClose}
      handleAddFriend={handleAddFriend}
      setKickTarget={setKickTarget}
      cardRef={null}
    />
  );

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

      {isManualTeamMode && (
        <div className="mb-4 rounded-xl border border-bg-tertiary bg-bg-tertiary/25 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-text-primary">팀 선택</p>
              <p className="text-xs text-text-tertiary">
                팀을 이동하면 준비가 해제됩니다. 빈자리가 없으면 대기석을 이용하세요.
              </p>
            </div>
            {currentUserParticipant?.teamId && !currentUserIsSpectator && (
              <button
                type="button"
                onClick={() =>
                  selectTeam(
                    null,
                    (err) => addToast(err, "error"),
                    () => addToast("대기석으로 이동했습니다.", "info"),
                  )
                }
                className="rounded-md bg-bg-tertiary px-2 py-1 text-xs text-text-secondary hover:bg-bg-elevated"
              >
                대기석으로 이동
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {manualTeams.map((team: any) => {
              const members = players.filter((player: any) => player.teamId === team.id);
              const selected = currentUserParticipant?.teamId === team.id;
              const full = members.length >= 5;
              return (
                <div
                  key={team.id}
                  className={`rounded-lg border p-2.5 ${
                    selected
                      ? "border-accent-primary bg-accent-primary/10"
                      : "border-bg-elevated bg-bg-secondary"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: team.color || "#64748b" }}
                      />
                      {team.name}
                    </span>
                    <span className="text-xs text-text-tertiary">{members.length}/5</span>
                  </div>
                  <div className="mb-2 grid gap-1.5">
                    {members.map(participantCard)}
                    {members.length === 0 && (
                      <div className="rounded-md border border-dashed border-bg-elevated/60 py-2 text-center text-xs text-text-muted">
                        비어 있음
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={currentUserIsSpectator || selected || full}
                    onClick={() =>
                      selectTeam(
                        team.id,
                        (err) => addToast(err, "error"),
                        () =>
                          addToast(
                            `${team.name}을 선택했습니다. 준비 상태를 확인해주세요.`,
                            "success",
                          ),
                      )
                    }
                    className="w-full rounded-md bg-bg-tertiary px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {selected ? "선택됨" : full ? "가득 참" : "이 팀으로 이동"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isManualTeamMode && (
        <div className="mb-2 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">대기석</p>
            <p className="text-xs text-text-tertiary">
              아직 팀을 고르지 않았거나 팀을 바꾸려는 플레이어
            </p>
          </div>
          <span className="text-xs text-text-tertiary">{waitingPlayers.length}명</span>
        </div>
      )}

      {/* 플레이어 목록 또는 자유 팀 편성 대기석 */}
      <div className="grid grid-cols-2 gap-1.5">
        {waitingPlayers.map(participantCard)}
      </div>
      {isManualTeamMode && waitingPlayers.length === 0 && (
        <div className="mt-2 text-center py-2 rounded-lg border border-dashed border-bg-elevated/60 text-sm text-text-muted">
          대기석이 비어 있습니다
        </div>
      )}
      {!isManualTeamMode && emptySlots > 0 && (
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
