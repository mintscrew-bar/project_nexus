"use client";

import React from 'react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

interface TierBadgeProps {
  tier: string;
  rank?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

const getTierVariant = (tier: string): any => {
  const tierLower = tier.toLowerCase();

  if (tierLower.includes('iron')) return 'iron';
  if (tierLower.includes('bronze')) return 'bronze';
  if (tierLower.includes('silver')) return 'silver';
  if (tierLower.includes('gold')) return 'tier-gold';
  if (tierLower.includes('platinum')) return 'platinum';
  if (tierLower.includes('emerald')) return 'emerald';
  if (tierLower.includes('diamond')) return 'diamond';
  if (tierLower.includes('master')) return 'master';
  if (tierLower.includes('grandmaster')) return 'grandmaster';
  if (tierLower.includes('challenger')) return 'challenger';

  return 'iron';
};

const getTierIcon = (tier: string): string => {
  const tierLower = tier.toLowerCase();

  if (tierLower.includes('challenger')) return '👑';
  if (tierLower.includes('grandmaster')) return '💎';
  if (tierLower.includes('master')) return '⭐';
  if (tierLower.includes('diamond')) return '💠';
  if (tierLower.includes('emerald')) return '💚';
  if (tierLower.includes('platinum')) return '🔷';
  if (tierLower.includes('gold')) return '🥇';
  if (tierLower.includes('silver')) return '🥈';
  if (tierLower.includes('bronze')) return '🥉';

  return '⚪';
};

export const TierBadge: React.FC<TierBadgeProps> = ({
  tier,
  rank,
  size = 'md',
  showIcon = true,
  className,
}) => {
  const variant = getTierVariant(tier);
  const icon = getTierIcon(tier);
  const displayText = rank ? `${tier} ${rank}` : tier;

  return (
    <Badge variant={variant} size={size} className={cn('font-semibold', className)}>
      {showIcon && <span className="mr-1">{icon}</span>}
      {displayText}
    </Badge>
  );
};
