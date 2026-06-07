"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { setAccessToken } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

const POST_LOGIN_REDIRECT_KEY = "nexus_post_login_redirect";

function takeStoredRedirect() {
  const value = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/api/") || value.startsWith("/auth/")) return null;
  return value;
}

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { fetchUser } = useAuthStore();
  const processed = useRef(false);

  useEffect(() => {
    // 중복 실행 방지 (replaceState 후 searchParams 변경으로 재실행되는 문제)
    if (processed.current) return;

    const token = searchParams.get("token");

    if (token) {
      processed.current = true;

      // 토큰을 URL에서 즉시 제거 (브라우저 히스토리/Referer 노출 방지)
      window.history.replaceState({}, "", "/auth/callback");

      // 토큰 저장
      setAccessToken(token);

      // 사용자 정보 가져오기
      fetchUser().then(() => {
        const currentUser = useAuthStore.getState().user;
        const redirect = takeStoredRedirect();
        const hasRiotAccount =
          Array.isArray(currentUser?.riotAccounts) &&
          currentUser.riotAccounts.length > 0;

        if (!hasRiotAccount) {
          router.push("/settings?onboarding=riot");
          return;
        }

        router.push(redirect ?? "/dashboard");
      });
    } else {
      router.push("/auth/login");
    }
  }, [searchParams, router, fetchUser]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
        <p className="text-text-secondary">로그인 처리 중...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
            <p className="text-text-secondary">로딩 중...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
