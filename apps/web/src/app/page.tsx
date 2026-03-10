"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Logo } from "@/components/Logo";
import { useAuthStore } from "@/stores/auth-store";
import { HeroBanner } from "@/components/home/HeroBanner";
import { DiscordBanner } from "@/components/home/DiscordBanner";
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

export default function Home() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [timedOut, setTimedOut] = useState(false);

  // 안전장치: auth 초기화가 4초 이상 걸리면 강제로 로딩 해제
  useEffect(() => {
    const timer = setTimeout(() => {
      const { isLoading: stillLoading } = useAuthStore.getState();
      if (stillLoading) {
        useAuthStore.setState({ isLoading: false });
        setTimedOut(true);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  // 로딩 중 → 풀스크린 로딩 스피너
  if (isLoading && !timedOut) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Logo size="xl" />
          <div className="h-1 w-32 rounded-full bg-bg-tertiary overflow-hidden">
            <div className="h-full w-1/2 bg-accent-primary rounded-full animate-loading-slide" />
          </div>
        </div>
      </div>
    );
  }

  // 인증 상태 → HeroBanner(전폭) + 대시보드 콘텐츠
  if (isAuthenticated) {
    return (
      <div className="flex-grow animate-fade-in">
        <HeroBanner isAuthenticated />
        <div className="container mx-auto max-w-7xl space-y-5 p-4 md:p-6">
          {/* 대시보드 개별 컴포넌트 crash가 전체 페이지를 다운시키지 않도록 보호 */}
          <ErrorBoundary>
            <DashboardContent />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  // 미인증 상태 → 랜딩 페이지
  return (
    <main className="flex min-h-screen flex-col">
      {/* 히어로 배너 — 궤도 + 파티클 + Framer Motion */}
      <HeroBanner />

      {/* Discord 배너 — 히어로 바로 아래 */}
      <section className="px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <DiscordBanner />
        </div>
      </section>

      {/* Feature highlights */}
      <section className="py-24 md:py-32 px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-center text-text-primary mb-16">
          엑셀로 하던 내전,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #8b5cf6, #6366f1, #d946ef)" }}
          >
            이제 그만할 때
          </span>
          {" "}됐잖아요.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-6xl mx-auto">
          <div className="group flex flex-col items-center text-center p-8 md:p-10 rounded-2xl bg-bg-secondary/50 border border-bg-tertiary hover:border-violet-500/30 transition-all duration-300 hover:scale-[1.02]">
            <div className="text-6xl md:text-7xl mb-6">🎯</div>
            <h3 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
              경매 드래프트
            </h3>
            <p className="text-lg text-text-secondary leading-relaxed">
              팀 구성부터가 이미 게임입니다. 경매 시작.<br className="hidden md:block" />
              팀장님, 그 포인트로 얘를 산다구요?
            </p>
          </div>

          <div className="group flex flex-col items-center text-center p-8 md:p-10 rounded-2xl bg-bg-secondary/50 border border-bg-tertiary hover:border-violet-500/30 transition-all duration-300 hover:scale-[1.02]">
            <div className="text-6xl md:text-7xl mb-6">⚖️</div>
            <h3 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
              자동 밸런싱
            </h3>
            <p className="text-lg text-text-secondary leading-relaxed">
              한쪽만 터지는 내전은<br className="hidden md:block" />
              이제 그만할 때 됐잖아요.
            </p>
          </div>

          <div className="group flex flex-col items-center text-center p-8 md:p-10 rounded-2xl bg-bg-secondary/50 border border-bg-tertiary hover:border-violet-500/30 transition-all duration-300 hover:scale-[1.02]">
            <div className="text-6xl md:text-7xl mb-6">🎮</div>
            <h3 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
              Discord 연동
            </h3>
            <p className="text-lg text-text-secondary leading-relaxed">
              음성 이동, 결과 기록, 전부 &lsquo;딸깍&rsquo;.<br className="hidden md:block" />
              당신은 게임만 하세요.
            </p>
          </div>
        </div>
      </section>

    </main>
  );
}
