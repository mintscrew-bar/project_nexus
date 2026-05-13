"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "nexus_consent"; // "granted" | "denied"

// 쿠키/분석 동의 배너 — 첫 방문 시 하단 고정으로 표시.
// "동의" 시 Consent Mode v2를 granted로 업데이트 → GA가 실제로 데이터 수집 시작.
// "거부" 시 denied 유지 → GA 스크립트는 로드되지만 ping만 보내고 식별 정보 미수집.
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) setVisible(true);
    } catch {
      // localStorage 차단 환경 — 배너 표시 안 함
    }
  }, []);

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
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="쿠키 사용 동의"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-bg-tertiary bg-bg-secondary/95 backdrop-blur"
    >
      <div className="container mx-auto flex max-w-7xl flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-text-secondary">
          Nexus는 서비스 개선과 통계를 위해 쿠키를 사용해요. 자세한 내용은{" "}
          <Link href="/privacy" className="underline hover:text-text-primary">
            개인정보 처리방침
          </Link>
          을 확인해주세요.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide(false)}
            className="rounded-lg border border-bg-tertiary px-4 py-2 text-sm text-text-secondary transition hover:text-text-primary"
          >
            거부
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            동의
          </button>
        </div>
      </div>
    </div>
  );
}
