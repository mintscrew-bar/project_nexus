"use client";

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Loader2, Swords, Trophy, Copy, ShieldCheck, AlertCircle, Star, Sword } from 'lucide-react';
import { Match, getTeamDisplayName } from './BracketView';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { matchApi, reputationApi } from '@/lib/api-client';
import { connectMatchSocket, matchSocketHelpers } from '@/lib/socket-client';
import { MatchRpsFlow, type RpsStateData, type RpsRevealData, type RpsHand } from './MatchRpsFlow';
import { ChampionIcon, PositionIcon, POSITION_LABELS } from '@/app/tournaments/[id]/lobby/_components/icons';
import { TierBadge } from '@/components/domain/TierBadge';
import { PlayerHoverCard } from '@/components/domain/PlayerHoverCard';
import { PlayerProfileModal } from '@/components/domain/PlayerProfileModal';
import { cn } from '@/lib/utils';

type LaneKey = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
const LANES: LaneKey[] = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];

// 서버에서 들어오는 다양한 표기를 표준 5개 라인으로 정규화
function normalizeLane(role?: string | null): LaneKey | null {
  if (!role) return null;
  const r = role.toUpperCase();
  if (r === 'TOP') return 'TOP';
  if (r === 'JUNGLE') return 'JUNGLE';
  if (r === 'MID' || r === 'MIDDLE') return 'MID';
  if (r === 'ADC' || r === 'BOTTOM') return 'ADC';
  if (r === 'SUPPORT' || r === 'UTILITY') return 'SUPPORT';
  return null;
}

interface RiotInfo {
  gameName: string;
  tagLine: string;
  tier?: string;
  rank?: string;
  mainRole?: string | null;
  subRole?: string | null;
  championPreferences?: Array<{ role: string; championId: string; order: number }>;
  balanceScores?: Record<string, number> | null;
}

interface MatchMember {
  assignedRole?: string | null;
  user: {
    id: string;
    username: string;
    avatar?: string | null;
    riotAccounts?: RiotInfo[];
  };
}

interface VoteCandidate {
  user: { id: string; username: string; avatar?: string | null };
  count: number;
}

interface VoteData {
  mvp: VoteCandidate[];
  ace: VoteCandidate[];
  myVotes: { mvp: string | null; ace: string | null } | null;
}

type RatingForm = {
  skillRating: number;
  attitudeRating: number;
  communicationRating: number;
  comment: string;
};

const DEFAULT_RATING_FORM: RatingForm = {
  skillRating: 5,
  attitudeRating: 5,
  communicationRating: 5,
  comment: '',
};

interface FullMatchDetails {
  teamA?: { id: string; name: string; captain?: { id: string; username: string }; members: MatchMember[] };
  teamB?: { id: string; name: string; captain?: { id: string; username: string }; members: MatchMember[] };
  winnerId?: string;
}

interface MatchDetailModalProps {
  match: Match | null;
  isOpen: boolean;
  isHost?: boolean;
  onClose: () => void;
  onReportResult: (matchId: string, winnerId: string) => Promise<void>;
}

