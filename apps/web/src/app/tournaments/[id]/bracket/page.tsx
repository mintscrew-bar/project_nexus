"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMatchStore } from "@/stores/match-store";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi, matchApi } from "@/lib/api-client";
import { connectMatchSocket } from "@/lib/socket-client";
import { BracketView, Match, MatchDetailModal, VictoryScreen, GameChatPanel, getTeamDisplayName } from "@/components/domain";
import { LoadingSpinner, Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, RefreshCw, Trophy } from "lucide-react";
import Link from "next/link";

export default function BracketPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const { addToast } = useToast();

  const { user } = useAuthStore();
  const {
    roomMatches, isLoading, error,
    fetchRoomMatches, connectToBracket, disconnect, reset,
    startMatch, reportResult,
    tournamentCompleted, finalStandings,
    sessionAbortedAt, sessionAbortMessage, clearSessionAbort,
  } = useMatchStore();

  // ID만 저장 — 실제 매치 객체는 bracketMatches에서 파생 (WebSocket 업데이트 자동 반영)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [liveStatus, setLiveStatus] = useState<any>(null);

  // host 여부 — 브래킷 세션 중 변경되지 않으므로 1회만 조회
  const { data: isHost = false } = useQuery({
    queryKey: ["bracketHost", roomId, user?.id],
    queryFn: async () => {
      const room = await roomApi.getRoom(roomId);
      return room.hostId === user!.id;
    },
    staleTime: Infinity,
    enabled: Boolean(roomId && user),
  });

  // fetchRoomMatches/connectToBracket/disconnect는 zustand 스토어 함수로 참조가 안정적이므로 dependency에서 제외
  useEffect(() => {
    if (roomId) {
      fetchRoomMatches(roomId);
      connectToBracket(roomId);
    }

    return () => {
      reset();
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    if (!sessionAbortedAt) return;
    addToast(sessionAbortMessage ?? "내전이 종료되어 로비로 이동합니다.", "warning");
    clearSessionAbort();
    const timer = setTimeout(() => router.push(`/tournaments/${roomId}/lobby`), 1500);
    return () => clearTimeout(timer);
  }, [sessionAbortedAt, sessionAbortMessage, clearSessionAbort, addToast, router, roomId]);

  const handleRefresh = () => {
    fetchRoomMatches(roomId);
  };

  const handleMatchClick = async (match: Match) => {
    setSelectedMatchId(match.id);
    setIsModalOpen(true);
    setLiveStatus(null);

    if (match.status === 'IN_PROGRESS') {
      try {
        const status = await matchApi.getLiveStatus(match.id);
        setLiveStatus(status);
      } catch {
        setLiveStatus(null);
      }
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMatchId(null);
    setLiveStatus(null);
  };

  const handleRefreshLiveStatus = useCallback(async (matchId: string) => {
    try {
      const status = await matchApi.getLiveStatus(matchId);
      setLiveStatus(status);
    } catch {
      addToast("라이브 상태 새로고침에 실패했습니다.", "error");
    }
  }, [addToast]);

  const handleStartMatch = async (matchId: string) => {
    try {
      await startMatch(matchId);
      // roomMatches가 WebSocket으로 자동 업데이트되므로 selectedMatch 수동 갱신 불필요
    } catch (error: any) {
      addToast(error?.response?.data?.message || "매치 시작에 실패했습니다.", "error");
    }
  };

  const handleReportResult = async (matchId: string, winnerId: string) => {
    try {
      await reportResult(matchId, winnerId);
      handleCloseModal();
    } catch (error: any) {
      addToast(error?.response?.data?.message || "경기 결과 보고에 실패했습니다.", "error");
    }
  };

  const handleAbortToLobby = async () => {
    const confirmed = window.confirm(
      "현재 판을 종료하고 대기실로 돌아가시겠습니까? 이 판은 전적에 반영되지 않습니다.",
    );
    if (!confirmed) return;

    setIsAborting(true);
    try {
      await roomApi.abortToLobby(roomId);
      addToast("내전을 종료하고 대기실로 복귀합니다.", "success");
      router.push(`/tournaments/${roomId}/lobby`);
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "내전 종료에 실패했습니다.",
        "error",
      );
    } finally {
      setIsAborting(false);
    }
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
    team1: m.teamA ? { id: m.teamA.id, name: m.teamA.name, score: m.teamA.score, captain: m.teamA.captain } : undefined,
    team2: m.teamB ? { id: m.teamB.id, name: m.teamB.name, score: m.teamB.score, captain: m.teamB.captain } : undefined,
    winner: m.winnerId
      ? (m.teamA?.id === m.winnerId && m.teamA
        ? { id: m.teamA.id, name: m.teamA.name, captain: m.teamA.captain }
        : m.teamB?.id === m.winnerId && m.teamB
          ? { id: m.teamB.id, name: m.teamB.name, captain: m.teamB.captain }
          : undefined)
      : undefined,
    status: m.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
    scheduledTime: m.scheduledTime,
    tournamentCode: m.tournamentCode,
    bracketSection: m.bracketRound || undefined,
  }));

  // bracketMatches에서 selectedMatch 파생 — roomMatches WebSocket 업데이트 시 자동 반영
  const selectedMatch = bracketMatches.find(m => m.id === selectedMatchId) ?? null;

  // 가위바위보 소집(rps:invite) — 호스트가 매치 시작 시 상대 팀장 모달 자동 오픈
  const bracketMatchesRef = useRef(bracketMatches);
  bracketMatchesRef.current = bracketMatches;
  useEffect(() => {
    const socket = connectMatchSocket();
    if (!socket) return;
    const onInvite = (data: { matchId?: string }) => {
      if (!data?.matchId) return;
      const m = bracketMatchesRef.current.find((bm) => bm.id === data.matchId);
      if (m) {
        setSelectedMatchId(m.id);
        setIsModalOpen(true);
      }
    };
    socket.on('rps:invite', onInvite);
    return () => { socket.off('rps:invite', onInvite); };
  }, []);

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
    <div className="h-full p-4 md:p-8 overflow-y-auto">
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
              <h1 className="text-2xl md:text-3xl font-bold text-text-primary flex items-center gap-2">
                <Trophy className="h-6 w-6 md:h-8 md:w-8 text-accent-gold" />
                대진표
              </h1>
              <p className="text-text-secondary mt-1">
                Room ID: <span className="font-mono text-accent-primary">{roomId.slice(0, 8)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              isLoading={isAborting}
              onClick={handleAbortToLobby}
            >
              내전 종료
            </Button>
            <Button variant="secondary" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
            </Button>
          </div>
        </div>

        {/* Tournament Status */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <p className="text-sm text-text-secondary mb-1">총 경기</p>
            <p className="text-xl md:text-2xl font-bold text-text-primary">{totalMatches}</p>
          </div>
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <p className="text-sm text-text-secondary mb-1">완료된 경기</p>
            <p className="text-xl md:text-2xl font-bold text-accent-success">{completedMatches}</p>
          </div>
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <p className="text-sm text-text-secondary mb-1">진행 중</p>
            <p className="text-xl md:text-2xl font-bold text-accent-primary">{inProgressMatches}</p>
          </div>
          <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4">
            <p className="text-sm text-text-secondary mb-1">진행률</p>
            <p className="text-xl md:text-2xl font-bold text-accent-gold">
              {totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0}%
            </p>
          </div>
        </div>

        {/* Tournament Winner Banner */}
        {tournamentWinner && (
          <div className="bg-gradient-to-r from-accent-gold/20 to-accent-gold/5 border border-accent-gold/30 rounded-xl p-6 mb-6 text-center">
            <Trophy className="h-12 w-12 text-accent-gold mx-auto mb-3" />
            <h2 className="text-xl md:text-2xl font-bold text-accent-gold mb-1">우승</h2>
            <p className="text-2xl md:text-3xl font-bold text-text-primary">{getTeamDisplayName(tournamentWinner)}</p>
          </div>
        )}

        {/* Bracket View */}
        {bracketMatches.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary">
            <div className="border-b border-bg-tertiary bg-bg-tertiary/30 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <Trophy className="h-4 w-4 text-accent-gold" />
                토너먼트 브래킷
              </div>
            </div>
            <div className="bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:28px_28px] p-3 md:p-4">
            <BracketView
              matches={bracketMatches}
              rounds={rounds}
              onMatchClick={handleMatchClick}
            />
            </div>
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
          isHost={isHost}
          liveStatus={liveStatus}
          onClose={handleCloseModal}
          onStartMatch={handleStartMatch}
          onReportResult={handleReportResult}
          onRefreshLiveStatus={handleRefreshLiveStatus}
        />

        {/* Victory Screen */}
        {tournamentCompleted && finalStandings.length > 0 && (
          <VictoryScreen
            standings={finalStandings}
            roomId={roomId}
            autoRedirectSeconds={30}
          />
        )}
      </div>

      {/* 채팅 패널 (플로팅, 최종 단계 — unmount 시 소켓 정리) */}
      <GameChatPanel roomId={roomId} isFinalStage />
    </div>
  );
}
