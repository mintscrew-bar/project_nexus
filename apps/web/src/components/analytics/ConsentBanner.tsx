"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsClient } from "@/hooks/useIsClient";

const STORAGE_KEY = "nexus_consent"; // "granted" | "denied"

/** 저장된 동의 답이 있는가 — localStorage 가 막힌 환경은 "있다" 로 보고 배너를 띄우지 않는다 */
function hasSavedConsent(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return true;
  }
}

// 쿠키/분석 동의 배너 — 첫 방문 시 하단 고정으로 표시.
// "동의" 시 Consent Mode v2를 granted로 업데이트 → GA가 실제로 데이터 수집 시작.
// "거부" 시 denied 유지 → GA 스크립트는 로드되지만 ping만 보내고 식별 정보 미수집.
// 모바일: 배너 높이만큼 body에 padding-bottom을 주입해 콘텐츠 가림 방지.
export function ConsentBanner() {
  const pathname = usePathname();
  const bannerRef = useRef<HTMLDivElement>(null);
  const isBroadcastRoute = pathname?.startsWith("/broadcast");
  // 이번에 답했는가 — 저장된 답은 localStorage 에서 그릴 때 읽는다(브라우저에서만).
  // 예전엔 효과에서 읽어 setVisible(true) 했는데(set-state-in-effect), 그릴 때 읽어도 같다.
  const isClient = useIsClient();
  const [answered, setAnswered] = useState(false);
  const visible =
    isClient && !answered && !isBroadcastRoute && !hasSavedConsent();

  // 배너 높이를 body padding-bottom에 반영 → 하단 콘텐츠 가림 방지
  useEffect(() => {
    if (!visible || isBroadcastRoute) {
      document.body.style.paddingBottom = "";
      return;
    }
    const update = () => {
      if (bannerRef.current) {
        document.body.style.paddingBottom = `${bannerRef.current.offsetHeight}px`;
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      document.body.style.paddingBottom = "";
    };
  }, [visible, isBroadcastRoute]);

  const decide = (granted: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, granted ? "granted" : "denied");
    } catch {}

    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("consent", "update", {
        ad_storage: granted ? "granted" : "denied",
        ad_user_data: granted ? "granted" : "denied",
        ad_personalization: granted ? "granted" : "denied",
        analytics_storage: granted ? "granted" : "denied",
      });
    }
    setAnswered(true);
  };

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      role="dialog"
      aria-live="polite"
      aria-label="쿠키 사용 동의"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-bg-tertiary bg-bg-secondary/95 backdrop-blur"
    >
      <div className="container mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 text-xs text-text-secondary">
          서비스 개선을 위해 쿠키를 사용해요.{" "}
          <Link href="/privacy" className="underline hover:text-text-primary">
            개인정보 처리방침
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide(false)}
            className="rounded-lg border border-bg-tertiary px-3 py-1.5 text-xs text-text-secondary transition hover:text-text-primary"
          >
            거부
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="rounded-lg bg-accent-primary px-3 py-1.5 text-xs font-medium text-accent-on transition hover:opacity-90"
          >
            동의
          </button>
        </div>
      </div>
    </div>
  );
}
