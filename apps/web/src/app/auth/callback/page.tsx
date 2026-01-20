"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { setAccessToken } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { fetchUser } = useAuthStore();

  useEffect(() => {
    const token = searchParams.get("token");

    if (token) {
      // 토큰 저장
      setAccessToken(token);

      // 사용자 정보 가져오기
      fetchUser().then(() => {
        // 대시보드로 리다이렉트
        router.push("/dashboard");
      });
    } else {
      // 토큰이 없으면 로그인 페이지로
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
