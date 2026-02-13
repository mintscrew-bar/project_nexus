"use client";

import React, { useState } from 'react';
import { Card, CardContent, Button, Badge, Avatar } from '@/components/ui';
import { TierBadge } from './TierBadge';
import { cn } from '@/lib/utils';

interface Player {
  id: string;
  username: string;
  tier: string;
  rank?: string;
  position: string;
  avatar?: string;
  champions?: string[];
}

interface Team {
  id: string;
  name: string;
  captainId: string;
  captainName?: string;
  members: Player[];
  remainingGold: number;
}

interface AuctionState {
  currentPlayer: Player | null;
  currentHighestBid: number;
  currentHighestBidder: string | null;
  timerEnd: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface AuctionBoardProps {
  auctionState: AuctionState;
  teams: Team[];
  currentUserId?: string;
  onPlaceBid: (amount: number) => void;
  disabled?: boolean;
  className?: string;
}

export const AuctionBoard: React.FC<AuctionBoardProps> = ({
  auctionState,
  teams,
  currentUserId,
  onPlaceBid,
  disabled = false,
  className,
}) => {
  const [accumulatedBid, setAccumulatedBid] = useState<number>(0); // 누적 추가 금액
  const currentTeam = teams.find((t) => t.captainId === currentUserId);
  const isCurrentUserTurn = currentTeam && auctionState.status === 'IN_PROGRESS';
  const totalBid = auctionState.currentHighestBid + accumulatedBid;
  const myBudget = currentTeam?.remainingGold || 0;
  const canPlaceBid = accumulatedBid > 0 && totalBid <= myBudget;

  // Timer calculation
  const [timeLeft, setTimeLeft] = useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((auctionState.timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 100);
    return () => clearInterval(interval);
  }, [auctionState.timerEnd]);

  // 새 선수 경매 시작 또는 다른 팀 입찰 시 누적 금액 초기화
  React.useEffect(() => {
    setAccumulatedBid(0);
  }, [auctionState.currentHighestBid, auctionState.currentPlayer?.id]);

  const handleBid = () => {
    if (canPlaceBid) {
      onPlaceBid(totalBid);
      setAccumulatedBid(0);
    }
  };

  const addToBid = (increment: number) => {
    setAccumulatedBid(prev => {
      const next = prev + increment;
      return auctionState.currentHighestBid + next <= myBudget ? next : prev;
    });
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Current Player on Auction */}
      {auctionState.currentPlayer && (
        <Card variant="elevated" className="border-accent-primary">
          <CardContent className="p-6">
            <div className="flex items-center gap-6">
              {/* Player Avatar */}
              <Avatar
                src={auctionState.currentPlayer.avatar}
                alt={auctionState.currentPlayer.username}
                fallback={auctionState.currentPlayer.username[0]}
                size="xl"
                className="ring-4 ring-accent-primary"
              />

              {/* Player Info */}
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-text-primary mb-2">
                  {auctionState.currentPlayer.username}
                </h2>
                <div className="flex items-center gap-3 mb-3">
                  <TierBadge
                    tier={auctionState.currentPlayer.tier}
                    rank={auctionState.currentPlayer.rank}
                  />
                  <Badge variant="primary">{auctionState.currentPlayer.position}</Badge>
                </div>
                {auctionState.currentPlayer.champions && (
                  <p className="text-sm text-text-secondary">
                    주 챔피언: {auctionState.currentPlayer.champions.slice(0, 3).join(', ')}
                  </p>
                )}
              </div>

              {/* Timer */}
              <div className="text-center">
                <p className="text-sm text-text-tertiary mb-1">남은 시간</p>
                <div
                  className={cn(
                    'text-4xl font-bold',
                    timeLeft <= 5 ? 'text-accent-danger animate-pulse' : 'text-accent-primary'
                  )}
                >
                  {timeLeft}초
                </div>
              </div>
            </div>

            {/* Current Bid Info */}
            <div className="mt-6 p-4 bg-bg-secondary rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-tertiary mb-1">현재 최고 입찰가</p>
                  <p className="text-2xl font-bold text-accent-gold">
                    {auctionState.currentHighestBid.toLocaleString()}G
                  </p>
                </div>
                {auctionState.currentHighestBidder && (
                  <div className="text-right">
                    <p className="text-sm text-text-tertiary mb-1">최고 입찰자</p>
                    <p className="text-lg font-semibold text-text-primary">
                      {teams.find(t => t.captainId === auctionState.currentHighestBidder)?.captainName || '알 수 없음'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bidding Panel - 누적형 */}
      {isCurrentUserTurn && auctionState.currentPlayer && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-text-tertiary">
                남은 골드: <span className="text-accent-gold font-bold">{myBudget.toLocaleString()}G</span>
              </p>
              <p className="text-sm text-text-tertiary">
                현재 최고가: <span className="text-text-primary font-medium">{auctionState.currentHighestBid.toLocaleString()}G</span>
              </p>
            </div>

            {/* 누적 금액 표시 */}
            <div className="bg-bg-tertiary rounded-xl p-4 mb-4 text-center">
              <p className="text-xs text-text-tertiary mb-1">내 입찰가</p>
              <p className={cn(
                'text-3xl font-bold',
                accumulatedBid > 0 ? 'text-accent-gold' : 'text-text-tertiary'
              )}>
                {totalBid.toLocaleString()}G
              </p>
              {accumulatedBid > 0 && (
                <p className="text-xs text-text-secondary mt-1">
                  {auctionState.currentHighestBid.toLocaleString()}G + <span className="text-accent-primary">{accumulatedBid.toLocaleString()}G</span>
                </p>
              )}
              {accumulatedBid === 0 && (
                <p className="text-xs text-text-tertiary mt-1">아래 버튼으로 금액을 추가하세요</p>
              )}
            </div>

            {/* 금액 추가 버튼 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[50, 100, 500].map((inc) => (
                <Button
                  key={inc}
                  variant="secondary"
                  size="sm"
                  onClick={() => addToBid(inc)}
                  disabled={disabled || auctionState.currentHighestBid + accumulatedBid + inc > myBudget}
                >
                  +{inc}G
                </Button>
              ))}
            </div>

            {/* 입찰 / 초기화 */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setAccumulatedBid(0)}
                disabled={disabled || accumulatedBid === 0}
                className="flex-shrink-0"
              >
                초기화
              </Button>
              <Button
                variant="primary"
                onClick={handleBid}
                disabled={disabled || !canPlaceBid}
                className="flex-1"
              >
                {canPlaceBid ? `${totalBid.toLocaleString()}G 입찰하기` : '금액을 추가하세요'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Teams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map((team) => (
          <Card key={team.id} className={cn(team.captainId === currentUserId && 'border-accent-primary')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">{team.name}</h3>
                <Badge variant="gold">{team.remainingGold.toLocaleString()}G</Badge>
              </div>

              {/* Team Members */}
              <div className="space-y-2">
                {team.members.length === 0 ? (
                  <p className="text-sm text-text-tertiary text-center py-4">아직 선수가 없습니다</p>
                ) : (
                  team.members.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 p-2 bg-bg-tertiary rounded"
                    >
                      <Avatar
                        src={player.avatar}
                        alt={player.username}
                        fallback={player.username[0]}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {player.username}
                        </p>
                        <p className="text-xs text-text-secondary">{player.position}</p>
                      </div>
                      <TierBadge tier={player.tier} size="sm" showIcon={false} />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
