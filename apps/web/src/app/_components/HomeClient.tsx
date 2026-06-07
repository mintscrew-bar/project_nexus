"use client";

import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/auth-store";
import { HeroBanner } from "@/components/home/HeroBanner";
import { ErrorBoundary, Skeleton } from "@/components/ui";
import { OnboardingGuideModal } from "@/components/OnboardingGuideModal";

// 대시보드 스켈레톤 — dynamic 청크 로드 중 빈 화면 방지
function DashboardFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[220px] rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

// 대시보드 컴포넌트는 인증 시에만 필요하므로 dynamic import로 로드
const DashboardContent = dynamic(
  () => import("@/components/home/DashboardContent").then((mod) => mod.DashboardContent),
  { ssr: false, loading: () => <DashboardFallback /> }
);

// 비로그인 랜딩(landing)은 page.tsx에서 서버 컴포넌트로 렌더해 prop으로 주입한다.
// → 미인증/로딩/SSR 시 그대로 출력되므로 검색봇이 랜딩 본문을 HTML로 읽을 수 있다.
// contentSections는 로그인 후에도 랜딩 섹션(Features, Workflow, Resources)을 보여주기 위한 prop이다.
export default function HomeClient({
  landing,
  contentSections,
}: {
  landing: React.ReactNode;
  contentSections: React.ReactNode;
}) {
  const { isAuthenticated } = useAuthStore();

  // 인증 상태 → HeroBanner(전폭) + 대시보드 위젯 + 랜딩 콘텐츠 섹션
  if (isAuthenticated) {
    return (
      <div className="flex-grow animate-fade-in">
        {/* 신규 유저 첫 방문 온보딩 가이드 (localStorage로 1회 노출) */}
        <OnboardingGuideModal />
        <HeroBanner isAuthenticated />
        <div className="container mx-auto max-w-7xl space-y-5 p-4 md:p-6">
          {/* 대시보드 개별 컴포넌트 crash가 전체 페이지를 다운시키지 않도록 보호 */}
          <ErrorBoundary>
            <DashboardContent />
          </ErrorBoundary>
        </div>
        {/* 랜딩과 동일한 콘텐츠 섹션 — 로그인 후에도 서비스 소개 콘텐츠를 유지 */}
        {contentSections}
      </div>
    );
  }

  // 미인증·로딩·SSR → 서버 렌더된 랜딩 그대로 출력 (SEO 본문 노출)
  return <>{landing}</>;
}
