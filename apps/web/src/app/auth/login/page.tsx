"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { Logo } from "@/components/Logo";
import { AlertCircle, X, CornerDownLeft } from "lucide-react";

const POST_LOGIN_REDIRECT_KEY = "nexus_post_login_redirect";

function sanitizeRedirect(value: string | null) {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/api/") || value.startsWith("/auth/")) return null;
  return value;
}

/**
 * 어디서 로그인 화면으로 넘어왔는지 알려주는 복귀 안내 문구.
 * 방 생성/방 입장처럼 행동 도중 로그인으로 튕긴 경우의 이탈을 줄이는 목적이다.
 */
function getRedirectNotice(redirect: string | null) {
  if (!redirect) return null;
  if (/^\/tournaments\/[^/]+\/lobby/.test(redirect)) {
    return "로그인하면 참여하려던 내전 방으로 다시 돌아갑니다.";
  }
  if (redirect.startsWith("/tournaments")) {
    return "로그인 후 내전 방 목록으로 돌아가 바로 방을 만들 수 있습니다.";
  }
  if (redirect.startsWith("/community")) return "로그인하면 보던 커뮤니티 화면으로 돌아갑니다.";
  if (redirect.startsWith("/clans")) return "로그인하면 보던 클랜 화면으로 돌아갑니다.";
  return "로그인하면 이전 화면으로 돌아갑니다.";
}

/**
 * URL 쿼리(error, redirect)에 의존하는 부분만 분리한 컴포넌트.
 * useSearchParams는 SSR에서 CSR bailout을 일으키므로, 이 부분만 Suspense 경계 안에 두어야
 * 로그인 카드 본문(로고, 버튼, 안내 문구)이 SSR HTML에 남는다. 합쳐두면 첫 페인트가 빈 화면이 된다.
 */
function LoginQueryNotices() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // 에러 파라미터 처리 시 URL을 replaceState로 정리하므로 redirect 값은 state에 보관한다.
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  // URL에서 에러 파라미터 확인
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // URL에서 에러 파라미터 제거
      window.history.replaceState({}, "", "/auth/login");
    }

    const redirect = sanitizeRedirect(searchParams.get("redirect"));
    if (redirect) {
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, redirect);
      setRedirectTo(redirect);
    }
  }, [searchParams]);

  const redirectNotice = getRedirectNotice(redirectTo);

  return (
    <>
      {/* 에러 메시지 */}
      {error && (
        <div className="p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-accent-danger flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <p className="text-accent-danger text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-accent-danger/70 hover:text-accent-danger"
            aria-label="에러 메시지 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 방 생성/방 입장 도중 넘어온 경우 복귀 지점을 알려준다 */}
      {redirectNotice && (
        <div className="flex items-start gap-2 rounded-lg border border-accent-primary/30 bg-accent-primary/10 p-3">
          <CornerDownLeft className="h-4 w-4 flex-shrink-0 mt-0.5 text-accent-primary" />
          <p className="text-sm text-text-secondary">{redirectNotice}</p>
        </div>
      )}
    </>
  );
}

function LoginPageContent() {
  const loginWithDiscord = useAuthStore((state) => state.loginWithDiscord);
  // 스토어의 isLoading은 초기 인증 복원 중에도 true라 그대로 쓰면
  // 첫 페인트에서 로그인 버튼이 "연결 중..." 비활성 상태로 보인다.
  // 실제 클릭 이후(=Discord로 이동 중)에만 로딩 표시를 한다.
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleLogin = () => {
    setIsRedirecting(true);
    loginWithDiscord();
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Logo size="xl" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">
            <span className="text-text-primary">Project</span>{" "}
            <span className="text-accent-primary">Nexus</span>
          </h1>
          <p className="text-text-secondary">
            LoL 내전 토너먼트 플랫폼에 오신 것을 환영합니다
          </p>
        </div>

        <div className="card">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-text-primary mb-2">로그인</h2>
              <p className="text-text-secondary text-sm">
                Nexus는 Discord 계정으로만 로그인합니다. 별도 회원가입은 없습니다.
              </p>
            </div>

            {/* 쿼리 의존 안내(에러/복귀 문구)만 Suspense 경계 안에서 렌더 */}
            <Suspense fallback={null}>
              <LoginQueryNotices />
            </Suspense>

            <button
              onClick={handleLogin}
              disabled={isRedirecting}
              className="w-full btn-primary flex items-center justify-center gap-3 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRedirecting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>연결 중...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-6 h-6"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  <span>Discord로 로그인</span>
                </>
              )}
            </button>

            {/* Discord 권한 범위와 Riot 연동 시점 안내 — 권한 요청 화면에서 당황하지 않도록 미리 설명한다 */}
            <ul className="space-y-1.5 text-xs leading-relaxed text-text-tertiary">
              <li>
                Discord에서 <span className="text-text-secondary">기본 프로필과 이메일(identify, email)</span>만
                받아 계정 식별과 내전 알림에 사용합니다.
              </li>
              <li>
                Riot 계정은 로그인 후 별도 단계에서 직접 입력합니다.{" "}
                <span className="text-text-secondary">비밀번호는 어떤 경우에도 요청하지 않습니다.</span>
              </li>
            </ul>

            <div className="text-center text-xs text-text-tertiary">
              <p>
                로그인하면{" "}
                <a href="/terms" className="text-accent-primary hover:underline">
                  이용약관
                </a>
                과{" "}
                <a href="/privacy" className="text-accent-primary hover:underline">
                  개인정보 처리방침
                </a>
                에 동의하는 것으로 간주됩니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // 페이지 전체를 Suspense로 감싸면 로그인 카드까지 SSR에서 빠지므로 감싸지 않는다.
  return <LoginPageContent />;
}
