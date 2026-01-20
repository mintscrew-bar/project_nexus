"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { Logo } from "@/components/Logo";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, fetchUser } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      fetchUser().catch(() => {
        router.push("/auth/login");
      });
    }
  }, [isAuthenticated, isLoading, fetchUser, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-ui-text-muted">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="flex-grow p-8"> {/* flex-grow to fill available space, padding for content */}
      <div className="container mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-ui-text-base">대시보드</h1>
          <p className="text-ui-text-muted">환영합니다, {user.username}님!</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-ui-card border border-ui-border rounded-xl p-6 shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-ui-text-base">총 게임 수</h3>
            <p className="text-3xl font-bold text-brand-500">0</p>
          </div>
          <div className="bg-ui-card border border-ui-border rounded-xl p-6 shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-ui-text-base">승률</h3>
            <p className="text-3xl font-bold text-ui-text-accent">-</p>
          </div>
          <div className="bg-ui-card border border-ui-border rounded-xl p-6 shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-ui-text-base">MMR</h3>
            <p className="text-3xl font-bold text-lol-accent-green">
              -
            </p> {/* Kept a specific LoL accent color here for example */}
          </div>
        </div>

        <div className="bg-ui-card border border-ui-border rounded-xl p-6 shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-ui-text-base">최근 활동</h2>
          <p className="text-ui-text-muted">아직 활동 내역이 없습니다.</p>
        </div>
      </div>
    </div>
  );
}
