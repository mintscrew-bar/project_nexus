"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BracketView } from "@/components/domain/BracketView";
import { LoadingSpinner, Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
import { Trophy, Users, Calendar } from "lucide-react";

// Mock data for now - will be replaced with real data from store
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

export default function MatchPage() {
  const params = useParams();
  const matchId = params.id as string;
  const [isLoading, setIsLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    // TODO: Connect to match socket and fetch real data
    // For now, using mock data
    setTimeout(() => {
      setMatches([
        // 준결승 (Round 2)
        {
          id: "m3",
          round: 2,
          matchNumber: 1,
          team1: { id: "t1", name: "Team Alpha", score: 0 },
          team2: { id: "t2", name: "Team Beta", score: 0 },
          status: 'PENDING',
        },
        {
          id: "m4",
          round: 2,
          matchNumber: 2,
          team1: { id: "t3", name: "Team Gamma", score: 0 },
          team2: { id: "t4", name: "Team Delta", score: 0 },
          status: 'PENDING',
        },
        // 결승 (Round 3)
        {
          id: "m5",
          round: 3,
          matchNumber: 1,
          status: 'PENDING',
        },
      ]);
      setIsLoading(false);
    }, 1000);
  }, [matchId]);

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">토너먼트 로딩 중...</p>
        </div>
      </div>
    );
  }

  const totalTeams = Math.pow(2, Math.max(...matches.map(m => m.round)));
  const rounds = Math.max(...matches.map(m => m.round));
  const completedMatches = matches.filter(m => m.status === 'COMPLETED').length;

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto">
        {/* Page Header */}
        <div className="mb-6 animate-fade-in">
          <h1 className="text-3xl font-bold text-text-primary mb-2 flex items-center">
            <Trophy className="h-8 w-8 mr-3 text-accent-gold" />
            토너먼트 대진표
          </h1>
          <p className="text-text-secondary">
            Tournament ID: <span className="text-accent-primary font-mono">{matchId}</span>
          </p>
        </div>

        {/* Tournament Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary mb-1">참가 팀</p>
                  <p className="text-2xl font-bold text-accent-primary">{totalTeams}</p>
                </div>
                <Users className="h-8 w-8 text-accent-primary opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary mb-1">총 라운드</p>
                  <p className="text-2xl font-bold text-accent-gold">{rounds}</p>
                </div>
                <Trophy className="h-8 w-8 text-accent-gold opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary mb-1">완료된 경기</p>
                  <p className="text-2xl font-bold text-accent-success">
                    {completedMatches} / {matches.length}
                  </p>
                </div>
                <Calendar className="h-8 w-8 text-accent-success opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bracket */}
        <Card>
          <CardHeader>
            <CardTitle>대진표</CardTitle>
          </CardHeader>
          <CardContent>
            <BracketView matches={matches} rounds={rounds} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
