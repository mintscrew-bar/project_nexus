"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // If user is already logged in, redirect to dashboard
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

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

  // 로딩 중 → 풀스크린 로딩 스피너 (AppShell이 셸 없이 렌더)
  if (isLoading || (isAuthenticated && !timedOut)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Logo size="xl" />
          {/* 초기 로딩 프로그레스 바 */}
          <div className="h-1 w-32 rounded-full bg-bg-tertiary overflow-hidden">
            <div className="h-full w-1/2 bg-accent-primary rounded-full animate-loading-slide" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <div className="max-w-4xl mx-auto animate-fade-in">
          <div className="flex justify-center mb-6 animate-bounce-in">
            <Logo size="xl" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 animate-slide-up">
            <span className="text-text-primary">Project</span>{" "}
            <span className="text-accent-primary">Nexus</span>
          </h1>
          <p className="text-xl md:text-2xl text-text-secondary mb-8 animate-slide-up" style={{ animationDelay: '100ms' }}>
            LoL 내전 토너먼트의 새로운 기준
          </p>
          <p className="text-lg text-text-tertiary mb-12 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '200ms' }}>
            경매 드래프트, 실시간 밸런싱, Discord 연동까지.
            <br />
            프로처럼 내전을 즐기세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up" style={{ animationDelay: '300ms' }}>
            <Link href="/auth/login">
              <Button size="lg" className="w-full sm:w-auto">
                Discord로 시작하기
              </Button>
            </Link>
            <Link href="/tournaments">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                자세히 알아보기
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-5xl mx-auto px-4 stagger-children">
          <div className="card text-center hover-lift">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-accent-primary mb-2">
              경매 드래프트
            </h3>
            <p className="text-text-secondary">
              실시간 입찰로 공정하고 재미있는 팀 구성
            </p>
          </div>

          <div className="card text-center hover-lift">
            <div className="text-4xl mb-4">⚖️</div>
            <h3 className="text-xl font-semibold text-accent-primary mb-2">
              자동 밸런싱
            </h3>
            <p className="text-text-secondary">
              티어와 전적 기반의 정확한 팀 밸런스
            </p>
          </div>

          <div className="card text-center hover-lift">
            <div className="text-4xl mb-4">🎮</div>
            <h3 className="text-xl font-semibold text-accent-primary mb-2">
              Discord 연동
            </h3>
            <p className="text-text-secondary">
              음성 채널 자동 이동, 알림, 봇 명령어
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
