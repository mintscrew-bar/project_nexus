"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
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
  "/broadcast",
  "/broadcast-control",
  "/dev",
];

const PRIVATE_ROUTE_PATTERNS = [
  /^\/community\/(?:write|bookmarks)(?:\/|$)/,
  /^\/community\/[^/]+\/edit(?:\/|$)/,
  /^\/clans\/create(?:\/|$)/,
  /^\/clans\/[^/]+\/settings(?:\/|$)/,
  /^\/tournaments\/[^/]+\/lobby(?:\/|$)/,
];

function matchesRoutePrefix(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function ThirdPartyScripts() {
  const pathname = usePathname();
  const isPrivateRoute =
    matchesRoutePrefix(pathname, PRIVATE_ROUTE_PREFIXES) ||
    PRIVATE_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));

  if (isPrivateRoute) return null;

  return (
    <>
      <GoogleAnalytics />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <ConsentBanner />
    </>
  );
}
