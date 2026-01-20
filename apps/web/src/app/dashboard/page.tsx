"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingSpinner, EmptyState, Card, CardHeader, CardTitle, CardContent } from "@/components/ui";
import { Gamepad2, Trophy, TrendingUp, History } from "lucide-react";

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
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-text-primary">대시보드</h1>
          <p className="text-text-secondary">환영합니다, {user.username}님!</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 stagger-children">
          <Card className="hover-lift">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary mb-1">총 게임 수</p>
                  <p className="text-3xl font-bold text-accent-primary">0</p>
                </div>
                <div className="p-3 bg-accent-primary/10 rounded-lg">
                  <Gamepad2 className="h-6 w-6 text-accent-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary mb-1">승률</p>
                  <p className="text-3xl font-bold text-accent-gold">-</p>
                </div>
                <div className="p-3 bg-accent-gold/10 rounded-lg">
                  <Trophy className="h-6 w-6 text-accent-gold" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary mb-1">MMR</p>
                  <p className="text-3xl font-bold text-accent-success">-</p>
                </div>
                <div className="p-3 bg-accent-success/10 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-accent-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>최근 활동</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={History}
              title="아직 활동 내역이 없습니다"
              description="내전에 참여하면 여기에 활동 내역이 표시됩니다"
              action={{
                label: "내전 참여하기",
                onClick: () => router.push("/tournaments"),
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
