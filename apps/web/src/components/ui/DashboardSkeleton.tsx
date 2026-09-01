import { Skeleton } from './Skeleton';

export function DashboardSkeleton() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col animate-pulse" role="status" aria-label="진행 화면 불러오는 중">
      <div className="flex items-center justify-between border-b border-bg-tertiary px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-11 w-24 rounded-lg" />
      </div>
      <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[2fr_1fr] lg:p-6">
        <Skeleton className="min-h-64 rounded-xl" />
        <Skeleton className="hidden min-h-64 rounded-xl lg:block" />
      </div>
      <div className="border-t border-bg-tertiary p-3">
        <Skeleton className="mx-auto h-11 w-full max-w-xl rounded-lg" />
      </div>
      <span className="sr-only">진행 화면을 불러오고 있습니다.</span>
    </div>
  );
}
