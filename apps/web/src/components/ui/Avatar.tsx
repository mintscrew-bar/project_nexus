'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useEffect, useState } from 'react';

// 프로필 없는 사용자 기본 이미지 — 방송용과 동일한 무채색 non-avatar.
// 렌더 크기에 맞는 걸 써서 다운스케일 뭉개짐을 줄인다.
const PLACEHOLDER_BY_SIZE: Record<'sm' | 'md' | 'lg' | 'xl', string> = {
  sm: '/images/placeholders/non-avatar-64.png',
  md: '/images/placeholders/non-avatar-64.png',
  lg: '/images/placeholders/non-avatar-128.png',
  xl: '/images/placeholders/non-avatar-128.png',
};

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'away' | 'dnd';
  className?: string;
}

export function Avatar({
  src,
  alt = 'Avatar',
  size = 'md',
  status,
  className,
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);
  const normalizedSrc = src?.trim() || null;

  useEffect(() => {
    setImageError(false);
  }, [normalizedSrc]);

  const sizeStyles = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg',
  };

  const statusColors = {
    online: 'bg-accent-success',
    offline: 'bg-text-tertiary',
    away: 'bg-accent-warning',
    dnd: 'bg-accent-danger',
  };

  const statusSizes = {
    sm: 'h-2 w-2',
    md: 'h-2.5 w-2.5',
    lg: 'h-3 w-3',
    xl: 'h-4 w-4',
  };

  return (
    <div className={cn('relative inline-flex', className)}>
      <div
        className={cn(
          'relative rounded-full bg-bg-tertiary flex items-center justify-center font-medium text-text-primary overflow-hidden flex-shrink-0',
          sizeStyles[size]
        )}
      >
        {normalizedSrc && !imageError ? (
          <Image
            src={normalizedSrc}
            alt={alt}
            fill
            sizes={
              size === 'sm' ? '32px' :
              size === 'md' ? '40px' :
              size === 'lg' ? '48px' :
              '64px'
            }
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <Image
            src={PLACEHOLDER_BY_SIZE[size]}
            alt={alt}
            fill
            sizes={
              size === 'sm' ? '32px' :
              size === 'md' ? '40px' :
              size === 'lg' ? '48px' :
              '64px'
            }
            className="object-cover"
          />
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-bg-primary',
            statusColors[status],
            statusSizes[size]
          )}
        />
      )}
    </div>
  );
}

interface AvatarGroupProps {
  avatars: Array<{
    src?: string | null;
    alt?: string;
    fallback?: string;
  }>;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarGroup({ avatars, max = 4, size = 'md', className }: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  const overlapStyles = {
    sm: '-ml-2',
    md: '-ml-3',
    lg: '-ml-4',
  };

  return (
    <div className={cn('flex items-center', className)}>
      {visibleAvatars.map((avatar, index) => (
        <Avatar
          key={index}
          {...avatar}
          size={size}
          className={cn(
            'ring-2 ring-bg-primary',
            index > 0 && overlapStyles[size]
          )}
        />
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            'rounded-full bg-bg-tertiary flex items-center justify-center font-medium text-text-secondary ring-2 ring-bg-primary',
            size === 'sm' ? 'h-8 w-8 text-xs -ml-2' :
            size === 'md' ? 'h-10 w-10 text-sm -ml-3' :
            'h-12 w-12 text-base -ml-4'
          )}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
