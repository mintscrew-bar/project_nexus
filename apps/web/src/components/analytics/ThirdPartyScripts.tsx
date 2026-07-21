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

  if (isPrivateRoute) return null;

  return (
    <>
      <GoogleAnalytics />
      <AdSenseScript />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <ConsentBanner />
    </>
  );
}
