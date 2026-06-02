"use client";

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Loader2, Swords, Trophy, Copy, ShieldCheck, AlertCircle, Radio, Star, Sword } from 'lucide-react';
import { Match, getTeamDisplayName } from './BracketView';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { matchApi } from '@/lib/api-client';
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

interface FullMatchDetails {
  teamA?: { id: string; name: string; captain?: { id: string; username: string }; members: MatchMember[] };
  teamB?: { id: string; name: string; captain?: { id: string; username: string }; members: MatchMember[] };
  winnerId?: string;
}

interface LiveGameParticipant {
  puuid: string;
  championId: number;
  teamId: number;
  summonerName?: string;
}

interface LiveGameStatus {
  isLive: boolean;
  gameLength?: number; // seconds
  gameStartTime?: number; // epoch milliseconds
  participants?: LiveGameParticipant[];
}

interface MatchDetailModalProps {
  match: Match | null;
  isOpen: boolean;
  isHost?: boolean;
  liveStatus?: LiveGameStatus | null;
  onClose: () => void;
  onStartMatch: (matchId: string) => Promise<void>;
  onReportResult: (matchId: string, winnerId: string) => Promise<void>;
  onRefreshLiveStatus?: (matchId: string) => Promise<void>;
}

export function MatchDetailModal({
  match,
  isOpen,
  isHost = false,
  liveStatus = null,
  onClose,
  onStartMatch,
  onReportResult,
  onRefreshLiveStatus,
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

  // 매치가 시작(IN_PROGRESS)되면 가위바위보 상태 정리
  useEffect(() => {
    if (match?.status && match.status !== 'PENDING') {
      setRps(null);
      setRpsReveal(null);
    }
  }, [match?.status]);

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

  // Auto-refresh live status every 30 seconds for IN_PROGRESS matches
  useEffect(() => {
    if (!isOpen || !match || match.status !== 'IN_PROGRESS' || !onRefreshLiveStatus) {
      return;
    }

    // Initial fetch
    onRefreshLiveStatus(match.id);

    // Set up polling interval (30 seconds)
    const intervalId = setInterval(() => {
      onRefreshLiveStatus(match.id);
    }, 30000);

    // Cleanup on unmount or when dependencies change
    return () => {
      clearInterval(intervalId);
    };
  }, [isOpen, match, onRefreshLiveStatus]);

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
    // Show live badge if match is in progress AND actually live in Riot servers
    if (status === 'IN_PROGRESS' && liveStatus?.isLive) {
      return (
        <Badge variant="primary" className="flex items-center gap-1">
          <Radio className="h-3 w-3 animate-pulse" />
          🎮 라이브
        </Badge>
      );
    }

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

  const formatGameLength = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };
  
  // 호스트 또는 양 팀 팀장이 결과 보고 가능
  const isCaptainOfMatch =
    !!(user?.id && match.team1?.captain?.id && user.id === match.team1.captain.id) ||
    !!(user?.id && match.team2?.captain?.id && user.id === match.team2.captain.id);
  const canManageMatch = isHost || isCaptainOfMatch;

  // 가위바위보 진행 중 여부 + 팀(A/B) 매핑
  const rpsActive = !!rps && match.status === 'PENDING';
  const teamNameById = (id: string) =>
    match.team1?.id === id ? getTeamDisplayName(match.team1)
      : match.team2?.id === id ? getTeamDisplayName(match.team2) : '팀';
  const rpsTeamA = rps ? { id: rps.teamAId, name: teamNameById(rps.teamAId), color: null } : null;
  const rpsTeamB = rps ? { id: rps.teamBId, name: teamNameById(rps.teamBId), color: null } : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`매치 #${match.matchNumber} 상세 정보`} size="md">
      <p className="text-text-secondary mb-4">
        {getTeamDisplayName(match.team1)} vs {getTeamDisplayName(match.team2)}
      </p>

      <div className="py-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">상태</span>
          {getStatusBadge(match.status)}
        </div>

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

        {/* Live Game Status */}
        {match.status === 'IN_PROGRESS' && liveStatus?.isLive && (
          <Alert variant="default">
            <Radio className="h-4 w-4 animate-pulse" />
            <AlertTitle>🎮 라이브 경기 진행 중</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm">경과 시간:</span>
                  <span className="font-bold text-accent-primary">
                    {liveStatus.gameLength ? formatGameLength(liveStatus.gameLength) : 'N/A'}
                  </span>
                </div>
                {liveStatus.participants && liveStatus.participants.length > 0 && (
                  <div className="text-xs text-text-secondary mt-2">
                    참가자 {liveStatus.participants.length}명 플레이 중
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* 라인별 멤버 테이블 — 팀A vs 팀B */}
        <LaneRoster
          teamA={fullMatch?.teamA}
          teamB={fullMatch?.teamB}
          fallbackTeam1Name={getTeamDisplayName(match.team1)}
          fallbackTeam2Name={getTeamDisplayName(match.team2)}
          winnerId={fullMatch?.winnerId}
          onOpenProfile={setProfileUserId}
        />

        {match.status === 'COMPLETED' && match.winner && (
           <Alert variant="success">
              <Trophy className="h-4 w-4" />
              <AlertTitle>경기 종료</AlertTitle>
              <AlertDescription>
                승자: <span className="font-bold">{getTeamDisplayName(match.winner)}</span>
              </AlertDescription>
          </Alert>
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

        {match.status !== 'COMPLETED' && !rpsActive && (
          <div>
            <h3 className="text-md font-semibold mb-2 text-text-primary">토너먼트 코드</h3>
            {match.tournamentCode ? (
              <div className="flex items-center gap-2">
                <code className="flex-grow p-2 bg-bg-tertiary rounded font-mono text-text-primary select-all">
                  {match.tournamentCode}
                </code>
                <Button size="icon" variant="ghost" onClick={handleCopyCode}>
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

        {match.status === 'PENDING' && !rpsActive && match.team1 && match.team2 && (() => {
          const captainAId = rpsReadyState?.captainAId ?? match.team1.captain?.id;
          const captainBId = rpsReadyState?.captainBId ?? match.team2.captain?.id;
          const isCaptain = !!(user?.id && (user.id === captainAId || user.id === captainBId));
          const isReady = isCaptain && !!(user?.id && rpsReadyState?.readyIds.includes(user.id));
          const aReady = captainAId ? (rpsReadyState?.readyIds.includes(captainAId) ?? false) : false;
          const bReady = captainBId ? (rpsReadyState?.readyIds.includes(captainBId) ?? false) : false;
          return (
            <div className="pt-4 border-t border-bg-tertiary space-y-3">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Swords className="h-4 w-4 text-accent-primary" />
                진영 결정 준비
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
                <p className="text-xs text-text-tertiary text-center">팀장만 준비할 수 있습니다</p>
              )}
            </div>
          );
        })()}

        {canManageMatch && match.status === 'IN_PROGRESS' && (
          <div className="pt-4 border-t border-bg-tertiary">
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
                <div className="w-5 h-5 rounded-full bg-bg-secondary flex items-center justify-center text-xs font-bold text-text-secondary flex-shrink-0">
                  {member.username.charAt(0).toUpperCase()}
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
  onOpenProfile,
}: {
  teamA?: FullMatchDetails['teamA'];
  teamB?: FullMatchDetails['teamB'];
  fallbackTeam1Name: string;
  fallbackTeam2Name: string;
  winnerId?: string;
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

  const aByLane = groupByLane(teamA?.members);
  const bByLane = groupByLane(teamB?.members);

  const teamADisplay = teamA ? getTeamDisplayName({ id: teamA.id, name: teamA.name, captain: teamA.captain }) : fallbackTeam1Name;
  const teamBDisplay = teamB ? getTeamDisplayName({ id: teamB.id, name: teamB.name, captain: teamB.captain }) : fallbackTeam2Name;
  const isAWinner = winnerId && teamA && winnerId === teamA.id;
  const isBWinner = winnerId && teamB && winnerId === teamB.id;

  return (
    <div className="rounded-lg overflow-hidden border border-bg-tertiary">
      {/* 헤더: 팀명 */}
      <div className="grid grid-cols-[60px_1fr_28px_1fr] sm:grid-cols-[72px_1fr_36px_1fr] bg-bg-tertiary">
        <div className="px-2 py-2" />
        <div className={`px-2 py-2 text-center text-xs sm:text-sm font-bold truncate ${isAWinner ? 'text-accent-gold' : 'text-text-primary'}`}>
          {isAWinner && <Trophy className="inline h-3 w-3 mr-1" />}
          {teamADisplay}
        </div>
        <div className="px-1 py-2 text-center text-[10px] text-text-tertiary">vs</div>
        <div className={`px-2 py-2 text-center text-xs sm:text-sm font-bold truncate ${isBWinner ? 'text-accent-gold' : 'text-text-primary'}`}>
          {isBWinner && <Trophy className="inline h-3 w-3 mr-1" />}
          {teamBDisplay}
        </div>
      </div>

      {/* 라인별 행 */}
      {LANES.map((lane) => {
        const aMembers = aByLane.get(lane) ?? [];
        const bMembers = bByLane.get(lane) ?? [];
        if (aMembers.length === 0 && bMembers.length === 0) return null;
        return (
          <div key={lane} className="grid grid-cols-[60px_1fr_28px_1fr] sm:grid-cols-[72px_1fr_36px_1fr] border-t border-bg-tertiary items-stretch">
            <div className="flex items-center justify-center px-2 py-2 bg-bg-tertiary/50">
              <span className="flex items-center gap-1 text-[11px] sm:text-xs font-medium text-text-secondary">
                <PositionIcon position={lane} className="!w-3.5 !h-3.5" />
                <span className="hidden sm:inline">{POSITION_LABELS[lane]}</span>
              </span>
            </div>
            <div className="px-2 py-1.5">
              {aMembers.map((m) => <PlayerCell key={m.user.id} member={m} onOpenProfile={onOpenProfile} />)}
            </div>
            <div className="flex items-center justify-center text-[10px] text-text-tertiary">vs</div>
            <div className="px-2 py-1.5">
              {bMembers.map((m) => <PlayerCell key={m.user.id} member={m} onOpenProfile={onOpenProfile} />)}
            </div>
          </div>
        );
      })}

      {/* 라인 미배정 멤버는 별도 푸터로 노출 */}
      {(aByLane.get('UNASSIGNED')?.length || bByLane.get('UNASSIGNED')?.length) ? (
        <div className="grid grid-cols-[60px_1fr_28px_1fr] sm:grid-cols-[72px_1fr_36px_1fr] border-t border-bg-tertiary items-stretch">
          <div className="flex items-center justify-center px-2 py-2 bg-bg-tertiary/50 text-[10px] text-text-tertiary">미배정</div>
          <div className="px-2 py-1.5">
            {(aByLane.get('UNASSIGNED') ?? []).map((m) => <PlayerCell key={m.user.id} member={m} onOpenProfile={onOpenProfile} />)}
          </div>
          <div />
          <div className="px-2 py-1.5">
            {(bByLane.get('UNASSIGNED') ?? []).map((m) => <PlayerCell key={m.user.id} member={m} onOpenProfile={onOpenProfile} />)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// 한 명의 선수 셀 — 호버하면 PlayerHoverCard 표시
function PlayerCell({ member, onOpenProfile }: { member: MatchMember; onOpenProfile: (userId: string) => void }) {
  const [hoveredRect, setHoveredRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClose = () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current); };
  const scheduleHoverClose = () => { hoverTimerRef.current = setTimeout(() => setHoveredRect(null), 80); };

  const participant = {
    userId: member.user.id,
    username: member.user.username,
    avatar: member.user.avatar,
    riotAccount: member.user.riotAccounts?.[0] ?? null,
    clanMemberships: [],
  };

  return (
    <>
      <div
        className="relative flex items-center gap-1.5 py-0.5 cursor-default"
        onMouseEnter={(e) => { cancelHoverClose(); setHoveredRect(e.currentTarget.getBoundingClientRect()); }}
        onMouseLeave={scheduleHoverClose}
      >
        <div className="w-5 h-5 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
          {member.user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.user.avatar} alt={member.user.username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-text-tertiary">
              {member.user.username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <span className="text-xs text-text-primary truncate">{member.user.username}</span>
      </div>
      {hoveredRect && (
        <PlayerHoverCard
          participant={participant}
          anchorRect={hoveredRect}
          onOpenProfile={(userId) => { setHoveredRect(null); onOpenProfile(userId); }}
          onMouseEnter={cancelHoverClose}
          onMouseLeave={scheduleHoverClose}
        />
      )}
    </>
  );
}
