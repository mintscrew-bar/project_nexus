"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import UserProfilePage from "@/components/profile/UserProfilePage";
import { ProfileTargetProvider } from "@/components/profile/ProfileTargetContext";
import { LoadingSpinner } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";

function MyProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    const query = searchParams.toString();
    const destination = `/me${query ? `?${query}` : ""}`;
    router.replace(`/auth/login?redirect=${encodeURIComponent(destination)}`);
  }, [isAuthenticated, isLoading, router, searchParams]);

  // 처음 들어올 때만 로딩 화면. 이미 사용자 정보가 있으면 다시 불러오는 중에도 화면을 유지한다 —
  // 프로필 편집·계정 변경 뒤 fetchUser 가 isLoading 을 켜면 페이지 전체가 내려가 창이 닫혔다.
  if ((isLoading && !user) || !isAuthenticated || !user) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <ProfileTargetProvider userId={user.id} isOwnProfile>
      <UserProfilePage />
    </ProfileTargetProvider>
  );
}

export default function MyProfilePage() {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" />}>
      <MyProfileContent />
    </Suspense>
  );
}
