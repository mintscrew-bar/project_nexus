"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const { completeOAuthLogin } = useAuthStore();
  const processed = useRef(false);

  useEffect(() => {
    // 중복 실행 방지 (StrictMode 이중 마운트 포함)
    if (processed.current) return;
    processed.current = true;

    // 토큰은 URL이 아니라 직전 라우트 핸들러가 심어둔 HTTP-only refresh 쿠키로 온다.
    // 쿠키 → /api/auth/refresh → 메모리 저장 순서라 URL·로그·Referer에 남지 않는다.
    completeOAuthLogin()
      .then(() => {
        const redirect = takeStoredRedirect();
        // 신규 사용자도 설정 페이지로 강제 이동시키지 않는다.
        // 메인 페이지에서 온보딩 모달을 띄우고 필요한 설정을 이어서 진행한다.
        router.push(redirect ?? "/");
      })
      .catch(() => {
        router.push("/auth/login?error=session_failed");
      });
  }, [router, completeOAuthLogin]);

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
