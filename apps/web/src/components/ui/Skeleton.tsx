import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'avatar' | 'button';
}

export function Skeleton({ className, variant = 'text' }: SkeletonProps) {
  const variantStyles = {
    text: 'h-4 w-full',
    card: 'h-32 w-full rounded-xl',
    avatar: 'h-10 w-10 rounded-full',
    button: 'h-10 w-24 rounded-lg',
  };

  return (
    <div
      className={cn(
        'skeleton',
        variantStyles[variant],
        className
      )}
      aria-hidden="true"
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? 'w-3/4' : 'w-full'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('bg-bg-secondary border border-bg-tertiary rounded-xl p-6 space-y-4', className)}>
      <Skeleton variant="text" className="h-6 w-1/2" />
      <SkeletonText lines={2} />
      <div className="flex gap-2">
        <Skeleton variant="button" />
        <Skeleton variant="button" />
      </div>
    </div>
  );
}

export function RoomCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-2xl border border-bg-tertiary/45 bg-bg-secondary shadow-[0_8px_24px_rgb(0_0_0/0.10)]', className)}>
      <div className="flex-1 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Skeleton className="h-10 w-10 flex-none rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="min-w-0 space-y-2.5 rounded-xl border border-bg-elevated/30 bg-bg-elevated/20 px-3.5 py-4">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-16 max-w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center border-t border-bg-tertiary/35 bg-bg-primary/10 px-5 py-4 sm:px-6 sm:py-5">
        <div className="w-28 max-w-full space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-1 w-28 max-w-full rounded-full" />
        </div>
        <Skeleton className="ml-auto h-4 w-16" />
      </div>
    </div>
  );
}

export function PostCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('bg-bg-secondary border border-bg-tertiary rounded-xl p-4', className)}>
      <div className="flex items-start gap-3">
        <div className="flex-grow space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-10" />
          </div>
        </div>
      </div>
    </div>
  );
}
