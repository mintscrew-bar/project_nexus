"use client";

import React from 'react';
import { Badge } from '@/components/ui';
import { cn, getTierBadgeVariant, getTierIcon } from '@/lib/utils';

interface TierBadgeProps {
  tier?: string | null;
  rank?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const TierBadge: React.FC<TierBadgeProps> = ({
  tier,
  rank,
  size = 'md',
  showIcon = true,
  className,
}) => {
  const variant = getTierBadgeVariant(tier) as any;
  const icon = getTierIcon(tier);
  const displayTier = tier ?? 'UNRANKED';
  const displayText = rank ? `${displayTier} ${rank}` : displayTier;

  return (
    <Badge variant={variant} size={size} className={cn('font-semibold', className)}>
      {showIcon && <span className="mr-1">{icon}</span>}
      {displayText}
    </Badge>
  );
};
