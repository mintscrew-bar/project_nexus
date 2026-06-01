"use client";

import React from 'react';
import { Badge } from '@/components/ui';
import { cn, getTierBadgeVariant } from '@/lib/utils';

const TIER_ICON: Record<string, string> = {
  IRON:        '/icons/tiers/iron.png',
  BRONZE:      '/icons/tiers/bronze.png',
  SILVER:      '/icons/tiers/silver.png',
  GOLD:        '/icons/tiers/gold.png',
  PLATINUM:    '/icons/tiers/platinum.png',
  EMERALD:     '/icons/tiers/emerald.png',
  DIAMOND:     '/icons/tiers/diamond.png',
  MASTER:      '/icons/tiers/master.png',
  GRANDMASTER: '/icons/tiers/grandmaster.png',
  CHALLENGER:  '/icons/tiers/challenger.png',
};

const ICON_SIZE: Record<string, number> = { sm: 16, md: 20, lg: 26 };

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
  const displayTier = tier ?? 'UNRANKED';
  const displayText = rank ? `${displayTier} ${rank}` : displayTier;
  const iconUrl = TIER_ICON[displayTier.toUpperCase()];
  const iconPx = ICON_SIZE[size] ?? 20;

  return (
    <Badge variant={variant} size={size} className={cn('font-semibold', className)}>
      {showIcon && iconUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={displayTier}
          width={iconPx}
          height={iconPx}
          className="mr-1 shrink-0 object-contain"
          style={{ width: iconPx, height: iconPx }}
        />
      )}
      {displayText}
    </Badge>
  );
};
