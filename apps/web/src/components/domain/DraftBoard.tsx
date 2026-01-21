"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@/components/ui";
import { TierBadge } from "@/components/domain";
import { Clock, Crown, Users } from "lucide-react";

interface Player {
  id: string;
  username: string;
  tier?: string;
  position?: string;
}

interface Team {
  id: string;
  name: string;
  captainId: string;
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
  onMakePick: (playerId: string) => void;
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

  const handlePickPlayer = () => {
    if (selectedPlayer && !disabled && isMyTurn) {
      onMakePick(selectedPlayer);
      setSelectedPlayer(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Draft Status Header */}
      <Card className="bg-gradient-to-r from-bg-secondary to-bg-tertiary">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Clock className="h-8 w-8 text-accent-primary" />
              <div>
                <p className="text-sm text-text-secondary">픽 타이머</p>
                <p className="text-3xl font-bold text-text-primary">
                  {timeLeft}초
                </p>
              </div>
            </div>

            {currentTeam && (
              <div className="text-right">
                <p className="text-sm text-text-secondary">현재 픽 순서</p>
                <p className="text-xl font-bold text-accent-primary">
                  <Crown className="inline h-5 w-5 mr-1" />
                  {currentTeam.name}
                </p>
                {isMyTurn && (
                  <p className="text-sm text-accent-success mt-1">당신의 차례입니다!</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Teams */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-text-primary flex items-center">
            <Users className="h-6 w-6 mr-2" />
            팀 구성
          </h2>

          {draftState.teams.map((team) => (
            <Card
              key={team.id}
              className={team.id === draftState.currentTeamId ? "ring-2 ring-accent-primary" : ""}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    {team.id === draftState.currentTeamId && (
                      <Crown className="h-5 w-5 mr-2 text-accent-gold" />
                    )}
                    {team.name}
                  </span>
                  <span className="text-sm text-text-secondary">
                    {team.members.length}명
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {team.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between bg-bg-tertiary p-2 rounded-lg"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-xl">{getPositionIcon(member.position)}</span>
                        <span className="font-medium text-text-primary">
                          {member.username}
                        </span>
                      </div>
                      {member.tier && <TierBadge tier={member.tier} size="sm" />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Available Players */}
        <div>
          <h2 className="text-2xl font-bold text-text-primary mb-4">
            선택 가능한 플레이어 ({draftState.availablePlayers.length})
          </h2>

          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {draftState.availablePlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayer(player.id)}
                    disabled={!isMyTurn || disabled}
                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                      selectedPlayer === player.id
                        ? "bg-accent-primary text-white ring-2 ring-accent-hover"
                        : "bg-bg-tertiary hover:bg-bg-elevated"
                    } ${
                      !isMyTurn || disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:scale-[1.02] cursor-pointer"
                    }`}
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
                    {player.tier && (
                      <TierBadge
                        tier={player.tier}
                        size="sm"
                        className={selectedPlayer === player.id ? "opacity-90" : ""}
                      />
                    )}
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
                    disabled={disabled}
                    className="w-full"
                    size="lg"
                  >
                    선택 확정
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
    </div>
  );
}
