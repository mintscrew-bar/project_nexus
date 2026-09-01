"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMatchStore } from "@/stores/match-store";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { connectMatchSocket } from "@/lib/socket-client";
import {
  BracketView,
  Match,
  MatchDetailModal,
  VictoryScreen,
  GameChatPanel,
  getTeamDisplayName,
} from "@/components/domain";
import { LoadingSpinner, Badge, Button, ConfirmModal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ArrowLeft, RefreshCw, Trophy } from "lucide-react";
import Link from "next/link";
import { TeamModeHelp, type TeamMode } from "@/components/rooms/TeamModeHelp";

export default function BracketPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const { addToast } = useToast();

  const { user } = useAuthStore();
  const {
    roomMatches,
    isLoading,
    error,
    fetchRoomMatches,
    connectToBracket,
    disconnect,
    reset,
    reportResult,
    tournamentCompleted,
    finalStandings,
    sessionAbortedAt,
    sessionAbortMessage,
    clearSessionAbort,
  } = useMatchStore();

  // ID만 저장 — 실제 매치 객체는 bracketMatches에서 파생 (WebSocket 업데이트 자동 반영)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [isAbortConfirmOpen, setIsAbortConfirmOpen] = useState(false);

  // host 여부·방 이름 — 브래킷 세션 중 변경되지 않으므로 1회만 조회
  const { data: roomInfo } = useQuery({
    queryKey: ["bracketRoom", roomId, user?.id],
    queryFn: async () => {
      const room = await roomApi.getRoom(roomId);
      return {
        isHost: room.hostId === user!.id,
        name: (room.name ?? null) as string | null,
        teamMode: room.teamMode as TeamMode,
      };
    },
    staleTime: Infinity,
    enabled: Boolean(roomId && user),
  });
  const isHost = roomInfo?.isHost ?? false;

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
    addToast(
      sessionAbortMessage ?? "내전이 종료되어 로비로 이동합니다.",
      "warning",
    );
    clearSessionAbort();
    const timer = setTimeout(
      () => router.push(`/tournaments/${roomId}/lobby`),
      1500,
    );
    return () => clearTimeout(timer);
  }, [
    sessionAbortedAt,
    sessionAbortMessage,
    clearSessionAbort,
    addToast,
    router,
    roomId,
  ]);

  const handleRefresh = () => {
    fetchRoomMatches(roomId);
  };

  const handleMatchClick = (match: Match) => {
    setSelectedMatchId(match.id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMatchId(null);
  };

  const handleReportResult = async (matchId: string, winnerId: string) => {
    try {
      await reportResult(matchId, winnerId);
      handleCloseModal();
    } catch (error: any) {
      addToast(
        error?.response?.data?.message || "경기 결과 보고에 실패했습니다.",
        "error",
      );
    }
  };

  const handleAbortToLobby = () => setIsAbortConfirmOpen(true);

  const handleAbortConfirm = async () => {
    setIsAbortConfirmOpen(false);
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
  const rounds =
    roomMatches.length > 0
      ? Math.max(...roomMatches.map((m) => m.round || 1))
      : 1;

  // 대진표는 슬롯 단위로 그린다.
  //
  // 다전제에서는 슬롯 하나에 세트(Match)가 여러 개 붙으므로 그대로 매핑하면
  // 같은 대진이 카드 여러 장으로 중복 렌더된다. 시리즈별로 묶어 카드 한 장을
  // 만들고, 스코어와 "현재 진행 중인 세트"를 그 카드에 싣는다.
  const bracketMatches: Match[] = (() => {
    const slots = new Map<string, typeof roomMatches>();
    roomMatches.forEach((m, index) => {
      // 시리즈가 없으면(레거시/단판) 매치 자체가 슬롯이다.
      const key = m.seriesId ?? `${m.round ?? 1}-${m.matchNumber ?? index + 1}`;
      const bucket = slots.get(key);
      if (bucket) bucket.push(m);
      else slots.set(key, [m]);
    });

    return Array.from(slots.values()).map((games, index) => {
      const games_ = [...games].sort(
        (a, b) => (a.gameNumber ?? 1) - (b.gameNumber ?? 1),
      );
      const first = games_[0];
      const series = first.series ?? null;
      const bestOf = series?.bestOf ?? 1;

      // 시리즈의 팀 기준으로 승수를 센다. 세트마다 진영이 바뀌어도
      // teamA/teamB 자체는 시리즈에서 미러링되므로 안전하다.
      const teamAId = series?.teamAId ?? first.teamAId ?? first.teamA?.id;
      const teamBId = series?.teamBId ?? first.teamBId ?? first.teamB?.id;
      const teamAWins = games_.filter(
        (g) => g.winnerId && g.winnerId === teamAId,
      ).length;
      const teamBWins = games_.filter(
        (g) => g.winnerId && g.winnerId === teamBId,
      ).length;

      // 카드가 가리키는 매치 = 진행 중이거나 아직 안 끝난 마지막 세트.
      const activeGame =
        games_.find((g) => g.status === "IN_PROGRESS") ??
        games_.find((g) => g.status === "PENDING") ??
        games_[games_.length - 1];

      // 슬롯 상태: 시리즈가 있으면 시리즈 상태를 그대로 쓴다.
      // 없으면 기존처럼 매치 상태.
      const slotStatus = (series?.status ?? activeGame.status) as
        "PENDING" | "IN_PROGRESS" | "COMPLETED";

      const slotWinnerId = series ? series.winnerId : activeGame.winnerId;
      const teamOf = (id?: string | null) => {
        if (!id) return undefined;
        if (first.teamA?.id === id) return first.teamA;
        if (first.teamB?.id === id) return first.teamB;
        return undefined;
      };
      const winnerTeam = teamOf(slotWinnerId);
      const membersOf = (team: typeof first.teamA) =>
        team?.members?.map((member) => ({
          id: member.id,
          username: member.user.username,
          assignedRole: member.assignedRole,
          championPreferences:
            member.user.riotAccounts?.[0]?.championPreferences || [],
        }));

      return {
        id: activeGame.id,
        round: first.round || 1,
        matchNumber: first.matchNumber || index + 1,
        team1: first.teamA
          ? {
              id: first.teamA.id,
              name: first.teamA.name,
              // 다전제일 때만 스코어를 노출한다 (단판은 0-0이 의미 없다).
              score: bestOf > 1 ? teamAWins : first.teamA.score,
              captain: first.teamA.captain,
              members: membersOf(first.teamA),
            }
          : undefined,
        team2: first.teamB
          ? {
              id: first.teamB.id,
              name: first.teamB.name,
              score: bestOf > 1 ? teamBWins : first.teamB.score,
              captain: first.teamB.captain,
              members: membersOf(first.teamB),
            }
          : undefined,
        winner: winnerTeam
          ? {
              id: winnerTeam.id,
              name: winnerTeam.name,
              captain: winnerTeam.captain,
            }
          : undefined,
        status: slotStatus,
        scheduledTime: activeGame.scheduledTime,
        tournamentCode: activeGame.tournamentCode,
        bracketSection: first.bracketRound || undefined,
        bestOf,
        currentGameNumber: activeGame.gameNumber ?? 1,
        // 슬롯 상태(status)와 별개로 지금 가리키는 세트의 상태를 그대로 넘긴다.
        // 시작/보고 UI는 시리즈가 아니라 이 세트를 대상으로 동작하기 때문이다.
        currentGameStatus: activeGame.status as
          "PENDING" | "IN_PROGRESS" | "COMPLETED",
        gameIds: games_.map((g) => g.id),
      };
    });
  })();

  // bracketMatches에서 selectedMatch 파생 — roomMatches WebSocket 업데이트 시 자동 반영
  const selectedMatch =
    bracketMatches.find((m) => m.id === selectedMatchId) ?? null;

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
    socket.on("rps:invite", onInvite);
    return () => {
      socket.off("rps:invite", onInvite);
    };
  }, []);

  // Get tournament status
  const completedMatches = bracketMatches.filter(
    (m) => m.status === "COMPLETED",
  ).length;
  const totalMatches = bracketMatches.length;
  const inProgressMatches = bracketMatches.filter(
    (m) => m.status === "IN_PROGRESS",
  ).length;

  // Find winner if tournament is complete
  // For DE, the grand final is the GF-section match; for SE, it's the highest round
  const isDE = bracketMatches.some((m) => m.bracketSection === "GF");
  const finalMatch = isDE
    ? bracketMatches.find((m) => m.bracketSection === "GF")
    : bracketMatches.find((m) => m.round === rounds);
  const tournamentWinner =
    finalMatch?.status === "COMPLETED" ? finalMatch.winner : null;

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
      <ConfirmModal
        isOpen={isAbortConfirmOpen}
        onClose={() => setIsAbortConfirmOpen(false)}
        onConfirm={handleAbortConfirm}
        title="내전 종료"
        message="현재 판을 종료하고 대기실로 돌아가시겠습니까? 이 판은 전적에 반영되지 않습니다."
        confirmText="종료"
        cancelText="취소"
        variant="danger"
        isLoading={isAborting}
      />
      <div className="mx-auto w-full max-w-none">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link
              href={`/tournaments/${roomId}/lobby`}
              className="shrink-0 rounded-lg p-2 transition-colors hover:bg-bg-tertiary"
              aria-label="로비로 돌아가기"
              title="로비로 돌아가기"
            >
              <ArrowLeft className="h-5 w-5 text-text-secondary" />
            </Link>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary md:text-3xl">
                <Trophy className="h-6 w-6 md:h-8 md:w-8 text-accent-gold" />
                대진표
                {roomInfo?.teamMode && (
                  <TeamModeHelp mode={roomInfo.teamMode} compact />
                )}
              </h1>
              {/* 방 ID는 사용자에게 의미가 없다 — 방 이름을 보여준다 */}
              <p className="mt-1 truncate text-text-secondary">
                {roomInfo?.name ?? `방 #${roomId.slice(0, 4)}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {/* 종료 버튼은 전원에게 보인다. 실행 권한(assertHost)은 서버가 판단한다. */}
            <Button
              variant="danger"
              size="sm"
              isLoading={isAborting}
              onClick={handleAbortToLobby}
              title="이 판을 종료하고 대기실로 돌아갑니다 (전적에 반영되지 않음, 방장만 가능)"
            >
              내전 종료
            </Button>
            <Button
              variant="secondary"
              onClick={handleRefresh}
              disabled={isLoading}
              title="대진표를 다시 불러옵니다"
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              새로고침
            </Button>
          </div>
        </div>

        {/* Tournament Winner Banner */}
        {tournamentWinner && (
          <div className="bg-gradient-to-r from-accent-gold/20 to-accent-gold/5 border border-accent-gold/30 rounded-xl p-6 mb-6 text-center">
            <Trophy className="h-12 w-12 text-accent-gold mx-auto mb-3" />
            <h2 className="text-xl md:text-2xl font-bold text-accent-gold mb-1">
              우승
            </h2>
            <p className="text-2xl md:text-3xl font-bold text-text-primary">
              {getTeamDisplayName(tournamentWinner)}
            </p>
          </div>
        )}

        {/* Bracket View */}
        {bracketMatches.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-bg-tertiary bg-bg-secondary">
            <div className="border-b border-bg-tertiary bg-bg-tertiary/30 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                  <Trophy className="h-4 w-4 text-accent-gold" />
                  토너먼트 브래킷
                </div>
                {/* 경기 수가 적은 내전에서 카드 4장은 과하다 — 헤더 한 줄로 요약 */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
                  <span>
                    완료{" "}
                    <strong className="tabular-nums text-accent-success">
                      {completedMatches}
                    </strong>
                    <span className="text-text-tertiary">/{totalMatches}</span>
                  </span>
                  {inProgressMatches > 0 && (
                    <span>
                      진행 중{" "}
                      <strong className="tabular-nums text-accent-primary">
                        {inProgressMatches}
                      </strong>
                    </span>
                  )}
                  <span>
                    진행률{" "}
                    <strong className="tabular-nums text-accent-gold">
                      {totalMatches > 0
                        ? Math.round((completedMatches / totalMatches) * 100)
                        : 0}
                      %
                    </strong>
                  </span>
                </div>
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
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              대진표가 아직 생성되지 않았습니다
            </h3>
            <p className="text-text-secondary">
              팀 구성이 완료되면 대진표가 자동으로 생성됩니다.
            </p>
          </div>
        )}

        {/* Match Detail Modal */}
        <MatchDetailModal
          match={selectedMatch}
          isOpen={isModalOpen}
          isHost={isHost}
          onClose={handleCloseModal}
          onReportResult={handleReportResult}
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
