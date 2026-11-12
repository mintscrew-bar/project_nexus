"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";
import { AdSenseScript } from "@/components/ads/AdSenseScript";
import { GAMES, GAME_TITLES } from "@nexus/types";
import { withoutGamePrefix } from "@/lib/game-links";

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
    PRIVATE_ROUTE_PATTERNS.some((pattern) =>
      pattern.test(withoutGamePrefix(pathname)),
    );

  // 비공개 화면(로비·경매·드래프트 등)으로 **클라이언트 이동**하면 위에서 빠진 AdSense
  // 스크립트가 이미 떠 있어서 자동 광고가 계속 자리를 찾는다. 2026-11-12 운영에서
  // 로비 맨 위에 자동 광고가 끼어 화면 높이에 맞춘 로비(참가자·채팅)가 찌그러졌다.
  // 공식 기능(pauseAdRequests)으로 이 화면들에서는 광고 요청 자체를 멈추고,
  // 일반 화면으로 나가면 다시 켠다. 광고를 숨기는 게 아니라 요청을 안 하는 것이다.
  useEffect(() => {
    const w = window as typeof window & {
      adsbygoogle?: unknown[] & { pauseAdRequests?: number };
    };
    // 스크립트보다 먼저 실행돼도 되도록 배열을 미리 만들어 둔다 (AdSense 권장 방식)
    w.adsbygoogle = w.adsbygoogle || [];
    w.adsbygoogle.pauseAdRequests = isPrivateRoute ? 1 : 0;
  }, [isPrivateRoute]);

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
