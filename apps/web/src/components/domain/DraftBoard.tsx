"use client";

import React, { useCallback, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@/components/ui";
import { TierBadge } from "@/components/domain";
import { PlayerHoverCard } from "@/components/domain/PlayerHoverCard";
import { PlayerProfileModal } from "@/components/domain/PlayerProfileModal";
import { Clock, Crown, Users } from "lucide-react";
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
  const [hoveredPlayer, setHoveredPlayer] = useState<{ player: Player; rect: DOMRect } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClose = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  const scheduleHoverClose = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);

  const handlePlayerHover = useCallback((player: Player, el: HTMLElement) => {
    cancelHoverClose();
    setHoveredPlayer({ player, rect: el.getBoundingClientRect() });
  }, [cancelHoverClose]);

  // Calculate time remaining
  React.useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((draftState.timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 100);

    return () => clearInterval(interval);
  }, [draftState.timerEnd]);

  // Find current picking team
  const currentTeam = draftState.teams.find(t => t.id === draftState.currentTeamId);
  const isMyTurn = currentTeam?.captainId === currentUserId;

  // 타이머 색상 — 10초 이하 경고, 5초 이하 위험
  const timerColor =
    timeLeft <= 5 ? "text-accent-danger" :
    timeLeft <= 10 ? "text-accent-warning" :
    "text-text-primary";

  // 팀당 총 픽 슬롯: pickOrder에서 해당 팀 ID 등장 횟수 (팀장 제외 추가 픽 수)
  const pickSlotsByTeam = (teamId: string) =>
    draftState.pickOrder.filter(id => id === teamId).length;

  // Clear selection when turn changes or selected player was picked
  React.useEffect(() => {
    setSelectedPlayer(null);
    setIsPicking(false);
  }, [draftState.currentTeamId]);

  // Get position icon
  const getPositionIcon = (position?: string): string => {
    if (!position) return "❓";
    switch (position.toLowerCase()) {
      case "top": return "⚔️";
      case "jungle": return "🌲";
      case "mid": return "⭐";
      case "adc": return "🏹";
      case "support": return "🛡️";
      default: return "❓";
    }
  };

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

  return (
    <>
      {/* Draft Status Header */}
      <Card className="overflow-hidden p-0">
        <CardContent className="p-5">
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
              <span>{draftState.currentPickIndex} / {draftState.pickOrder.length}</span>
            </div>
            <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary transition-all duration-300"
                style={{
                  width: `${(draftState.currentPickIndex / draftState.pickOrder.length) * 100}%`
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Teams */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-text-primary flex items-center">
            <Users className="h-5 w-5 mr-2 text-text-secondary" />
            팀 구성
          </h2>

          {draftState.teams.map((team) => {
            const isMyTeam = team.captainId === currentUserId ||
              team.members.some(m => m.id === currentUserId);
            const isCurrentTurn = team.id === draftState.currentTeamId;
            const totalSlots = 1 + pickSlotsByTeam(team.id); // 팀장 + 추가 픽 수
            const emptySlots = totalSlots - team.members.length;

            return (
              <Card
                key={team.id}
                className={cn(
                  "overflow-hidden p-0",
                  isCurrentTurn && "border-accent-primary/50",
                  isMyTeam && !isCurrentTurn && "border-accent-primary/40",
                )}
              >
                <CardHeader className="mb-0 border-b border-bg-tertiary bg-bg-tertiary/20 px-4 py-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      {team.color && (
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />
                      )}
                      {team.name}
                      {isMyTeam && (
                        <span className="text-xs font-normal px-1.5 py-0.5 bg-accent-primary/20 text-accent-primary rounded-md">
                          내 팀
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-text-secondary">
                      {team.members.length}/{totalSlots}명
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="space-y-1.5">
                    {team.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-md bg-bg-tertiary/60 px-2.5 py-2 cursor-default"
                        onMouseEnter={(e) => handlePlayerHover(member, e.currentTarget)}
                        onMouseLeave={scheduleHoverClose}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-xl">{getPositionIcon(member.position)}</span>
                          <span className="font-medium text-text-primary">
                            {member.username}
                          </span>
                          {member.id === team.captainId && (
                            <Crown className="h-3.5 w-3.5 text-accent-gold" />
                          )}
                        </div>
                        {member.tier && <TierBadge tier={member.tier} size="sm" />}
                      </div>
                    ))}
                    {/* 빈 슬롯 */}
                    {Array.from({ length: emptySlots }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="flex items-center rounded-md border border-dashed border-bg-tertiary/80 px-2.5 py-2"
                      >
                        <span className="text-sm text-text-muted">대기 중...</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Available Players */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-3">
            선택 가능한 플레이어 ({draftState.availablePlayers.length})
          </h2>

          <Card className="overflow-hidden p-0">
            <CardContent className="p-3">
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {draftState.availablePlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayer(player.id)}
                    disabled={!isMyTurn || disabled}
                    onMouseEnter={(e) => handlePlayerHover(player, e.currentTarget)}
                    onMouseLeave={scheduleHoverClose}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors",
                      selectedPlayer === player.id
                        ? "border-accent-primary/40 bg-accent-primary/10 text-text-primary"
                        : "border-transparent bg-bg-tertiary/60 hover:bg-bg-elevated",
                      !isMyTurn || disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer",
                    )}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getPositionIcon(player.position)}</span>
                      <div className="text-left">
                        <p className="font-semibold">{player.username}</p>
                        {player.position && (
                          <p className="text-xs opacity-75">{player.position}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {player.mmr !== undefined && (
                        <span className="text-xs font-mono font-semibold text-text-muted">
                          {player.mmr}
                        </span>
                      )}
                      {player.tier && (
                        <TierBadge
                          tier={player.tier}
                          size="sm"
                        />
                      )}
                    </div>
                  </button>
                ))}

                {draftState.availablePlayers.length === 0 && (
                  <div className="text-center py-8 text-text-secondary">
                    <p>모든 플레이어가 선택되었습니다</p>
                  </div>
                )}
              </div>

              {isMyTurn && selectedPlayer && (
                <div className="mt-4 pt-4 border-t border-bg-tertiary">
                  <Button
                    onClick={handlePickPlayer}
                    disabled={disabled || isPicking}
                    className="w-full"
                    size="lg"
                  >
                    {isPicking ? "선택 중..." : "선택 확정"}
                  </Button>
                </div>
              )}

              {!isMyTurn && (
                <div className="mt-4 pt-4 border-t border-bg-tertiary text-center text-text-secondary">
                  <p className="text-sm">다른 팀의 픽을 기다리는 중...</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {hoveredPlayer && (
      <PlayerHoverCard
        participant={{
          userId: hoveredPlayer.player.id,
          username: hoveredPlayer.player.username,
          riotAccount: hoveredPlayer.player.tier && hoveredPlayer.player.tier !== "UNRANKED"
            ? { tier: hoveredPlayer.player.tier, rank: hoveredPlayer.player.rank, mainRole: hoveredPlayer.player.position }
            : null,
          clanMemberships: [],
        }}
        anchorRect={hoveredPlayer.rect}
        onOpenProfile={(userId) => { setProfileUserId(userId); setHoveredPlayer(null); }}
        onMouseEnter={cancelHoverClose}
        onMouseLeave={scheduleHoverClose}
      />
    )}
      <PlayerProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </>
  );
}
