"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    // If user is already logged in, redirect to dashboard
    if (!isLoading && isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading or nothing while checking auth
  if (isLoading || isAuthenticated) {
    return null;
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
