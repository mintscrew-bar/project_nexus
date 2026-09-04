"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { AdSenseScript } from "@/components/ads/AdSenseScript";
import { GAMES, GAME_TITLES } from "@nexus/types";

/** 게임 프리픽스 아래로 옮겨간 비공개 화면 (`/lol/auction`, `/pubg/draft` …) */
const GAME_SCOPED_PRIVATE = ["profile", "role-selection", "draft", "auction"];

const PRIVATE_ROUTE_PREFIXES = [
  "/admin",
  "/auth",
  "/dashboard",
  "/settings",
  "/broadcast",
  "/broadcast-control",
  "/dev",
  ...GAME_TITLES.flatMap((title) =>
    GAME_SCOPED_PRIVATE.map((path) => `/${GAMES[title].slug}/${path}`),
  ),
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
      <AdSenseScript />
      <GoogleAnalytics />
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <ConsentBanner />
    </>
  );
}
