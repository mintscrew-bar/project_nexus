"use client";

import dynamic from "next/dynamic";
import { useAuthStore } from "@/stores/auth-store";
import { ErrorBoundary, Skeleton } from "@/components/ui";

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

// 첫 방문 로그인 사용자에게만 필요한 모달이므로 공개 랜딩 번들에서는 제외한다.
const OnboardingGuideModal = dynamic(
  () =>
    import("@/components/OnboardingGuideModal").then(
      (mod) => mod.OnboardingGuideModal,
    ),
  { ssr: false },
);

// 공통 콘텐츠는 children으로 한 번만 서버 렌더링한다. 비로그인 전용 영역만
// 작은 슬롯으로 나누어, 긴 소개 섹션이 RSC payload에 중복되는 것을 방지한다.
export default function HomeClient({
  header,
  intro,
  footer,
  children,
}: {
  header: React.ReactNode;
  intro: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuthStore();

  // 인증 상태 → 대시보드 위젯 + 랜딩 콘텐츠 섹션
  if (isAuthenticated) {
    return (
      <div className="flex-grow animate-fade-in">
        {/* 신규 유저 첫 방문 온보딩 가이드 (localStorage로 1회 노출) */}
        <OnboardingGuideModal />
        <div className="container mx-auto max-w-7xl space-y-5 p-4 md:p-6">
          {/* 대시보드 개별 컴포넌트 crash가 전체 페이지를 다운시키지 않도록 보호 */}
          <ErrorBoundary>
            <DashboardContent />
          </ErrorBoundary>
        </div>
        {/* 랜딩과 동일한 콘텐츠 섹션 — 로그인 후에도 서비스 소개 콘텐츠를 유지 */}
        {children}
      </div>
    );
  }

  // 미인증·로딩·SSR → 서버 렌더된 랜딩 그대로 출력 (SEO 본문 노출)
  return (
    <main className="flex min-h-screen flex-col bg-bg-primary">
      {header}
      {intro}
      {children}
      {footer}
    </main>
  );
}
