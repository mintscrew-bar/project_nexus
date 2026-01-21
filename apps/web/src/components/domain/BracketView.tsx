"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui";
import { Trophy, Swords } from "lucide-react";

interface Team {
  id: string;
  name: string;
  score?: number;
}

interface Match {
  id: string;
  round: number;
  matchNumber: number;
  team1?: Team;
  team2?: Team;
  winner?: Team;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  scheduledTime?: string;
}

interface BracketViewProps {
  matches: Match[];
  rounds: number;
}

export function BracketView({ matches, rounds }: BracketViewProps) {
  // Group matches by round
  const matchesByRound = React.useMemo(() => {
    const grouped: Record<number, Match[]> = {};
    for (let i = 1; i <= rounds; i++) {
      grouped[i] = matches.filter(m => m.round === i).sort((a, b) => a.matchNumber - b.matchNumber);
    }
    return grouped;
  }, [matches, rounds]);

  const getRoundName = (round: number): string => {
    if (round === rounds) return "결승";
    if (round === rounds - 1) return "준결승";
    if (round === rounds - 2) return "8강";
    return `${round}라운드`;
  };

  const getMatchStatusColor = (status: Match['status']): string => {
    switch (status) {
      case 'IN_PROGRESS': return "border-accent-primary bg-accent-primary/5";
      case 'COMPLETED': return "border-accent-success bg-accent-success/5";
      default: return "border-bg-tertiary";
    }
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-8 p-4 min-w-max">
        {Array.from({ length: rounds }, (_, i) => i + 1).map(round => (
          <div key={round} className="flex flex-col space-y-4 min-w-[280px]">
            {/* Round Header */}
            <div className="text-center">
              <h3 className="text-lg font-bold text-text-primary flex items-center justify-center">
                {round === rounds && <Trophy className="h-5 w-5 mr-2 text-accent-gold" />}
                {getRoundName(round)}
              </h3>
              <p className="text-sm text-text-secondary">
                {matchesByRound[round]?.length || 0}경기
              </p>
            </div>

            {/* Matches in this round */}
            <div className="space-y-8">
              {matchesByRound[round]?.map(match => (
                <Card
                  key={match.id}
                  className={`transition-all ${getMatchStatusColor(match.status)}`}
                >
                  <CardContent className="p-4">
                    {/* Match Header */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-text-secondary">
                        매치 #{match.matchNumber}
                      </span>
                      {match.status === 'IN_PROGRESS' && (
                        <span className="flex items-center text-xs text-accent-primary">
                          <Swords className="h-3 w-3 mr-1" />
                          진행 중
                        </span>
                      )}
                      {match.status === 'COMPLETED' && match.winner && (
                        <span className="flex items-center text-xs text-accent-success">
                          <Trophy className="h-3 w-3 mr-1" />
                          완료
                        </span>
                      )}
                    </div>

                    {/* Team 1 */}
                    <div
                      className={`flex items-center justify-between p-3 rounded-lg mb-2 ${
                        match.winner?.id === match.team1?.id
                          ? "bg-accent-success/20 border border-accent-success"
                          : "bg-bg-tertiary"
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {match.winner?.id === match.team1?.id && (
                          <Trophy className="h-4 w-4 text-accent-gold" />
                        )}
                        <span className="font-semibold text-text-primary">
                          {match.team1?.name || "TBD"}
                        </span>
                      </div>
                      {match.team1?.score !== undefined && (
                        <span className="text-lg font-bold text-text-primary">
                          {match.team1.score}
                        </span>
                      )}
                    </div>

                    {/* VS Divider */}
                    <div className="text-center text-xs text-text-tertiary my-1">VS</div>

                    {/* Team 2 */}
                    <div
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        match.winner?.id === match.team2?.id
                          ? "bg-accent-success/20 border border-accent-success"
                          : "bg-bg-tertiary"
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        {match.winner?.id === match.team2?.id && (
                          <Trophy className="h-4 w-4 text-accent-gold" />
                        )}
                        <span className="font-semibold text-text-primary">
                          {match.team2?.name || "TBD"}
                        </span>
                      </div>
                      {match.team2?.score !== undefined && (
                        <span className="text-lg font-bold text-text-primary">
                          {match.team2.score}
                        </span>
                      )}
                    </div>

                    {/* Scheduled Time */}
                    {match.scheduledTime && match.status === 'PENDING' && (
                      <div className="mt-3 text-xs text-text-secondary text-center">
                        예정: {new Date(match.scheduledTime).toLocaleString('ko-KR')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
