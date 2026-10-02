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

  if (isLoading || !isAuthenticated || !user) {
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
