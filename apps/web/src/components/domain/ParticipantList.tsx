"use client";

import React from 'react';
import { Avatar, Badge } from '@/components/ui';
import { TierBadge } from './TierBadge';
import { cn } from '@/lib/utils';

interface Participant {
  id: string;
  username: string;
  avatar?: string;
  tier?: string;
  rank?: string;
  position?: string;
  isReady: boolean;
  isHost?: boolean;
}

interface ParticipantListProps {
  participants: Participant[];
  maxPlayers: number;
  currentUserId?: string;
  showReadyStatus?: boolean;
  className?: string;
}

const getPositionIcon = (position: string): string => {
  switch (position.toLowerCase()) {
    case 'top':
      return '⚔️';
    case 'jungle':
      return '🌲';
    case 'mid':
      return '⭐';
    case 'adc':
    case 'bot':
      return '🏹';
    case 'support':
      return '🛡️';
    default:
      return '❓';
  }
};

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  maxPlayers,
  currentUserId,
  showReadyStatus = true,
  className,
}) => {
  const emptySlots = Math.max(0, maxPlayers - participants.length);

  return (
    <div className={cn('bg-bg-secondary rounded-lg p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-text-primary">
          참가자
        </h3>
        <Badge variant={participants.length === maxPlayers ? 'success' : 'default'}>
          {participants.length}/{maxPlayers}
        </Badge>
      </div>

      {/* Participants List */}
      <div className="space-y-2">
        {participants.map((participant) => {
          const isCurrentUser = participant.id === currentUserId;

          return (
            <div
              key={participant.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg transition-colors duration-150',
                isCurrentUser
                  ? 'bg-accent-primary/10 border border-accent-primary/30'
                  : 'bg-bg-tertiary hover:bg-bg-elevated'
              )}
            >
              {/* Avatar */}
              <Avatar
                src={participant.avatar}
                alt={participant.username}
                fallback={participant.username[0]}
                size="md"
              />

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {participant.username}
                  </p>
                  {participant.isHost && (
                    <Badge variant="gold" size="sm">
                      👑 방장
                    </Badge>
                  )}
                  {isCurrentUser && (
                    <Badge variant="primary" size="sm">
                      나
                    </Badge>
                  )}
                </div>

                {/* Tier & Position */}
                <div className="flex items-center gap-2">
                  {participant.tier && (
                    <TierBadge
                      tier={participant.tier}
                      rank={participant.rank}
                      size="sm"
                      showIcon={false}
                    />
                  )}
                  {participant.position && (
                    <span className="text-xs text-text-secondary">
                      {getPositionIcon(participant.position)} {participant.position}
                    </span>
                  )}
                </div>
              </div>

              {/* Ready Status */}
              {showReadyStatus && (
                <div>
                  {participant.isReady ? (
                    <Badge variant="success" size="sm">
                      ✓ 준비
                    </Badge>
                  ) : (
                    <Badge variant="default" size="sm">
                      대기
                    </Badge>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Empty Slots */}
        {Array.from({ length: emptySlots }).map((_, index) => (
          <div
            key={`empty-${index}`}
            className="flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary/50 border border-dashed border-text-muted"
          >
            <div className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center">
              <span className="text-text-muted text-lg">+</span>
            </div>
            <p className="text-sm text-text-tertiary">빈 슬롯</p>
          </div>
        ))}
      </div>
    </div>
  );
};
