"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// App Router는 라우트 변경 시 페이지가 reload되지 않으므로 SPA처럼 수동 page_view 전송.
// gtag('config')에서 send_page_view: false로 자동 전송을 끈 뒤,
// 여기서 pathname/search 변경마다 page_view 이벤트를 직접 보낸다.
export function PageViewTracker() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!gaId || typeof window === "undefined" || !window.gtag) return;

    const search = searchParams?.toString();
    const url = search ? `${pathname}?${search}` : pathname;

    window.gtag("event", "page_view", {
      page_path: url,
      page_location: window.location.href,
      page_title: document.title,
      send_to: gaId,
    });
  }, [gaId, pathname, searchParams]);

  return null;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}
