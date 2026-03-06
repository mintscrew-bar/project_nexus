"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authApi, setAccessToken } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import { CheckSquare, Square, AlertCircle, Loader2 } from "lucide-react";

// 개인정보보호법 제21조 준수: 신규 OAuth 가입자의 명시적 약관 동의 취득
function AgreePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { fetchUser } = useAuthStore();
  const pendingToken = searchParams.get("token");

  const [agreements, setAgreements] = useState({
    termsOfService: false,
    privacyPolicy: false,
    ageVerification: false,
    marketingConsent: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 필수 항목이 모두 동의되었는지 확인
  const allRequiredChecked =
    agreements.termsOfService &&
    agreements.privacyPolicy &&
    agreements.ageVerification;

  const toggle = (key: keyof typeof agreements) => {
    setAgreements((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAll = () => {
    const all = allRequiredChecked && agreements.marketingConsent;
    setAgreements({
      termsOfService: !all,
      privacyPolicy: !all,
      ageVerification: !all,
      marketingConsent: !all,
    });
  };

  const handleSubmit = async () => {
    if (!allRequiredChecked || !pendingToken) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const { accessToken } = await authApi.agreeToTerms(pendingToken, agreements);
      // 정식 액세스 토큰 저장
      setAccessToken(accessToken);
      // 유저 정보 갱신
      await fetchUser();
      router.replace("/dashboard");
    } catch (err: any) {
      const msg = err?.response?.data?.message || "약관 동의 처리 중 오류가 발생했습니다.";
      setError(msg);
      setIsSubmitting(false);
    }
  };

  if (!pendingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-text-primary font-semibold mb-1">유효하지 않은 접근입니다.</p>
          <p className="text-sm text-text-tertiary mb-4">
            소셜 로그인을 통해 다시 시도해주세요.
          </p>
          <Link href="/auth/login" className="text-sm text-accent-primary hover:underline">
            로그인 페이지로 이동
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <Logo size="xl" />
          </div>
          <h1 className="text-xl font-bold text-text-primary mb-1">서비스 이용 약관 동의</h1>
          <p className="text-sm text-text-tertiary">
            Project Nexus 서비스를 이용하려면 아래 약관에 동의해야 합니다.
          </p>
        </div>

        {/* 동의 카드 */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 space-y-4">
          {/* 전체 동의 */}
          <button
            onClick={toggleAll}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-bg-tertiary hover:bg-bg-elevated transition-colors text-left"
          >
            {allRequiredChecked && agreements.marketingConsent ? (
              <CheckSquare className="h-5 w-5 text-accent-primary flex-shrink-0" />
            ) : (
              <Square className="h-5 w-5 text-text-tertiary flex-shrink-0" />
            )}
            <span className="text-sm font-semibold text-text-primary">전체 동의</span>
          </button>

          <hr className="border-bg-elevated" />

          {/* 필수 항목들 */}
          <CheckItem
            checked={agreements.termsOfService}
            onToggle={() => toggle("termsOfService")}
            label="이용약관 동의"
            required
            href="/terms"
          />
          <CheckItem
            checked={agreements.privacyPolicy}
            onToggle={() => toggle("privacyPolicy")}
            label="개인정보 수집·이용 동의"
            required
            href="/privacy"
          />
          <CheckItem
            checked={agreements.ageVerification}
            onToggle={() => toggle("ageVerification")}
            label="만 14세 이상임을 확인합니다"
            required
          />

          <hr className="border-bg-elevated" />

          {/* 선택 항목 */}
          <CheckItem
            checked={agreements.marketingConsent}
            onToggle={() => toggle("marketingConsent")}
            label="마케팅 정보 수신 동의 (선택)"
          />
          <p className="text-xs text-text-tertiary pl-8">
            서비스 업데이트, 이벤트 알림 등을 받을 수 있습니다. 동의하지 않아도 서비스 이용이
            가능하며, 언제든지 설정에서 변경할 수 있습니다.
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* 동의 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={!allRequiredChecked || isSubmitting}
          className="mt-5 w-full py-3 rounded-xl bg-accent-primary text-white font-semibold text-sm hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              처리 중...
            </>
          ) : (
            "동의하고 시작하기"
          )}
        </button>

        <p className="mt-4 text-center text-xs text-text-tertiary">
          동의를 완료하면 Project Nexus 계정이 생성됩니다.
        </p>
      </div>
    </div>
  );
}

// 체크 항목 컴포넌트
function CheckItem({
  checked,
  onToggle,
  label,
  required,
  href,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  required?: boolean;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onToggle} className="flex-shrink-0">
        {checked ? (
          <CheckSquare className="h-5 w-5 text-accent-primary" />
        ) : (
          <Square className="h-5 w-5 text-text-tertiary" />
        )}
      </button>
      <div className="flex items-center gap-1.5 flex-1">
        {required && (
          <span className="text-xs text-red-400 font-medium">[필수]</span>
        )}
        <span className="text-sm text-text-secondary">{label}</span>
        {href && (
          <Link
            href={href}
            target="_blank"
            className="text-xs text-accent-primary hover:underline ml-auto"
          >
            보기
          </Link>
        )}
      </div>
    </div>
  );
}

export default function AgreePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-tertiary" />
      </div>
    }>
      <AgreePageContent />
    </Suspense>
  );
}
