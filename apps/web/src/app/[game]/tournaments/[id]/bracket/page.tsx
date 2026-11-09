"use client";

import { useParams, useRouter } from "next/navigation";
import { useGamePrefix } from "@/hooks/useCurrentGame";
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
  BracketStage,
  BracketLiveBar,
  BracketHeader,
  getStageInfo,
} from "@/components/domain";
import { LoadingSpinner, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Trophy } from "lucide-react";
import { TeamModeHelp, type TeamMode } from "@/components/rooms/TeamModeHelp";

export default function BracketPage() {
  const params = useParams();
  const router = useRouter();
  const gamePrefix = useGamePrefix();
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

  // host 여부·방 이름 — 브래킷 세션 중 변경되지 않으므로 1회만 조회
  const { data: roomInfo } = useQuery({
    queryKey: ["bracketRoom", roomId, user?.id],
    queryFn: async () => {
      const room = await roomApi.getRoom(roomId);
      return {
        isHost: room.hostId === user!.id,
        name: (room.name ?? null) as string | null,
        teamMode: room.teamMode as TeamMode,
        // 배그 킬내기는 승패만이 아니라 킬 수까지 받아야 한다.
        gameTitle: (room.gameTitle ?? "LOL") as "LOL" | "PUBG",
        pubgGameMode: (room.pubgGameMode ?? null) as
          "KILL_MATCH" | "BATTLE_ROYALE" | "FREE_MATCH" | null,
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
      () => router.push(`${gamePrefix}/tournaments/${roomId}/lobby`),
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
    gamePrefix,
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

  // 내전 종료 — 머리글의 "길게 눌러 종료" 버튼이 확인 창을 대신한다
  const handleAbortConfirm = async () => {
    setIsAborting(true);
    try {
      await roomApi.abortToLobby(roomId);
      addToast("내전을 종료하고 대기실로 복귀합니다.", "success");
      router.push(`${gamePrefix}/tournaments/${roomId}/lobby`);
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
          // "내 경기" 판별용 — id 는 팀원 행 id 라 회원 id 를 따로 싣는다
          userId: member.user.id,
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
        // 진영은 세트마다 다르다(2세트부터는 교대). 지금 가리키는 세트 것을 싣는다.
        blueSideTeamId: activeGame.blueSideTeamId ?? null,
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

  // 판 워터마크 — 지금 단계("SEMI FINAL" 등)와 대회 정보 한 줄
  const stage = getStageInfo(bracketMatches, rounds);
  const teamCount = new Set(
    bracketMatches.flatMap((m) => [m.team1?.id, m.team2?.id].filter(Boolean)),
  ).size;
  const maxBestOf = Math.max(1, ...bracketMatches.map((m) => m.bestOf ?? 1));
  const today = new Date();
  const infoLine = [
    teamCount > 0 ? `${teamCount} Teams` : null,
    maxBestOf > 1 ? `Bo${maxBestOf}` : "Single game",
    `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // 경기 바에 쓰는 경기 이름 — 카드의 라운드 머리글과 같은 말
  const matchLabel = (m: Match) => {
    if (isDE) return `${m.bracketSection ?? ""} ${m.matchNumber}`.trim();
    if (rounds === 1) return `리그 ${m.matchNumber}`;
    const fromEnd = rounds - m.round;
    const base =
      fromEnd === 0
        ? "결승"
        : fromEnd === 1
          ? "준결승"
          : fromEnd === 2
            ? "8강"
            : `${m.round}라운드`;
    const sameRound = bracketMatches.filter((x) => x.round === m.round).length;
    return sameRound > 1 ? `${base} ${m.matchNumber}` : base;
  };

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
      <div className="mx-auto w-full max-w-none">
        {/* 머리글 — 라벨 + 방 이름 제목, 오른쪽에 진행률 막대·새로고침·내전 종료 */}
        <BracketHeader
          backHref={`${gamePrefix}/tournaments/${roomId}/lobby`}
          title={roomInfo?.name ?? `방 #${roomId.slice(0, 4)}`}
          modeHelp={
            roomInfo?.teamMode && (
              <TeamModeHelp mode={roomInfo.teamMode} compact />
            )
          }
          completed={completedMatches}
          inProgress={inProgressMatches}
          total={totalMatches}
          isLoading={isLoading}
          onRefresh={handleRefresh}
          isHost={isHost}
          isAborting={isAborting}
          onAbort={handleAbortConfirm}
        />

        {/* Tournament Winner Banner */}
        {tournamentWinner && (
          <div className="mb-5 rounded-2xl border border-accent-primary/40 bg-accent-primary/10 p-6 text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-accent-primary" />
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-accent-primary">
              Champion
            </p>
            <p className="text-2xl md:text-3xl font-bold text-text-primary">
              {getTeamDisplayName(tournamentWinner)}
            </p>
          </div>
        )}

        {/* 대진 판 — 흐르는 사선 띠·단계 워터마크 배경, 아래쪽에 입장별 경기 바 */}
        {bracketMatches.length > 0 ? (
          <BracketStage stage={stage} infoLine={infoLine}>
            <BracketView
              matches={bracketMatches}
              rounds={rounds}
              onMatchClick={handleMatchClick}
            />
            {/* 판 아래쪽에 붙어 스크롤해도 따라온다 — 보여줄 경기가 없으면 사라진다 */}
            {!tournamentWinner && (
              <div className="pointer-events-none sticky bottom-3 mt-3 [&>*]:pointer-events-auto">
                <BracketLiveBar
                  matches={bracketMatches}
                  userId={user?.id}
                  isHost={isHost}
                  getLabel={matchLabel}
                  onOpen={handleMatchClick}
                />
              </div>
            )}
          </BracketStage>
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
