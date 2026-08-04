"use client";

import React from 'react';
import { Card, CardContent, CardFooter, Badge } from '@/components/ui';
import { cn, getRelativeTime } from '@/lib/utils';
import { ArrowRight, ArrowLeftRight, Eye, EyeOff, Gavel, ListOrdered, LockKeyhole, Scale, Server, Users } from 'lucide-react';

interface Room {
  id: string;
  name: string;
  hostId: string;
  hostName?: string;
  host?: { id: string; username: string; avatar?: string };
  maxParticipants: number;
  isPrivate: boolean;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'DRAFT' | 'DRAFT_COMPLETED' | 'TEAM_SELECTION' | 'ROLE_SELECTION';
  teamMode: 'AUCTION' | 'SNAKE_DRAFT' | 'AUTO_BALANCE' | 'MANUAL_TEAM';
  createdAt: string;
  discordGuildId?: string | null;
  allowSpectators?: boolean;
  participants?: any[];
  /** 호스트가 방송 중이면 채워진다. 라이브 조회 실패 시에는 null이라 뱃지가 숨는다. */
  hostLive?: { platform: string; channelUrl: string } | null;
}

interface RoomCardProps {
  room: Room;
  currentUserId?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * 호스트 방송 중 뱃지. 카드 클릭(방 입장)과 겹치지 않게 클릭을 가로채
 * 방송으로 보낸다.
 */
function HostLiveBadge({ channelUrl }: { channelUrl: string }) {
  return (
    <a
      href={channelUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="호스트가 방송 중입니다"
      className="flex flex-shrink-0 items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white transition-opacity hover:opacity-80"
    >
      <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
      LIVE
    </a>
  );
}

const getModeLabel = (mode: string): string => {
  switch (mode) {
    case 'AUCTION':
      return '경매';
    case 'SNAKE_DRAFT':
      return '스네이크 드래프트';
    case 'AUTO_BALANCE':
      return '자동 밸런스';
    case 'MANUAL_TEAM':
      return '자유 팀 선택';
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

const getModeIcon = (mode: Room['teamMode']) => {
  switch (mode) {
    case 'AUCTION':
      return Gavel;
    case 'SNAKE_DRAFT':
      return ListOrdered;
    case 'AUTO_BALANCE':
      return Scale;
    default:
      return ArrowLeftRight;
  }
};

export const RoomCard: React.FC<RoomCardProps> = ({ room, currentUserId, onClick, className }) => {
  const currentPlayers = (room.participants ?? []).filter(
    (participant: any) => participant.role !== 'SPECTATOR'
  ).length;
  const isFull = currentPlayers >= room.maxParticipants;
  const isParticipant =
    !!currentUserId && (room.participants ?? []).some((p: any) => p.userId === currentUserId);
  const canJoin = room.status === 'WAITING' && !isFull;
  const canEnter = canJoin || isParticipant;
  const ModeIcon = getModeIcon(room.teamMode);
  const occupancy = Math.max(
    0,
    Math.min(100, (currentPlayers / Math.max(room.maxParticipants, 1)) * 100)
  );

  return (
    <Card
      hoverable={canEnter}
      onClick={canEnter ? onClick : undefined}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border-bg-tertiary/45 bg-bg-secondary p-0 shadow-[0_8px_24px_rgb(0_0_0/0.10)] transition-all duration-200',
        canEnter && 'hover:-translate-y-1 hover:border-accent-primary/30 hover:shadow-[0_18px_42px_rgb(0_0_0/0.20)]',
        !canEnter && 'opacity-70 cursor-not-allowed',
        className
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      />

      <CardContent className="flex-1 p-5 sm:p-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent-primary/[0.09] text-accent-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
              <ModeIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-base font-bold tracking-[-0.02em] text-text-primary md:text-lg">
                  {room.name}
                </h3>
                {room.isPrivate && <LockKeyhole className="h-3.5 w-3.5 flex-shrink-0 text-accent-warning" />}
                {room.hostLive && <HostLiveBadge channelUrl={room.hostLive.channelUrl} />}
              </div>
              <p className="mt-1.5 truncate text-xs text-text-tertiary">
                {room.host?.username || room.hostName || `User ${room.hostId.slice(0, 8)}`} 방장 · {getRelativeTime(room.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex-shrink-0">{getStatusBadge(room.status)}</div>
        </div>

        {/* Room Info */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-bg-elevated/30 bg-bg-elevated/20 px-3.5 py-4">
            <p className="mb-2.5 text-[10px] font-semibold tracking-[0.1em] text-text-tertiary">MODE</p>
            <p className="truncate text-xs font-semibold text-text-secondary">{getModeLabel(room.teamMode)}</p>
          </div>
          <div className="rounded-xl border border-bg-elevated/30 bg-bg-elevated/20 px-3.5 py-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-text-tertiary">
              <Server className="h-3 w-3" />
              <p className="text-[10px] font-semibold tracking-[0.1em]">생성 서버</p>
            </div>
            <p className="truncate text-xs font-semibold text-text-secondary">
              {room.discordGuildId ? 'Discord 서버' : '넥서스 서버'}
            </p>
          </div>
          <div className="rounded-xl border border-bg-elevated/30 bg-bg-elevated/20 px-3.5 py-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-text-tertiary">
              {room.allowSpectators === false ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
              <p className="text-[10px] font-semibold tracking-[0.1em]">관전 허용</p>
            </div>
            <p className={cn(
              'truncate text-xs font-semibold',
              room.allowSpectators === false ? 'text-text-tertiary' : 'text-accent-success'
            )}>
              {room.allowSpectators === false ? '비허용' : '허용'}
            </p>
          </div>
        </div>
      </CardContent>

      <CardFooter className="m-0 border-t border-bg-tertiary/35 bg-bg-primary/10 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex w-28 max-w-full items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <Users className="h-3 w-3" />
              <p className="text-[10px] font-semibold tracking-[0.1em]">참가 인원</p>
            </div>
            <span className={cn('flex-none text-xs font-bold tabular-nums', isFull ? 'text-accent-danger' : 'text-accent-success')}>
              {currentPlayers}/{room.maxParticipants}
            </span>
          </div>
          <div className="mt-2.5 h-1 w-28 max-w-full overflow-hidden rounded-full bg-bg-elevated">
            <div
              className={cn('h-full rounded-full', isFull ? 'bg-accent-danger' : 'bg-accent-success')}
              style={{ width: `${occupancy}%` }}
            />
          </div>
        </div>
        {canJoin && (
          <div className="ml-auto flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-accent-primary" />
            <span className="text-xs font-semibold text-accent-primary">참가 가능</span>
            <ArrowRight className="h-3.5 w-3.5 text-accent-primary transition-transform group-hover:translate-x-1" />
          </div>
        )}
        {!canJoin && isParticipant && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs font-semibold text-accent-primary">재입장</span>
            <ArrowRight className="h-3.5 w-3.5 text-accent-primary transition-transform group-hover:translate-x-1" />
          </div>
        )}
      </CardFooter>
    </Card>
  );
};
