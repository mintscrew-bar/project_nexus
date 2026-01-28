"use client";

import { Modal } from '@/components/ui/Modal'; // Use custom Modal
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Swords, Trophy, Info, Copy, ShieldCheck } from 'lucide-react';
import { Match } from './BracketView'; // Import the Match interface
import { useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';

interface MatchDetailModalProps {
  match: Match | null;
  isOpen: boolean;
  isGeneratingCode: boolean;
  onClose: () => void;
  onGenerateCode: (matchId: string) => void;
  onReportResult: (matchId: string, winnerId: string) => Promise<void>;
}

export function MatchDetailModal({
  match,
  isOpen,
  isGeneratingCode,
  onClose,
  onGenerateCode,
  onReportResult,
}: MatchDetailModalProps) {
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

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
  
  // TODO: Improve this check by looking at team members
  const isUserParticipant = true; // For now, assume user is always a participant for UI testing

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`매치 #${match.matchNumber} 상세 정보`} size="md">
      <p className="text-text-secondary mb-4">
        {match.team1?.name || 'TBD'} vs {match.team2?.name || 'TBD'}
      </p>

      <div className="py-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-secondary">상태</span>
          {getStatusBadge(match.status)}
        </div>

        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="p-4 bg-bg-tertiary rounded-lg">
            <p className="font-bold text-lg text-text-primary">
              {match.team1?.name || 'TBD'}
            </p>
            <p className="text-sm text-text-secondary">Team 1</p>
          </div>
          <div className="p-4 bg-bg-tertiary rounded-lg">
            <p className="font-bold text-lg text-text-primary">
              {match.team2?.name || 'TBD'}
            </p>
            <p className="text-sm text-text-secondary">Team 2</p>
          </div>
        </div>
        
        {match.status === 'COMPLETED' && match.winner && (
           <Alert variant="success">
              <Trophy className="h-4 w-4" />
              <AlertTitle>경기 종료</AlertTitle>
              <AlertDescription>
                승자: <span className="font-bold">{match.winner.name}</span>
              </AlertDescription>
          </Alert>
        )}

        {match.status !== 'COMPLETED' && (
          <div>
            <h3 className="text-md font-semibold mb-2 text-text-primary">토너먼트 코드</h3>
            {match.tournamentCode ? (
              <div className="flex items-center gap-2">
                <code className="flex-grow p-2 bg-bg-tertiary rounded font-mono text-text-primary">
                  {match.tournamentCode}
                </code>
                <Button size="icon" variant="ghost" onClick={handleCopyCode}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={() => onGenerateCode(match.id)}
                disabled={isGeneratingCode || match.status !== 'PENDING'}
              >
                {isGeneratingCode ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                코드 생성하기
              </Button>
            )}
             {copied && <p className="text-xs text-accent-success mt-2 text-center">코드가 복사되었습니다!</p>}
          </div>
        )}

        {isUserParticipant && match.status === 'IN_PROGRESS' && (
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
                {isReporting ? <Loader2 className="h-4 w-4 animate-spin"/> : `${match.team1!.name} 승리`}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleReport(match.team2!.id)}
                disabled={isReporting}
              >
                {isReporting ? <Loader2 className="h-4 w-4 animate-spin"/> : `${match.team2!.name} 승리`}
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
    </Modal>
  );
}
