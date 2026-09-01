import { Skeleton } from "@/components/ui/Skeleton";

/**
 * 라우트 번들·서버 데이터를 기다리는 동안 현재 앱 구조와 비슷한 화면을 즉시 보여준다.
 * 전면 스피너 대신 레이아웃을 유지해 페이지 이동이 멈춘 것처럼 보이지 않게 한다.
 */
export default function Loading() {
  return (
    <div className="w-full flex-grow px-5 py-8 sm:px-6 md:py-10 lg:px-8" role="status" aria-label="페이지 불러오는 중">
      <div className="mx-auto w-full max-w-7xl animate-pulse">
        <div className="border-b border-bg-tertiary/70 pb-8">
          <Skeleton className="h-9 w-48 max-w-[66%]" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        </div>

        <div className="mt-8 space-y-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
      <span className="sr-only">페이지를 불러오고 있습니다.</span>
    </div>
  );
}
