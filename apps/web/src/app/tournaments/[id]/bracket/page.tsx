"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMatchStore } from "@/stores/match-store";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi, matchApi } from "@/lib/api-client";
import { BracketView, Match, MatchDetailModal, VictoryScreen } from "@/components/domain";
import { LoadingSpinner, Badge, Button } from "@/components/ui";
import { ArrowLeft, RefreshCw, Trophy } from "lucide-react";
import Link from "next/link";

export default function BracketPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const { user } = useAuthStore();
  const {
    roomMatches, isLoading, error,
    fetchRoomMatches, connectToBracket, disconnect,
    generateTournamentCode, reportResult,
    tournamentCompleted, finalStandings,
  } = useMatchStore();

  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [liveStatus, setLiveStatus] = useState<any>(null);

  useEffect(() => {
    if (roomId) {
      fetchRoomMatches(roomId);
      connectToBracket(roomId);

      // Fetch room info to check if user is host
      roomApi.getRoom(roomId).then((room) => {
        if (user && room.hostId === user.id) {
          setIsHost(true);
        }
      }).catch(() => {});
    }

    return () => {
      disconnect();
    };
  }, [roomId, user, fetchRoomMatches, connectToBracket, disconnect]);

  const handleRefresh = () => {
    fetchRoomMatches(roomId);
  };

  const handleMatchClick = async (match: Match) => {
    setSelectedMatch(match);
    setIsModalOpen(true);
    setLiveStatus(null); // Reset previous live status

    // Fetch live status if match is in progress
    if (match.status === 'IN_PROGRESS') {
      try {
        const status = await matchApi.getLiveStatus(match.id);
        setLiveStatus(status);
      } catch (error) {
        console.error('Failed to fetch live status:', error);
        setLiveStatus(null);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMatch(null);
    setLiveStatus(null); // Clear live status when modal closes
  };

  const handleRefreshLiveStatus = async (matchId: string) => {
    try {
      const status = await matchApi.getLiveStatus(matchId);
      setLiveStatus(status);
    } catch (error) {
      console.error('Failed to refresh live status:', error);
    }
  };

  const handleGenerateCode = async (matchId: string) => {
    setIsGeneratingCode(true);
    try {
      await generateTournamentCode(matchId);
      // Update selected match with the new code from store
      const updatedMatch = roomMatches.find(m => m.id === matchId);
      if (updatedMatch && selectedMatch) {
        setSelectedMatch({
          ...selectedMatch,
          tournamentCode: updatedMatch.tournamentCode,
        });
      }
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleReportResult = async (matchId: string, winnerId: string) => {
    await reportResult(matchId, winnerId);
    // Close modal after reporting
    handleCloseModal();
  };

  // Calculate number of rounds based on matches
  const rounds = roomMatches.length > 0
    ? Math.max(...roomMatches.map(m => m.round || 1))
    : 1;

  // Transform matches to BracketView format (API returns teamA/teamB)
  const bracketMatches: Match[] = roomMatches.map((m, index) => ({
    id: m.id,
    round: m.round || 1,
    matchNumber: m.matchNumber || index + 1,
    team1: m.teamA ? { id: m.teamA.id, name: m.teamA.name, score: m.teamA.score } : undefined,
    team2: m.teamB ? { id: m.teamB.id, name: m.teamB.name, score: m.teamB.score } : undefined,
    winner: m.winnerId
      ? (m.teamA?.id === m.winnerId ? { id: m.teamA.id, name: m.teamA.name } : { id: m.teamB?.id || '', name: m.teamB?.name || '' })
      : undefined,
    status: m.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
    scheduledTime: m.scheduledTime,
    tournamentCode: m.tournamentCode,
    bracketSection: m.bracketRound || undefined,
  }));

  // Get tournament status
  const completedMatches = bracketMatches.filter(m => m.status === 'COMPLETED').length;
  const totalMatches = bracketMatches.length;
  const inProgressMatches = bracketMatches.filter(m => m.status === 'IN_PROGRESS').length;

  // Find winner if tournament is complete
  // For DE, the grand final is the GF-section match; for SE, it's the highest round
  const isDE = bracketMatches.some(m => m.bracketSection === 'GF');
  const finalMatch = isDE
    ? bracketMatches.find(m => m.bracketSection === 'GF')
    : bracketMatches.find(m => m.round === rounds);
  const tournamentWinner = finalMatch?.status === 'COMPLETED' ? finalMatch.winner : null;

  if (isLoading && roomMatches.length === 0) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">대진표 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <p className="text-accent-danger mb-4">오류: {error}</p>
          <Button onClick={handleRefresh}>다시 시도</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-8">
      <div className="container mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href={`/tournaments/${roomId}/lobby`}
              className="p-2 rounded-lg hover:bg-bg-tertiary transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-text-secondary" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
                <Trophy className="h-8 w-8 text-accent-gold" />
                대진표
              </h1>
              <p className="text-text-secondary mt-1">
                Room ID: <span className="font-mono text-accent-primary">{roomId.slice(0, 8)}</span>
              </p>
            </div>
          </div>

          <Button variant="secondary" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>

        {/* Tournament Status */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <p className="text-sm text-text-secondary mb-1">총 경기</p>
            <p className="text-2xl font-bold text-text-primary">{totalMatches}</p>
          </div>
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <p className="text-sm text-text-secondary mb-1">완료된 경기</p>
            <p className="text-2xl font-bold text-accent-success">{completedMatches}</p>
          </div>
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <p className="text-sm text-text-secondary mb-1">진행 중</p>
            <p className="text-2xl font-bold text-accent-primary">{inProgressMatches}</p>
          </div>
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <p className="text-sm text-text-secondary mb-1">진행률</p>
            <p className="text-2xl font-bold text-accent-gold">
              {totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0}%
            </p>
          </div>
        </div>

        {/* Tournament Winner Banner */}
        {tournamentWinner && (
          <div className="bg-gradient-to-r from-accent-gold/20 to-accent-gold/5 border border-accent-gold/30 rounded-xl p-6 mb-6 text-center">
            <Trophy className="h-12 w-12 text-accent-gold mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-accent-gold mb-1">우승</h2>
            <p className="text-3xl font-bold text-text-primary">{tournamentWinner.name}</p>
          </div>
        )}

        {/* Bracket View */}
        {bracketMatches.length > 0 ? (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <BracketView
              matches={bracketMatches}
              rounds={rounds}
              onMatchClick={handleMatchClick}
            />
          </div>
        ) : (
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-12 text-center">
            <Trophy className="h-16 w-16 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-text-primary mb-2">대진표가 아직 생성되지 않았습니다</h3>
            <p className="text-text-secondary">팀 구성이 완료되면 대진표가 자동으로 생성됩니다.</p>
          </div>
        )}

        {/* Match Detail Modal */}
        <MatchDetailModal
          match={selectedMatch}
          isOpen={isModalOpen}
          isGeneratingCode={isGeneratingCode}
          isHost={isHost}
          liveStatus={liveStatus}
          onClose={handleCloseModal}
          onGenerateCode={handleGenerateCode}
          onReportResult={handleReportResult}
          onRefreshLiveStatus={handleRefreshLiveStatus}
        />

        {/* Victory Screen */}
        {tournamentCompleted && finalStandings.length > 0 && (
          <VictoryScreen
            standings={finalStandings}
            autoRedirectSeconds={30}
          />
        )}
      </div>
    </div>
  );
}
