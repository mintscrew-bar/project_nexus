"use client";

import React, { useCallback, useRef, useState } from "react";
import { TierBadge } from "@/components/domain";
import { PlayerHoverCard } from "@/components/domain/PlayerHoverCard";
import { PlayerProfileModal } from "@/components/domain/PlayerProfileModal";
import { PositionIcon } from "@/app/tournaments/[id]/lobby/_components/icons";
import { Clock, Crown, Users, Swords } from "lucide-react";
import { cn } from "@/lib/utils";

interface Player {
  id: string;
  username: string;
  tier?: string;
  rank?: string;
  mmr?: number;
  position?: string;
}

interface Team {
  id: string;
  name: string;
  captainId: string;
  color?: string | null;
  members: Player[];
}

interface DraftState {
  roomId: string;
  teams: Team[];
  availablePlayers: Player[];
  pickOrder: string[];
  currentPickIndex: number;
  currentTeamId: string | null;
  timerEnd: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface DraftBoardProps {
  draftState: DraftState;
  currentUserId?: string;
  onMakePick: (playerId: string) => void | Promise<void>;
  disabled?: boolean;
}

export function DraftBoard({
  draftState,
  currentUserId,
  onMakePick,
  disabled = false,
}: DraftBoardProps) {
  const [timeLeft, setTimeLeft] = React.useState(0);
  const [selectedPlayer, setSelectedPlayer] = React.useState<string | null>(null);
  const [isPicking, setIsPicking] = React.useState(false);
  const [hoveredPlayer, setHoveredPlayer] = useState<{ userId: string; rect: DOMRect } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // 모바일(<lg)에서 매물/팀 탭 전환
  const [mobileTab, setMobileTab] = useState<"pool" | "teams">("pool");
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const scheduleHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);