export function MatchDetailModal({
  match,
  isOpen,
  isHost = false,
  onClose,
  onReportResult,
}: MatchDetailModalProps) {
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [fullMatch, setFullMatch] = useState<FullMatchDetails | null>(null);
  const [voteData, setVoteData] = useState<VoteData | null>(null);
  const [isLoadingVotes, setIsLoadingVotes] = useState(false);
  const [submittingVote, setSubmittingVote] = useState<'MVP' | 'ACE' | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [ratingTargetId, setRatingTargetId] = useState<string | null>(null);
  const [ratingForm, setRatingForm] = useState<RatingForm>(DEFAULT_RATING_FORM);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingSubmittedIds, setRatingSubmittedIds] = useState<Set<string>>(new Set());
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  // 가위바위보 진영 결정
  const [rps, setRps] = useState<RpsStateData | null>(null);
  const [rpsReveal, setRpsReveal] = useState<RpsRevealData | null>(null);
  const [rpsError, setRpsError] = useState<string | null>(null);
  const rpsSeqRef = useRef(0);
  // 양 팀장 준비 대기 상태
  const [rpsReadyState, setRpsReadyState] = useState<{
    captainAId: string;
    captainBId: string;
    readyIds: string[];
    captainAIsBot?: boolean;
    captainBIsBot?: boolean;
  } | null>(null);

  // 매치가 바뀌면 모든 매치별 상태 초기화 (이전 매치의 RPS·오류 등이 새 매치에 잔존하는 버그 방지)
  useEffect(() => {
    setRps(null);
    setRpsReveal(null);
    setRpsError(null);
    setRpsReadyState(null);
    rpsSeqRef.current = 0;
    setReportError(null);
    setVoteError(null);
    setRatingTargetId(null);
    setRatingForm(DEFAULT_RATING_FORM);
    setSubmittingRating(false);
    setRatingError(null);
    setRatingSubmittedIds(new Set());
    setIsStarting(false);
    setIsReporting(false);
  }, [match?.id]);

  // 모달이 PENDING 매치에 열려 있는 동안 /match 룸에 합류해 가위바위보 이벤트 수신
  useEffect(() => {
    if (!isOpen || !match?.id) return;
    const socket = connectMatchSocket();
    if (!socket) return;
    const matchId = match.id;
    socket.emit('join-match', { matchId });

    const onState = (data: any) => {
      if (data?.matchId === matchId) setRps(data as RpsStateData);
    };
    const onReveal = (data: any) => {
      if (data?.matchId === matchId) {
        setRpsReveal({ ...data, seq: ++rpsSeqRef.current });
      }
    };
    const onError = (data: any) => {
      if (data?.matchId === matchId) {
        setRpsError(data?.error || '오류가 발생했습니다.');
        setTimeout(() => setRpsError(null), 4000);
      }
    };
    const onReadyState = (data: any) => {
      if (data?.matchId === matchId) setRpsReadyState(data);
    };
    socket.on('rps:state', onState);
    socket.on('rps:reveal', onReveal);
    socket.on('rps:error', onError);
    socket.on('rps:ready-state', onReadyState);
    return () => {
      socket.off('rps:state', onState);
      socket.off('rps:reveal', onReveal);
      socket.off('rps:error', onError);
      socket.off('rps:ready-state', onReadyState);
      socket.emit('leave-match', { matchId });
    };
  }, [isOpen, match?.id]);

  // 세트 하나에 대한 동작(시작·가위바위보·결과 보고·라이브 조회)은 시리즈가 아니라
  // 그 세트의 상태로 판단해야 한다. match.status는 시리즈(대진 슬롯) 상태다.
  // 시리즈가 없는 레거시/외부 매치는 currentGameStatus가 없어 기존대로 status를 쓴다.
  const currentGameStatus = match ? (match.currentGameStatus ?? match.status) : null;

  // 세트가 시작(IN_PROGRESS)되면 가위바위보 상태 정리
  useEffect(() => {
    if (currentGameStatus && currentGameStatus !== 'PENDING') {
      setRps(null);
      setRpsReveal(null);
    }
  }, [currentGameStatus]);

  const fetchVoteData = useCallback(async (matchId: string) => {
    try {
      const [details, votes] = await Promise.all([
        matchApi.getMatch(matchId),
        matchApi.getMatchVotes(matchId),
      ]);
      setFullMatch(details);
      setVoteData(votes);
    } catch {
      setVoteError('투표 정보를 불러올 수 없습니다.');
    } finally {
      setIsLoadingVotes(false);
    }
  }, []);

  // 매치 열릴 때마다 라인별 멤버 데이터 로드 (모든 상태). COMPLETED일 때만 투표 정보도 함께.
  useEffect(() => {
    if (isOpen && match?.id) {
      setIsLoadingVotes(true);
      setVoteData(null);
      setFullMatch(null);
      fetchVoteData(match.id);
    }
  }, [isOpen, match?.id, fetchVoteData]);

  const handleVote = async (votedForId: string, voteType: 'MVP' | 'ACE') => {
    if (!match) return;
    setSubmittingVote(voteType);
    setVoteError(null);
    try {
      await matchApi.submitVote(match.id, { votedForId, voteType });
      const votes = await matchApi.getMatchVotes(match.id);
      setVoteData(votes);
    } catch (err: any) {
      setVoteError(err?.response?.data?.message || '투표에 실패했습니다.');
    } finally {
      setSubmittingVote(null);
    }
  };

  const handleSubmitRating = async () => {
    if (!match || !ratingTargetId) return;
    setSubmittingRating(true);
    setRatingError(null);
    try {
      await reputationApi.rateUser({
        targetUserId: ratingTargetId,
        matchId: match.id,
        skillRating: ratingForm.skillRating,
        attitudeRating: ratingForm.attitudeRating,
        communicationRating: ratingForm.communicationRating,
        comment: ratingForm.comment.trim() || undefined,
      });
      setRatingSubmittedIds((prev) => new Set(prev).add(ratingTargetId));
      setRatingTargetId(null);
      setRatingForm(DEFAULT_RATING_FORM);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        setRatingSubmittedIds((prev) => new Set(prev).add(ratingTargetId));
      }
      setRatingError(
        status === 409
          ? '이미 이 유저를 평가했습니다.'
          : err?.response?.data?.message || '평점 저장에 실패했습니다.',
      );
    } finally {
      setSubmittingRating(false);
    }
  };

  if (!match) return null;

  const handleCopyCode = () => {
    if (match.tournamentCode) {
      navigator.clipboard.writeText(match.tournamentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReport = async (winnerId: string) => {
    setIsReporting(true);
    setReportError(null);
    try {
      await onReportResult(match.id, winnerId);
      // The modal will likely close or re-render with updated `match` prop
    } catch (err: any) {
      setReportError(err.message || '결과 보고에 실패했습니다.');
    } finally {
      setIsReporting(false);
    }
  };

  const getStatusBadge = (status: Match['status']) => {
    switch (status) {
      case 'IN_PROGRESS':
        return <Badge variant="primary">진행 중</Badge>;
      case 'COMPLETED':
        return <Badge variant="success">종료</Badge>;
      case 'PENDING':
      default:
        return <Badge variant="secondary">대기 중</Badge>;
    }
  };

  // 호스트 또는 양 팀 팀장이 결과 보고 가능
  const isCaptainOfMatch =
    !!(user?.id && match.team1?.captain?.id && user.id === match.team1.captain.id) ||
    !!(user?.id && match.team2?.captain?.id && user.id === match.team2.captain.id);
  const canManageMatch = isHost || isCaptainOfMatch;

  // 가위바위보 진행 중 여부 + 팀(A/B) 매핑
  const rpsActive = !!rps && currentGameStatus === 'PENDING';
  const teamNameById = (id: string) =>
    match.team1?.id === id ? getTeamDisplayName(match.team1)
      : match.team2?.id === id ? getTeamDisplayName(match.team2) : '팀';
  const rpsTeamA = rps ? { id: rps.teamAId, name: teamNameById(rps.teamAId), color: null } : null;
  const rpsTeamB = rps ? { id: rps.teamBId, name: teamNameById(rps.teamBId), color: null } : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        (match.bestOf ?? 1) > 1
          ? `매치 #${match.matchNumber} · ${match.currentGameNumber ?? 1}세트`
          : `매치 #${match.matchNumber} 상세 정보`
      }
      size="full"
      className="!max-w-6xl"
    >
      {/* 대진 요약 — 상태 배지를 별도 행으로 빼지 않고 제목 줄에 붙인다 */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-lg font-bold text-text-primary">
          {getTeamDisplayName(match.team1)}
          <span className="mx-2 text-sm font-medium text-text-tertiary">vs</span>
          {getTeamDisplayName(match.team2)}
        </p>
        {getStatusBadge(match.status)}
      </div>

      <div className="py-2 space-y-4">
        {/* 다전제 시리즈 스코어 */}
        {(match.bestOf ?? 1) > 1 && (
          <div className="rounded-xl border border-accent-primary/25 bg-accent-primary/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">
                {match.bestOf}판 {Math.floor((match.bestOf ?? 1) / 2) + 1}선
              </span>
              <span className="text-sm text-text-secondary">
                {match.status === 'COMPLETED'
                  ? '시리즈 종료'
                  : `${match.currentGameNumber ?? 1}세트 진행 중`}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-center gap-3 text-lg font-bold text-text-primary">
              <span className="truncate">{getTeamDisplayName(match.team1)}</span>
              <span className="shrink-0 text-accent-primary">
                {match.team1?.score ?? 0} : {match.team2?.score ?? 0}
              </span>
              <span className="truncate">{getTeamDisplayName(match.team2)}</span>
            </div>
            {match.status !== 'COMPLETED' && (match.currentGameNumber ?? 1) > 1 && (
              <p className="mt-2 text-center text-xs text-text-tertiary">
                직전 세트와 블루·레드 진영이 자동으로 교대됩니다.
              </p>
            )}
          </div>
        )}

        {/* 경기 결과 — 종료된 매치는 결과부터 보여준다 */}
        {match.status === 'COMPLETED' && match.winner && (
          <Alert variant="success">
            <Trophy className="h-4 w-4" />
            <AlertTitle>경기 종료</AlertTitle>
            <AlertDescription>
              승자: <span className="font-bold">{getTeamDisplayName(match.winner)}</span>
            </AlertDescription>
          </Alert>
        )}

        {/* 가위바위보 진영 결정 */}
        {rpsActive && rps && rpsTeamA && rpsTeamB && (
          <div className="rounded-xl border border-bg-tertiary bg-bg-secondary/40 p-3">
            <MatchRpsFlow
              rps={rps}
              reveal={rpsReveal}
              currentUserId={user?.id}
              teamA={rpsTeamA}
              teamB={rpsTeamB}
              onSubmit={(hand: RpsHand) => { void matchSocketHelpers.rpsSubmit(match.id, hand); }}
              onChooseSide={(side) => { void matchSocketHelpers.rpsChooseSide(match.id, side); }}
            />
            {rpsError && (
              <p className="mt-2 text-center text-sm text-accent-danger">{rpsError}</p>
            )}
          </div>
        )}

        {/* MVP / ACE 투표 */}
        {match.status === 'COMPLETED' && (
          <div className="pt-2">
            <h3 className="text-md font-semibold mb-3 text-text-primary flex items-center gap-2">
              <Star className="h-4 w-4 text-accent-gold" />
              MVP / ACE 투표
            </h3>
            {isLoadingVotes ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-text-secondary" />
              </div>
            ) : fullMatch ? (
              <VotePanels
                fullMatch={fullMatch}
                voteData={voteData}
                currentUserId={user?.id}
                submittingVote={submittingVote}
                onVote={handleVote}
              />
            ) : null}
            {voteError && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{voteError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {match.status === 'COMPLETED' && fullMatch && (
          <RatingPanel
            fullMatch={fullMatch}
            currentUserId={user?.id}
            selectedUserId={ratingTargetId}
            form={ratingForm}
            submittedIds={ratingSubmittedIds}
            isSubmitting={submittingRating}
            error={ratingError}
            onSelect={(targetId) => {
              setRatingTargetId(targetId);
              setRatingError(null);
            }}
            onChange={setRatingForm}
            onSubmit={handleSubmitRating}
          />
        )}

        {currentGameStatus === 'PENDING' && !rpsActive && match.team1 && match.team2 && (() => {
          const captainAId = rpsReadyState?.captainAId ?? match.team1.captain?.id;
          const captainBId = rpsReadyState?.captainBId ?? match.team2.captain?.id;
          const isCaptain = !!(user?.id && (user.id === captainAId || user.id === captainBId));
          const isReady = isCaptain && !!(user?.id && rpsReadyState?.readyIds.includes(user.id));
          const aReady = captainAId ? (rpsReadyState?.readyIds.includes(captainAId) ?? false) : false;
          const bReady = captainBId ? (rpsReadyState?.readyIds.includes(captainBId) ?? false) : false;
          return (
            <div className="rounded-xl border border-bg-tertiary bg-bg-secondary/40 p-3 space-y-3">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Swords className="h-4 w-4 text-accent-primary" />
                {(match.currentGameNumber ?? 1) > 1
                  ? "다음 세트 시작 준비"
                  : "진영 결정 준비"}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { team: match.team1, ready: aReady },
                  { team: match.team2, ready: bReady },
                ] as const).map(({ team, ready }) => (
                  <div key={team.id} className={cn(
                    "flex flex-col items-center gap-1 py-3 rounded-xl border transition-colors",
                    ready ? "border-accent-success bg-accent-success/10" : "border-bg-tertiary bg-bg-secondary",
                  )}>
                    <span className="text-xs font-semibold text-text-primary truncate max-w-[90%]">{team.name}</span>
                    <span className="text-xl">{ready ? "✅" : "⏳"}</span>
                    <span className={cn("text-xs", ready ? "text-accent-success font-medium" : "text-text-tertiary")}>
                      {ready ? "준비 완료" : "대기 중"}
                    </span>
                  </div>
                ))}
              </div>
              {isCaptain ? (
                <Button
                  className="w-full"
                  variant={isReady ? "secondary" : "primary"}
                  onClick={async () => {
                    setIsStarting(true);
                    try {
                      await matchSocketHelpers.rpsCaptainReady(match.id);
                    } finally {
                      setIsStarting(false);
                    }
                  }}
                  disabled={isStarting}
                >
                  {isStarting
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : isReady
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Swords className="mr-2 h-4 w-4" />}
                  {isReady ? "상대 팀장 대기 중..." : "준비 완료"}
                </Button>
              ) : (
                <p className="text-xs text-text-tertiary text-center">
                  {rpsReadyState?.captainAIsBot || rpsReadyState?.captainBIsBot
                    ? (match.currentGameNumber ?? 1) > 1
                      ? "봇은 자동으로 준비합니다"
                      : "봇은 자동으로 준비하고 가위바위보에 참여합니다"
                    : "팀장만 준비할 수 있습니다"}
                </p>
              )}
            </div>
          );
        })()}

        {canManageMatch && currentGameStatus === 'IN_PROGRESS' && (
          <div className="rounded-xl border border-accent-primary/25 bg-accent-primary/5 p-3">
            <h3 className="text-md font-semibold mb-2 text-text-primary flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-accent-primary" />
              승리 팀 보고
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => handleReport(match.team1!.id)}
                disabled={isReporting}
              >
                {isReporting ? <Loader2 className="h-4 w-4 animate-spin"/> : `${getTeamDisplayName(match.team1)} 승리`}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleReport(match.team2!.id)}
                disabled={isReporting}
              >
                {isReporting ? <Loader2 className="h-4 w-4 animate-spin"/> : `${getTeamDisplayName(match.team2)} 승리`}
              </Button>
            </div>
            {reportError && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>오류</AlertTitle>
                <AlertDescription>{reportError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* 토너먼트 코드 — 행동 섹션 아래, 라인업 위 */}
        {match.status !== 'COMPLETED' && !rpsActive && (
          <div>
            <h3 className="text-md font-semibold mb-2 text-text-primary">토너먼트 코드</h3>
            {match.tournamentCode ? (
              <div className="flex items-center gap-2">
                <code className="flex-grow p-2 bg-bg-tertiary rounded font-mono text-text-primary select-all">
                  {match.tournamentCode}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCopyCode}
                  title="토너먼트 코드 복사"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-text-secondary text-center py-2">
                {!match.team1 || !match.team2
                  ? "팀이 확정되면 코드가 자동 생성됩니다."
                  : "커스텀 게임을 생성하고 직접 입장해주세요."}
              </p>
            )}
            {copied && <p className="text-xs text-accent-success mt-2 text-center">코드가 복사되었습니다!</p>}
          </div>
        )}

        {/* 라인별 멤버 테이블 — 참고 정보라 행동 섹션 아래에 둔다 */}
        <div className="border-t border-bg-tertiary pt-4">
          <LaneRoster
            teamA={fullMatch?.teamA}
            teamB={fullMatch?.teamB}
            fallbackTeam1Name={getTeamDisplayName(match.team1)}
            fallbackTeam2Name={getTeamDisplayName(match.team2)}
            winnerId={fullMatch?.winnerId}
            isLoading={!fullMatch && isLoadingVotes}
            onOpenProfile={setProfileUserId}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onClose}>
          닫기
        </Button>
      </div>
      <PlayerProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
    </Modal>
  );
}

