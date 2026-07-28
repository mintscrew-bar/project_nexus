"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { AdSenseScript } from "@/components/ads/AdSenseScript";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";

const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/auth",
  "/dashboard",
  "/profile",
  "/settings",
  "/role-selection",
  "/draft",
  "/auction",
  "/lab",
  "/broadcast",
  "/broadcast-control",
];

export function ThirdPartyScripts() {
  const pathname = usePathname();
  const isPrivateRoute = PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  // 내전 목록은 공개·광고 대상이지만, 실제 내전 룸과 그 하위 화면에서는
  // 진행 UI를 방해하지 않도록 AdSense를 로드하지 않는다.
  const isTournamentRoom = pathname.startsWith("/tournaments/");

  if (isPrivateRoute) return null;

  return (
    <>
      <GoogleAnalytics />
      {!isTournamentRoom && <AdSenseScript />}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <ConsentBanner />
    </>
  );
}
