'use client';

import React from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { TierBadge } from './TierBadge';
import { cn } from '@/lib/utils';
import { Gamepad2, MapPin } from 'lucide-react';

interface UserProfileProps {
  username: string;
  avatar?: string | null;
  tier?: string;
  rank?: string;
  mainRole?: string | null;
  subRole?: string | null;
  reputationScore?: number | null;
  isOnline?: boolean;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  TOP: '탑',
  JUNGLE: '정글',
  MID: '미드',
  ADC: '원딜',
  SUPPORT: '서포터',
};

export const UserProfile: React.FC<UserProfileProps> = ({
  username,
  avatar,
  tier,
  rank,
  mainRole,
  subRole,
  reputationScore,
  isOnline,
  compact = false,
  className,
  onClick,
}) => {
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2',
          onClick && 'cursor-pointer hover:opacity-80 transition-opacity',
          className,
        )}
        onClick={onClick}
      >
        <div className="relative">
          <Avatar src={avatar} alt={username} size="sm" />
          {isOnline !== undefined && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary',
                isOnline ? 'bg-accent-success' : 'bg-text-muted',
              )}
            />
          )}
        </div>
        <span className="font-medium text-text-primary text-sm truncate">{username}</span>
        {tier && <TierBadge tier={tier} rank={rank} size="sm" showIcon={false} />}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-bg-secondary border border-bg-tertiary rounded-xl p-5',
        onClick && 'cursor-pointer hover:border-accent-primary/50 transition-all duration-200',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        <div className="relative flex-shrink-0">
          <Avatar src={avatar} alt={username} size="lg" />
          {isOnline !== undefined && (
            <span
              className={cn(
                'absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-bg-secondary',
                isOnline ? 'bg-accent-success' : 'bg-text-muted',
              )}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-text-primary text-lg truncate">{username}</h3>
            {tier && <TierBadge tier={tier} rank={rank} size="sm" />}
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
            {mainRole && (
              <span className="flex items-center gap-1">
                <Gamepad2 className="h-3.5 w-3.5" />
                {ROLE_LABELS[mainRole] ?? mainRole}
                {subRole && (
                  <span className="text-text-tertiary">/ {ROLE_LABELS[subRole] ?? subRole}</span>
                )}
              </span>
            )}
            {reputationScore !== undefined && reputationScore !== null && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                평판 {reputationScore.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
