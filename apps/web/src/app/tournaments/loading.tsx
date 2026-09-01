import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

export default function TournamentsLoading() {
  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8" role="status" aria-label="내전 목록 불러오는 중">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="flex items-end justify-between gap-4 border-b border-bg-tertiary/70 pb-6">
          <div>
            <Skeleton className="h-9 w-36" />
            <Skeleton className="mt-3 h-4 w-64 max-w-full" />
          </div>
          <Skeleton className="h-11 w-28 rounded-lg" />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />)}
        </div>
      </div>
      <span className="sr-only">내전 목록을 불러오고 있습니다.</span>
    </div>
  );
}