// ========================================
// RatingPanel — 매치 참가자 상호 평점 UI
// ========================================

function RatingPanel({
  fullMatch,
  currentUserId,
  selectedUserId,
  form,
  submittedIds,
  isSubmitting,
  error,
  onSelect,
  onChange,
  onSubmit,
}: {
  fullMatch: FullMatchDetails;
  currentUserId?: string;
  selectedUserId: string | null;
  form: RatingForm;
  submittedIds: Set<string>;
  isSubmitting: boolean;
  error: string | null;
  onSelect: (userId: string) => void;
  onChange: (form: RatingForm) => void;
  onSubmit: () => void;
}) {
  const allMembers = [
    ...(fullMatch.teamA?.members ?? []),
    ...(fullMatch.teamB?.members ?? []),
  ];
  const isCurrentUserParticipant = allMembers.some((member) => member.user.id === currentUserId);
  const rateableMembers = allMembers.filter((member) => member.user.id !== currentUserId);
  const selectedMember = rateableMembers.find((member) => member.user.id === selectedUserId) ?? null;
  const selectedAlreadySubmitted = !!selectedUserId && submittedIds.has(selectedUserId);

  return (
    <div className="pt-4 border-t border-bg-tertiary space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-md font-semibold text-text-primary flex items-center gap-2">
          <Star className="h-4 w-4 text-accent-gold" />
          참가자 평점
        </h3>
        <Badge variant="secondary" size="sm">매치 기록</Badge>
      </div>

      {!isCurrentUserParticipant ? (
        <p className="rounded-lg bg-bg-tertiary px-3 py-2 text-center text-xs text-text-tertiary">
          참가자만 평점을 남길 수 있습니다.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rateableMembers.map(({ user: member }) => {
              const isSelected = selectedUserId === member.id;
              const isSubmitted = submittedIds.has(member.id);

              return (
                <button
                  key={member.id}
                  type="button"
                  className={cn(
                    "min-w-0 rounded-lg border px-2 py-2 text-left transition-colors",
                    isSelected
                      ? "border-accent-gold bg-accent-gold/10"
                      : "border-bg-tertiary bg-bg-secondary hover:bg-bg-tertiary",
                  )}
                  onClick={() => onSelect(member.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-text-primary">{member.username}</span>
                    {isSubmitted && <span className="text-[10px] font-semibold text-accent-success">완료</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedMember ? (
            <div className="rounded-lg bg-bg-tertiary p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{selectedMember.user.username}</p>
                  <p className="text-xs text-text-tertiary">1점부터 5점까지 선택</p>
                </div>
                {selectedAlreadySubmitted && <Badge variant="success" size="sm">평가 완료</Badge>}
              </div>

              <div className="space-y-2">
                <RatingRow
                  label="실력"
                  value={form.skillRating}
                  disabled={selectedAlreadySubmitted || isSubmitting}
                  onChange={(value) => onChange({ ...form, skillRating: value })}
                />
                <RatingRow
                  label="태도"
                  value={form.attitudeRating}
                  disabled={selectedAlreadySubmitted || isSubmitting}
                  onChange={(value) => onChange({ ...form, attitudeRating: value })}
                />
                <RatingRow
                  label="소통"
                  value={form.communicationRating}
                  disabled={selectedAlreadySubmitted || isSubmitting}
                  onChange={(value) => onChange({ ...form, communicationRating: value })}
                />
              </div>

              <textarea
                value={form.comment}
                maxLength={500}
                disabled={selectedAlreadySubmitted || isSubmitting}
                onChange={(event) => onChange({ ...form, comment: event.target.value })}
                placeholder="선택 사항 메모"
                className="min-h-[72px] w-full resize-none rounded-lg border border-bg-secondary bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-primary focus:outline-none disabled:opacity-60"
              />

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                className="w-full"
                size="sm"
                variant="gold"
                disabled={selectedAlreadySubmitted || isSubmitting}
                onClick={onSubmit}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />}
                평점 저장
              </Button>
            </div>
          ) : (
            <p className="rounded-lg bg-bg-tertiary px-3 py-2 text-center text-xs text-text-tertiary">
              평점을 남길 참가자를 선택하세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function RatingRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="w-10 text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((score) => {
          const isActive = score <= value;
          return (
            <button
              key={score}
              type="button"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                isActive ? "text-accent-gold hover:bg-accent-gold/10" : "text-text-tertiary hover:bg-bg-secondary",
              )}
              aria-label={`${label} ${score}점`}
              disabled={disabled}
              onClick={() => onChange(score)}
            >
              <Star className={cn("h-4 w-4", isActive && "fill-current")} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ========================================
// VotePanels — MVP(이긴 팀) / ACE(진 팀) 투표 UI
// ========================================

function VotePanels({
  fullMatch,
  voteData,
  currentUserId,
  submittingVote,
  onVote,
}: {
  fullMatch: FullMatchDetails;
  voteData: VoteData | null;
  currentUserId?: string;
  submittingVote: 'MVP' | 'ACE' | null;
  onVote: (votedForId: string, voteType: 'MVP' | 'ACE') => void;
}) {
  const winnerTeam = fullMatch.winnerId === fullMatch.teamA?.id ? fullMatch.teamA : fullMatch.teamB;
  const loserTeam = fullMatch.winnerId === fullMatch.teamA?.id ? fullMatch.teamB : fullMatch.teamA;

  const mvpVotedFor = voteData?.myVotes?.mvp ?? null;
  const aceVotedFor = voteData?.myVotes?.ace ?? null;

  const getVoteCount = (type: 'MVP' | 'ACE', userId: string) => {
    const list = type === 'MVP' ? voteData?.mvp : voteData?.ace;
    return list?.find(v => v.user.id === userId)?.count ?? 0;
  };

  const maxCount = (type: 'MVP' | 'ACE') => {
    const list = type === 'MVP' ? voteData?.mvp : voteData?.ace;
    return Math.max(1, ...(list?.map(v => v.count) ?? [0]));
  };

  // 투표 자격: 이긴 팀/진 팀 어느 쪽이든 매치 참가자이면 모든 컬럼에 투표 가능
  const allMembers = [
    ...(fullMatch.teamA?.members ?? []),
    ...(fullMatch.teamB?.members ?? []),
  ];
  const isCurrentUserParticipant = allMembers.some(m => m.user.id === currentUserId);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <VoteColumn
        title="MVP"
        subtitle={winnerTeam ? getTeamDisplayName({ id: winnerTeam.id, name: winnerTeam.name, captain: winnerTeam.captain }) : '이긴 팀'}
        icon={<Trophy className="h-4 w-4 text-accent-gold" />}
        members={winnerTeam?.members ?? []}
        voteType="MVP"
        votedForId={mvpVotedFor}
        isParticipant={isCurrentUserParticipant}
        currentUserId={currentUserId}
        getVoteCount={(id) => getVoteCount('MVP', id)}
        maxCount={maxCount('MVP')}
        isSubmitting={submittingVote !== null}
        onVote={onVote}
      />
      <VoteColumn
        title="ACE"
        subtitle={loserTeam ? getTeamDisplayName({ id: loserTeam.id, name: loserTeam.name, captain: loserTeam.captain }) : '진 팀'}
        icon={<Sword className="h-4 w-4 text-text-secondary" />}
        members={loserTeam?.members ?? []}
        voteType="ACE"
        votedForId={aceVotedFor}
        isParticipant={isCurrentUserParticipant}
        currentUserId={currentUserId}
        getVoteCount={(id) => getVoteCount('ACE', id)}
        maxCount={maxCount('ACE')}
        isSubmitting={submittingVote !== null}
        onVote={onVote}
      />
    </div>
  );
}

function VoteColumn({
  title, subtitle, icon, members, voteType,
  votedForId, isParticipant, currentUserId, getVoteCount, maxCount, isSubmitting, onVote,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  members: MatchMember[];
  voteType: 'MVP' | 'ACE';
  votedForId: string | null;
  isParticipant: boolean;
  currentUserId?: string;
  getVoteCount: (userId: string) => number;
  maxCount: number;
  isSubmitting: boolean;
  onVote: (votedForId: string, voteType: 'MVP' | 'ACE') => void;
}) {
  const hasVoted = votedForId !== null;

  return (
    <div className="bg-bg-tertiary rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="font-semibold text-sm text-text-primary">{title}</span>
        <span className="text-xs text-text-secondary truncate">· {subtitle}</span>
      </div>
      {members.map(({ user: member }) => {
        const count = getVoteCount(member.id);
        const isVotedFor = votedForId === member.id;
        const isMe = member.id === currentUserId;
        // 본인 팀 내 본인은 투표 불가, 이미 투표했으면 불가
        const canVote = isParticipant && !hasVoted && !isMe;

        return (
          <button
            key={member.id}
            className={`w-full text-left rounded-md px-2 py-1.5 transition-all ${
              isVotedFor
                ? 'bg-accent-gold/20 ring-1 ring-accent-gold/50'
                : canVote
                  ? 'hover:bg-bg-secondary cursor-pointer'
                  : 'cursor-default'
            }`}
            onClick={() => canVote && onVote(member.id, voteType)}
            disabled={!canVote || isSubmitting}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 rounded-full bg-bg-secondary overflow-hidden flex items-center justify-center text-xs font-bold text-text-secondary flex-shrink-0">
                  {member.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={member.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    member.username.charAt(0).toUpperCase()
                  )}
                </div>
                <span className={`text-xs truncate ${isVotedFor ? 'text-accent-gold font-semibold' : 'text-text-primary'}`}>
                  {member.username}
                  {isMe && <span className="text-text-tertiary ml-1">(나)</span>}
                </span>
              </div>
              {isVotedFor && <span className="text-accent-gold text-xs flex-shrink-0">✓</span>}
              {hasVoted && <span className="text-xs text-text-secondary flex-shrink-0">{count}</span>}
            </div>
            {/* 득표 진행 바 — 투표 후에만 표시 */}
            {hasVoted && (
              <div className="w-full bg-bg-secondary rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all ${isVotedFor ? 'bg-accent-gold' : 'bg-text-tertiary'}`}
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
            )}
          </button>
        );
      })}
      {!isParticipant && (
        <p className="text-xs text-text-tertiary text-center pt-1">참가자만 투표 가능</p>
      )}
      {isParticipant && hasVoted && (
        <p className="text-xs text-text-secondary text-center pt-1">투표 완료</p>
      )}
      {isParticipant && !hasVoted && (
        <p className="text-xs text-text-tertiary text-center pt-1">클릭하여 투표</p>
      )}
    </div>
  );
}

// ========================================
// LaneRoster — 라인별 (TOP/JUNGLE/MID/ADC/SUPPORT) 양팀 선수 표
// 호버 시 닉#태그 + 티어 + 주라인 + 주라인 선호 챔피언을 툴팁으로 표시
// ========================================

function LaneRoster({
  teamA,
  teamB,
  fallbackTeam1Name,
  fallbackTeam2Name,
  winnerId,
  isLoading = false,
  onOpenProfile,
}: {
  teamA?: FullMatchDetails['teamA'];
  teamB?: FullMatchDetails['teamB'];
  fallbackTeam1Name: string;
  fallbackTeam2Name: string;
  winnerId?: string;
  isLoading?: boolean;
  onOpenProfile: (userId: string) => void;
}) {
  // 라인별로 멤버를 분류. assignedRole이 없거나 알 수 없으면 'UNASSIGNED' 버킷에 모음.
  const groupByLane = (members?: MatchMember[]) => {
    const map = new Map<LaneKey | 'UNASSIGNED', MatchMember[]>();
    for (const m of members ?? []) {
      const lane = normalizeLane(m.assignedRole) ?? 'UNASSIGNED';
      if (!map.has(lane)) map.set(lane, []);
      map.get(lane)!.push(m);
    }
    return map;
  };

  const teamADisplay = teamA ? getTeamDisplayName({ id: teamA.id, name: teamA.name, captain: teamA.captain }) : fallbackTeam1Name;
  const teamBDisplay = teamB ? getTeamDisplayName({ id: teamB.id, name: teamB.name, captain: teamB.captain }) : fallbackTeam2Name;
  const isAWinner = winnerId && teamA && winnerId === teamA.id;
  const isBWinner = winnerId && teamB && winnerId === teamB.id;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-text-primary">팀 라인업</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            역할 선택에서 확정한 라인 기준 선호 챔피언입니다.
          </p>
        </div>
        <span className="hidden shrink-0 text-xs text-text-tertiary sm:block">선호 순서대로 최대 5개</span>
      </div>
      {isLoading ? (
        // 로드 전에 빈 패널을 그리면 "선수 정보가 없습니다"가 깜빡인다
        <div className="flex justify-center rounded-lg border border-bg-tertiary bg-bg-secondary py-10">
          <Loader2 className="h-6 w-6 animate-spin text-text-secondary" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <TeamRosterPanel
            team={teamA}
            displayName={teamADisplay}
            isWinner={!!isAWinner}
            groupByLane={groupByLane}
            onOpenProfile={onOpenProfile}
          />
          <TeamRosterPanel
            team={teamB}
            displayName={teamBDisplay}
            isWinner={!!isBWinner}
            groupByLane={groupByLane}
            onOpenProfile={onOpenProfile}
          />
        </div>
      )}
    </section>
  );
}

function TeamRosterPanel({
  team,
  displayName,
  isWinner,
  groupByLane,
  onOpenProfile,
}: {
  team?: FullMatchDetails['teamA'];
  displayName: string;
  isWinner: boolean;
  groupByLane: (members?: MatchMember[]) => Map<LaneKey | 'UNASSIGNED', MatchMember[]>;
  onOpenProfile: (userId: string) => void;
}) {
  const membersByLane = groupByLane(team?.members);
  const orderedMembers = [
    ...LANES.flatMap((lane) => membersByLane.get(lane) ?? []),
    ...(membersByLane.get('UNASSIGNED') ?? []),
  ];
  const memberScores = orderedMembers.map((member) => {
    const lane = normalizeLane(member.assignedRole);
    const score = lane
      ? member.user.riotAccounts?.[0]?.balanceScores?.[lane]
      : undefined;
    return typeof score === 'number' && Number.isFinite(score) ? score : null;
  });
  const hasCompleteTeamScore =
    memberScores.length > 0 && memberScores.every((score) => score !== null);
  const teamScore = hasCompleteTeamScore
    ? memberScores.reduce<number>((total, score) => total + (score ?? 0), 0)
    : null;

  return (
    <div className="overflow-hidden rounded-lg border border-bg-tertiary bg-bg-secondary">
      <div className="border-b border-bg-tertiary bg-bg-tertiary/60 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className={cn('truncate text-lg font-bold', isWinner ? 'text-accent-gold' : 'text-text-primary')}>
            {isWinner && <Trophy className="mr-1.5 inline h-5 w-5" />}
            {displayName}
          </span>
          <span className="shrink-0 text-sm text-text-secondary">{orderedMembers.length}명</span>
        </div>
        <div className="mt-3 flex items-end justify-between border-t border-bg-elevated/70 pt-3">
          <span className="text-sm font-medium text-text-secondary">팀 총점</span>
          <span className="text-2xl font-black tabular-nums text-accent-primary">
            {teamScore !== null ? teamScore.toFixed(1) : '산정 중'}
          </span>
        </div>
      </div>
      <div className="divide-y divide-bg-tertiary">
        {orderedMembers.map((member) => (
          <RosterPlayerRow key={member.user.id} member={member} onOpenProfile={onOpenProfile} />
        ))}
        {orderedMembers.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-text-tertiary">선수 정보가 없습니다.</div>
        )}
      </div>
    </div>
  );
}

function RosterPlayerRow({ member, onOpenProfile }: { member: MatchMember; onOpenProfile: (userId: string) => void }) {
  const lane = normalizeLane(member.assignedRole);
  const riotAccount = member.user.riotAccounts?.[0];
  const lineScore = lane ? riotAccount?.balanceScores?.[lane] : undefined;
  const champions = (riotAccount?.championPreferences ?? [])
    .filter((preference) => normalizeLane(preference.role) === lane)
    .sort((left, right) => left.order - right.order)
    .slice(0, 5);

  return (
    <div className="min-w-0 px-4 py-3">
      <div className="mb-2.5 flex min-w-0 flex-wrap items-center gap-2.5">
        <span className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-bg-tertiary px-3 text-sm font-bold text-text-secondary">
          {lane ? <PositionIcon position={lane} className="!h-5 !w-5" /> : null}
          {lane ? POSITION_LABELS[lane] : '미배정'}
        </span>
        <div className="min-w-[100px] flex-1">
          <PlayerCell member={member} onOpenProfile={onOpenProfile} />
        </div>
        <TierBadge
          tier={riotAccount?.tier}
          rank={riotAccount?.rank}
          size="lg"
          className="shrink-0"
        />
        <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-accent-primary/30 bg-accent-primary/10 px-3">
          <span className="text-xs font-medium text-text-secondary">라인 점수</span>
          <strong className="text-base tabular-nums text-accent-primary">
            {typeof lineScore === 'number' && Number.isFinite(lineScore)
              ? lineScore.toFixed(1)
              : '-'}
          </strong>
        </div>
      </div>
      {champions.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-text-tertiary">라인 선호 챔피언</p>
          <div className="grid w-fit max-w-full grid-cols-5 gap-1 sm:gap-2">
          {champions.map((preference) => (
            <ChampionIcon
              key={`${member.user.id}-${preference.championId}`}
              championId={preference.championId}
              size={44}
            />
          ))}
          </div>
        </div>
      ) : (
        <div className="flex h-[44px] items-center text-xs text-text-tertiary">
          선택한 라인의 선호 챔피언이 없습니다.
        </div>
      )}
    </div>
  );
}

// 한 명의 선수 셀 — 호버하면 PlayerHoverCard 표시
function PlayerCell({ member, onOpenProfile }: { member: MatchMember; onOpenProfile: (userId: string) => void }) {
  const [hovered, setHovered] = useState<DOMRect | null>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClose = () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); };
  const scheduleHoverClose = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHovered(null), 80);
  };

  return (
    <>
      <div
        className="relative flex min-w-0 items-center gap-2 py-0.5 cursor-default"
        onMouseEnter={(e) => {
          cancelHoverClose();
          const rect = e.currentTarget.getBoundingClientRect();
          hoverTimerRef.current = setTimeout(() => setHovered(rect), 300);
        }}
        onMouseLeave={scheduleHoverClose}
      >
        <div className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-bg-tertiary">
          {member.user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.user.avatar} alt={member.user.username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-text-tertiary">
              {member.user.username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <span className="truncate text-sm font-medium text-text-primary">{member.user.username}</span>
      </div>
      {hovered && (
        <PlayerHoverCard
          userId={member.user.id}
          anchorRect={hovered}
          onOpenProfile={(uid) => { setHovered(null); onOpenProfile(uid); }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
    </>
  );
}