  const handlePlayerHover = useCallback((userId: string, el: HTMLElement) => {
    cancelHoverClose();
    const rect = el.getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer({ userId, rect }), 300);
  }, [cancelHoverClose]);

  // Calculate time remaining
  React.useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((draftState.timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 100);

    return () => clearInterval(interval);
  }, [draftState.timerEnd]);

  // Find current picking team
  const currentTeam = draftState.teams.find(t => t.id === draftState.currentTeamId);
  const isMyTurn = currentTeam?.captainId === currentUserId;
  const totalPicks = draftState.pickOrder.length;
  const progressPercent = totalPicks > 0
    ? Math.min(100, (draftState.currentPickIndex / totalPicks) * 100)
    : 0;

  // 타이머 색상 — 10초 이하 경고, 5초 이하 위험
  const timerColor =
    timeLeft <= 5 ? "text-accent-danger" :
    timeLeft <= 10 ? "text-accent-warning" :
    "text-text-primary";

  // 팀당 총 픽 슬롯: pickOrder에서 해당 팀 ID 등장 횟수 (팀장 제외 추가 픽 수)
  const pickSlotsByTeam = (teamId: string) =>
    draftState.pickOrder.filter(id => id === teamId).length;

  // 좌·우 분할: 앞 절반은 왼쪽, 뒤 절반은 오른쪽 (2팀=1:1, 4팀=2:2)
  const splitMid = Math.ceil(draftState.teams.length / 2);
  const leftTeams = draftState.teams.slice(0, splitMid);
  const rightTeams = draftState.teams.slice(splitMid);

  // Clear selection when turn changes or selected player was picked
  React.useEffect(() => {
    setSelectedPlayer(null);
    setIsPicking(false);
  }, [draftState.currentTeamId]);

  const handlePickPlayer = async () => {
    if (selectedPlayer && !disabled && isMyTurn && !isPicking) {
      setIsPicking(true);
      try {
        await onMakePick(selectedPlayer);
      } finally {
        setIsPicking(false);
      }
      setSelectedPlayer(null);
    }
  };

  // ── 팀 카드 ──
  const renderTeamCard = (team: Team) => {
    const isMyTeam =
      team.captainId === currentUserId || team.members.some(m => m.id === currentUserId);
    const isCurrentTurn = team.id === draftState.currentTeamId;
    const totalSlots = 1 + pickSlotsByTeam(team.id); // 팀장 + 추가 픽 수
    const emptySlots = Math.max(0, totalSlots - team.members.length);

    return (
      <div
        key={team.id}
        className={cn(
          "rounded-xl border bg-bg-secondary overflow-hidden transition-colors",
          isCurrentTurn
            ? "border-accent-primary/60 shadow-[0_0_0_1px] shadow-accent-primary/30"
            : isMyTeam
              ? "border-accent-primary/40"
              : "border-bg-tertiary",
        )}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary"
          style={team.color ? { background: `${team.color}14` } : undefined}
        >
          <div className="flex items-center gap-2 min-w-0">
            {team.color && (
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />
            )}
            <span className="font-bold text-text-primary truncate">{team.name}</span>
            {isCurrentTurn ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary flex-shrink-0">
                픽 중
              </span>
            ) : isMyTeam ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary flex-shrink-0">
                내 팀
              </span>
            ) : null}
          </div>
          <span className="text-xs text-text-secondary flex-shrink-0">
            {team.members.length}/{totalSlots}
          </span>
        </div>
        <div className="p-2.5 space-y-1.5">
          {team.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg bg-bg-tertiary/50 px-2.5 py-2 cursor-default"
              onMouseEnter={(e) => handlePlayerHover(member.id, e.currentTarget)}
              onMouseLeave={scheduleHoverClose}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex w-5 justify-center flex-shrink-0">
                  <PositionIcon position={(member.position ?? "").toUpperCase()} />
                </span>
                <span className="font-medium text-text-primary truncate">{member.username}</span>
                {member.id === team.captainId && (
                  <Crown className="h-3.5 w-3.5 text-accent-gold flex-shrink-0" />
                )}
              </div>
              {member.tier && <TierBadge tier={member.tier} size="sm" />}
            </div>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center rounded-lg border border-dashed border-bg-tertiary px-2.5 py-2 text-sm text-text-muted"
            >
              대기 중...
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── 중앙 매물 풀 ──
  const renderPool = () => (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary">
        <h2 className="font-bold text-text-primary flex items-center gap-2">
          <Swords className="h-4 w-4 text-accent-primary" />
          선택 가능한 선수
          <span className="text-text-secondary font-normal">({draftState.availablePlayers.length})</span>
        </h2>
      </div>
      <div className="p-2.5 space-y-1.5 overflow-y-auto max-h-[60vh]">
        {draftState.availablePlayers.map((player) => (
          <button
            key={player.id}
            onClick={() => setSelectedPlayer(player.id)}
            disabled={!isMyTurn || disabled}
            onMouseEnter={(e) => handlePlayerHover(player.id, e.currentTarget)}
            onMouseLeave={scheduleHoverClose}
            className={cn(
              "w-full flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors text-left",
              selectedPlayer === player.id
                ? "border-accent-primary/50 bg-accent-primary/10"
                : "border-transparent bg-bg-tertiary/50 hover:bg-bg-elevated",
              (!isMyTurn || disabled) && "opacity-50 cursor-not-allowed",
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex w-6 justify-center flex-shrink-0">
                <PositionIcon position={(player.position ?? "").toUpperCase()} className="!w-5 !h-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-text-primary truncate">{player.username}</p>
                {player.position && (
                  <p className="text-xs text-text-secondary">{player.position}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {player.mmr !== undefined && (
                <span className="text-xs font-mono font-semibold text-text-muted">{player.mmr}</span>
              )}
              {player.tier && <TierBadge tier={player.tier} size="sm" />}
            </div>
          </button>
        ))}

        {draftState.availablePlayers.length === 0 && (
          <div className="text-center py-10 text-text-secondary">
            모든 플레이어가 선택되었습니다
          </div>
        )}
      </div>
      <div className="p-3 border-t border-bg-tertiary">
        {isMyTurn ? (
          <button
            onClick={handlePickPlayer}
            disabled={!selectedPlayer || disabled || isPicking}
            className={cn(
              "w-full py-3 rounded-lg font-bold transition-colors",
              selectedPlayer && !disabled && !isPicking
                ? "bg-accent-primary text-white hover:bg-accent-primary/90"
                : "bg-bg-tertiary text-text-muted cursor-not-allowed",
            )}
          >
            {isPicking ? "선택 중..." : selectedPlayer ? "선택 확정" : "선수를 선택하세요"}
          </button>
        ) : (
          <div className="text-center py-3 text-sm text-text-secondary">
            다른 팀의 픽을 기다리는 중...
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Draft Status Header */}
      <div className="rounded-xl border border-bg-tertiary bg-bg-secondary px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className={cn("h-6 w-6", timeLeft <= 5 ? "text-accent-danger" : "text-text-secondary")} />
            <div>
              <p className="text-sm text-text-secondary">픽 타이머</p>
              <p className={cn("text-2xl md:text-3xl font-bold tabular-nums", timerColor)}>
                {timeLeft === 0 ? "자동 픽 중..." : `${timeLeft}초`}
              </p>
            </div>
          </div>

          {currentTeam && (
            <div className="text-right">
              <p className="text-sm text-text-secondary">현재 픽 순서</p>
              <p className="flex items-center justify-end gap-2 text-lg font-semibold text-text-primary">
                {currentTeam.color && (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: currentTeam.color }} />
                )}
                {currentTeam.name}
              </p>
              {isMyTurn && (
                <p className="text-sm text-accent-primary mt-1">내 차례</p>
              )}
            </div>
          )}
        </div>

        {/* Pick Progress */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-text-secondary mb-1">
            <span>드래프트 진행도</span>
            <span>{draftState.currentPickIndex} / {totalPicks}</span>
          </div>
          <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{
                width: `${progressPercent}%`
              }}
            />
          </div>
        </div>
      </div>

      {/* 데스크탑: 좌 팀 | 중앙 매물 | 우 팀 */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_1.5fr_1fr] gap-4 items-start">
        <div className="space-y-3">{leftTeams.map(renderTeamCard)}</div>
        {renderPool()}
        <div className="space-y-3">{rightTeams.map(renderTeamCard)}</div>
      </div>

      {/* 모바일: 탭 (매물 / 팀) */}
      <div className="lg:hidden">
        <div className="grid grid-cols-2 gap-1.5 mb-3 rounded-lg bg-bg-tertiary/50 p-1">
          {([["pool", "매물"], ["teams", "팀"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMobileTab(key)}
              className={cn(
                "py-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-1.5",
                mobileTab === key ? "bg-accent-primary text-white" : "text-text-secondary",
              )}
            >
              {key === "pool" ? <Swords className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              {label}
            </button>
          ))}
        </div>
        {mobileTab === "pool" ? (
          renderPool()
        ) : (
          <div className="space-y-3">{draftState.teams.map(renderTeamCard)}</div>
        )}
      </div>

      {hoveredPlayer && (
        <PlayerHoverCard
          userId={hoveredPlayer.userId}
          anchorRect={hoveredPlayer.rect}
          onOpenProfile={(uid) => { setProfileUserId(uid); setHoveredPlayer(null); }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
      <PlayerProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </div>
  );
}
