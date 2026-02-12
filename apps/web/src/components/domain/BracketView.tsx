"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui";
import { Trophy, Swords, ShieldX } from "lucide-react";

interface Team {
  id: string;
  name: string;
  score?: number;
}

export interface Match { // Exporting for use in other components
  id: string;
  round: number;
  matchNumber: number;
  team1?: Team;
  team2?: Team;
  winner?: Team;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  scheduledTime?: string;
  tournamentCode?: string;
  bracketSection?: string; // "WB_R1", "WB_F", "LB_R1", "LB_F", "GF", etc.
}

interface BracketViewProps {
  matches: Match[];
  rounds: number;
  onMatchClick: (match: Match) => void;
}

// --- Shared match card ---
function MatchCard({ match, onMatchClick }: { match: Match; onMatchClick: (m: Match) => void }) {
  const getStatusColor = (status: Match['status']) => {
    switch (status) {
      case 'IN_PROGRESS': return "border-accent-primary bg-accent-primary/5";
      case 'COMPLETED':   return "border-accent-success bg-accent-success/5";
      default:            return "border-bg-tertiary";
    }
  };

  return (
    <Card
      className={`transition-all hover:border-accent-primary cursor-pointer ${getStatusColor(match.status)}`}
      onClick={() => onMatchClick(match)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-secondary">
            매치 #{match.matchNumber}
          </span>
          {match.status === 'IN_PROGRESS' && (
            <span className="flex items-center text-xs text-accent-primary">
              <Swords className="h-3 w-3 mr-1" />진행 중
            </span>
          )}
          {match.status === 'COMPLETED' && match.winner && (
            <span className="flex items-center text-xs text-accent-success">
              <Trophy className="h-3 w-3 mr-1" />완료
            </span>
          )}
        </div>

        {/* Team 1 */}
        <div className={`flex items-center justify-between p-3 rounded-lg mb-2 ${
          match.winner?.id === match.team1?.id
            ? "bg-accent-success/20 border border-accent-success"
            : "bg-bg-tertiary"
        }`}>
          <div className="flex items-center space-x-2">
            {match.winner?.id === match.team1?.id && <Trophy className="h-4 w-4 text-accent-gold" />}
            <span className="font-semibold text-text-primary">{match.team1?.name || "TBD"}</span>
          </div>
          {match.team1?.score !== undefined && (
            <span className="text-lg font-bold text-text-primary">{match.team1.score}</span>
          )}
        </div>

        <div className="text-center text-xs text-text-tertiary my-1">VS</div>

        {/* Team 2 */}
        <div className={`flex items-center justify-between p-3 rounded-lg ${
          match.winner?.id === match.team2?.id
            ? "bg-accent-success/20 border border-accent-success"
            : "bg-bg-tertiary"
        }`}>
          <div className="flex items-center space-x-2">
            {match.winner?.id === match.team2?.id && <Trophy className="h-4 w-4 text-accent-gold" />}
            <span className="font-semibold text-text-primary">{match.team2?.name || "TBD"}</span>
          </div>
          {match.team2?.score !== undefined && (
            <span className="text-lg font-bold text-text-primary">{match.team2.score}</span>
          )}
        </div>

        {match.scheduledTime && match.status === 'PENDING' && (
          <div className="mt-3 text-xs text-text-secondary text-center">
            예정: {new Date(match.scheduledTime).toLocaleString('ko-KR')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Standard (single-elim / round-robin) bracket ---
function StandardBracket({ matches, rounds, onMatchClick }: BracketViewProps) {
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

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-8 p-4 min-w-max">
        {Array.from({ length: rounds }, (_, i) => i + 1).map(round => (
          <div key={round} className="flex flex-col space-y-4 min-w-[280px]">
            <div className="text-center">
              <h3 className="text-lg font-bold text-text-primary flex items-center justify-center">
                {round === rounds && <Trophy className="h-5 w-5 mr-2 text-accent-gold" />}
                {getRoundName(round)}
              </h3>
              <p className="text-sm text-text-secondary">{matchesByRound[round]?.length || 0}경기</p>
            </div>
            <div className="space-y-8">
              {matchesByRound[round]?.map(match => (
                <MatchCard key={match.id} match={match} onMatchClick={onMatchClick} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Section label order for DE display
const WB_SECTIONS = ['WB_R1', 'WB_R2', 'WB_R3', 'WB_F'];
const LB_SECTIONS = ['LB_R1', 'LB_R2', 'LB_R3', 'LB_SEMI', 'LB_F'];

const SECTION_LABELS: Record<string, string> = {
  WB_R1: 'WB 1라운드', WB_R2: 'WB 준결승', WB_R3: 'WB 8강', WB_F: 'WB 결승',
  LB_R1: 'LB 1라운드', LB_R2: 'LB 2라운드', LB_R3: 'LB 3라운드',
  LB_SEMI: 'LB 준결승', LB_F: 'LB 결승',
  GF: '그랜드파이널',
};

// --- Double Elimination bracket ---
function DoubleEliminationBracket({ matches, onMatchClick }: { matches: Match[]; onMatchClick: (m: Match) => void }) {
  const bySec = React.useMemo(() => {
    const map: Record<string, Match[]> = {};
    for (const m of matches) {
      const sec = m.bracketSection || 'unknown';
      if (!map[sec]) map[sec] = [];
      map[sec].push(m);
    }
    // Sort within each section by matchNumber
    Object.values(map).forEach(arr => arr.sort((a, b) => a.matchNumber - b.matchNumber));
    return map;
  }, [matches]);

  const presentWB = WB_SECTIONS.filter(s => bySec[s]?.length);
  const presentLB = LB_SECTIONS.filter(s => bySec[s]?.length);
  const hasGF = !!bySec['GF']?.length;

  const renderSection = (section: string) => (
    <div key={section} className="flex flex-col space-y-4 min-w-[280px]">
      <div className="text-center">
        <h3 className="text-base font-bold text-text-primary flex items-center justify-center gap-1">
          {section === 'GF' && <Trophy className="h-4 w-4 text-accent-gold" />}
          {SECTION_LABELS[section] || section}
        </h3>
        <p className="text-xs text-text-secondary">{bySec[section]?.length}경기</p>
      </div>
      <div className="space-y-4">
        {bySec[section]?.map(match => (
          <MatchCard key={match.id} match={match} onMatchClick={onMatchClick} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="w-full overflow-x-auto space-y-6">
      {/* Winners Bracket */}
      {presentWB.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-4 mb-3">
            <Trophy className="h-4 w-4 text-accent-gold" />
            <h2 className="text-sm font-bold text-accent-gold uppercase tracking-wider">승자조 (Winners Bracket)</h2>
          </div>
          <div className="flex gap-6 p-4 min-w-max">
            {presentWB.map(renderSection)}
          </div>
        </div>
      )}

      {/* Divider */}
      {presentLB.length > 0 && (
        <div className="border-t border-dashed border-bg-tertiary mx-4" />
      )}

      {/* Losers Bracket */}
      {presentLB.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-4 mb-3">
            <ShieldX className="h-4 w-4 text-accent-danger" />
            <h2 className="text-sm font-bold text-accent-danger uppercase tracking-wider">패자조 (Losers Bracket)</h2>
          </div>
          <div className="flex gap-6 p-4 min-w-max">
            {presentLB.map(renderSection)}
          </div>
        </div>
      )}

      {/* Grand Final */}
      {hasGF && (
        <>
          <div className="border-t border-bg-tertiary mx-4" />
          <div className="flex justify-center p-4">
            {renderSection('GF')}
          </div>
        </>
      )}
    </div>
  );
}

// --- Main BracketView ---
export function BracketView({ matches, rounds, onMatchClick }: BracketViewProps) {
  const isDoubleElim = matches.some(m => m.bracketSection?.startsWith('LB') || m.bracketSection === 'GF');

  if (isDoubleElim) {
    return <DoubleEliminationBracket matches={matches} onMatchClick={onMatchClick} />;
  }

  return <StandardBracket matches={matches} rounds={rounds} onMatchClick={onMatchClick} />;
}
