"use client";

import React from 'react';
import { Card, CardContent, CardFooter, Badge } from '@/components/ui';
import { TierBadge } from './TierBadge';
import { cn, getRelativeTime } from '@/lib/utils';

interface Room {
  id: string;
  name: string;
  hostId: string;
  hostName?: string;
  maxParticipants: number;
  isPrivate: boolean;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'DRAFT' | 'DRAFT_COMPLETED' | 'TEAM_SELECTION' | 'ROLE_SELECTION';
  teamMode: 'AUCTION' | 'SNAKE_DRAFT';
  createdAt: string;
  minTier?: string;
  maxTier?: string;
  participants?: any[];
}

interface RoomCardProps {
  room: Room;
  currentUserId?: string;
  onClick?: () => void;
  className?: string;
}

const getModeLabel = (mode: string): string => {
  switch (mode) {
    case 'AUCTION':
      return '경매';
    case 'SNAKE_DRAFT':
      return '스네이크 드래프트';
    default:
      return mode;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'WAITING':
      return <Badge variant="default">대기 중</Badge>;
    case 'IN_PROGRESS':
      return <Badge variant="primary">진행 중</Badge>;
    case 'COMPLETED':
      return <Badge variant="success">완료</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
};

export const RoomCard: React.FC<RoomCardProps> = ({ room, currentUserId, onClick, className }) => {
  const currentPlayers = room.participants?.length || 0;
  const isFull = currentPlayers >= room.maxParticipants;
  const isParticipant =
    !!currentUserId && (room.participants ?? []).some((p: any) => p.userId === currentUserId);
  const canJoin = room.status === 'WAITING' && !isFull;
  const canEnter = canJoin || isParticipant;

  return (
    <Card
      hoverable={canEnter}
      onClick={canEnter ? onClick : undefined}
      className={cn(
        'transition-all duration-150',
        !canEnter && 'opacity-60 cursor-not-allowed',
        className
      )}
    >
      <CardContent>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-text-primary">{room.name}</h3>
              {room.isPrivate && <span className="text-accent-warning">🔒</span>}
            </div>
            <p className="text-sm text-text-secondary">
              방장: {room.hostName || `User ${room.hostId.slice(0, 8)}`}
            </p>
          </div>
          {getStatusBadge(room.status)}
        </div>

        {/* Room Info */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-xs text-text-tertiary mb-1">게임 모드</p>
            <Badge variant="primary" size="sm">
              {getModeLabel(room.teamMode)}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-text-tertiary mb-1">인원</p>
            <Badge
              variant={isFull ? 'danger' : 'success'}
              size="sm"
            >
              {currentPlayers}/{room.maxParticipants}명
            </Badge>
          </div>
        </div>

        {/* Tier Range */}
        {(room.minTier || room.maxTier) && (
          <div className="mb-3">
            <p className="text-xs text-text-tertiary mb-1">티어 제한</p>
            <div className="flex items-center gap-2">
              {room.minTier && <TierBadge tier={room.minTier} size="sm" />}
              {room.minTier && room.maxTier && (
                <span className="text-text-tertiary">~</span>
              )}
              {room.maxTier && <TierBadge tier={room.maxTier} size="sm" />}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t border-bg-tertiary pt-3">
        <p className="text-xs text-text-tertiary">
          {getRelativeTime(room.createdAt)}
        </p>
        {canJoin && (
          <div className="ml-auto">
            <span className="text-sm text-accent-primary font-medium">
              참가 가능 →
            </span>
          </div>
        )}
        {!canJoin && isParticipant && (
          <div className="ml-auto">
            <span className="text-sm text-accent-primary font-medium">재입장</span>
          </div>
        )}
      </CardFooter>
    </Card>
  );
};
