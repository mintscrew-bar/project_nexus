/** @ts-check */

import { createRequire } from "node:module";

// package.json을 앱 버전의 단일 출처로 사용하고 클라이언트 번들에 주입한다.
const require = createRequire(import.meta.url);
const { version: appVersion } = require("./package.json");

// XSS/서드파티 스크립트 리스크 완화용 CSP.
// 우선 Report-Only로 시작 — 실제 차단은 하지 않고 위반만 콘솔/리포트로 수집해
// 광고(AdSense)·분석(GA)·폰트·소켓 등 누락 도메인을 파악한 뒤 강제(enforce) 전환한다.
const adsensePreviewFrameAncestors =
  "frame-ancestors 'self' https://adsense.google.com https://www.google.com";
const denyFramingHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const cspReportOnly = [
  "default-src 'self'",
  // Next.js 인라인 스크립트 + AdSense/GA 로더 (초기엔 unsafe-inline/eval 허용, 이후 nonce화 검토)
  // adtrafficquality.google: AdSense 광고 품질(sodar) 스크립트
  // static.cloudflareinsights.com: Cloudflare 프록시가 자동 주입하는 웹 분석 비콘
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://adservice.google.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google.com https://*.adtrafficquality.google https://static.cloudflareinsights.com",
  // 폰트 CDN(jsdelivr)·구글 폰트 + Tailwind/런타임 인라인 스타일
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  // 이미지: 업로드/디스코드/ddragon/광고 픽셀 등 다양 → https 전반 허용
  "img-src 'self' data: blob: https:",
  // API REST + Socket.IO(ws/wss) + GA/AdSense 비콘
  "connect-src 'self' ws: wss: https://www.google-analytics.com https://*.google-analytics.com https://region1.google-analytics.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.adtrafficquality.google https://static.cloudflareinsights.com",
  // AdSense iframe
  "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.googlesyndication.com https://*.google.com https://*.adtrafficquality.google",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  adsensePreviewFrameAncestors,
  // 동일 출처 Route Handler로 위반을 수집한다. 차단 모드 전환 전 allowlist 근거로 사용한다.
  "report-uri /api/csp-report",
].join("; ");

const uploadRemotePattern = (() => {
  const value =
    process.env.NEXT_PUBLIC_UPLOADS_BASE_URL ||
    process.env.UPLOAD_PUBLIC_BASE_URL ||
    process.env.R2_PUBLIC_BASE_URL;
  if (!value) return null;

  try {
    const url = new URL(value);
    return {
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      ...(url.port && { port: url.port }),
    };
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  transpilePackages: [
    "@nexus/types",
    "@uiw/react-md-editor",
    "@uiw/react-markdown-preview",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
      {
        protocol: "https",
        hostname: "ddragon.leagueoflegends.com",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "4000",
      },
      // 스트리머 탭 미리보기 — 치지직 라이브 썸네일·채널 이미지
      {
        protocol: "https",
        hostname: "livecloud-thumb.akamaized.net",
      },
      {
        protocol: "https",
        hostname: "nng-phinf.pstatic.net",
      },
      // 숲(SOOP) 라이브 썸네일
      {
        protocol: "https",
        hostname: "liveimg.sooplive.com",
      },
      ...(uploadRemotePattern ? [uploadRemotePattern] : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            // AdSense 자동 광고 미리보기는 사이트를 Google iframe에서 연다.
            // 공개 페이지는 해당 출처만 허용하고 보호 경로는 아래에서 다시 차단한다.
            key: "Content-Security-Policy",
            value: adsensePreviewFrameAncestors,
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: cspReportOnly,
          },
        ],
      },
      {
        source:
          "/:path(admin|api|auth|dashboard|profile|settings|role-selection|draft|auction|broadcast|broadcast-control|dev|dm)(.*)",
        headers: [
          ...denyFramingHeaders,
          {
            // 인증·개인·관리 화면은 CDN/shared cache에 절대 보관하지 않는다.
            key: "Cache-Control",
            value: "private, no-store, max-age=0, must-revalidate",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/community/:path(write|bookmarks)(.*)",
        headers: [
          ...denyFramingHeaders,
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/community/:id/edit(.*)",
        headers: [
          ...denyFramingHeaders,
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        // 실제 파트너 프로그램·사례가 축적되기 전까지 단순 기능 안내 페이지는
        // 검색 결과에서 제외한다.
        source: "/partners",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/clans/create",
        headers: [
          ...denyFramingHeaders,
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/clans/:id/settings(.*)",
        headers: [
          ...denyFramingHeaders,
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/tournaments/:id/lobby(.*)",
        headers: denyFramingHeaders,
      },
    ];
  },
  async redirects() {
    // 게임별 화면이 `/lol/*` 아래로 옮겨졌다(배그 확장). 옮기기 전 링크가
    // 검색 색인·디스코드 공지·북마크에 이미 퍼져 있어 리다이렉트 없이 배포하면
    // 그 링크가 전부 404 가 된다. 게임을 특정할 수 없는 옛 경로는 기본 게임(롤)으로 보낸다.
    const MOVED_TO_GAME = [
      "matches",
      "ranking",
      "guide",
      "tournaments",
      "auction",
      "draft",
      "profile",
      "role-selection",
    ];
    const gameRedirects = MOVED_TO_GAME.flatMap((path) => [
      { source: `/${path}`, destination: `/lol/${path}`, permanent: true },
      {
        source: `/${path}/:rest*`,
        destination: `/lol/${path}/:rest*`,
        permanent: true,
      },
    ]);

    return [
      ...gameRedirects,
      {
        source: "/lab",
        destination: "/lol/matches",
        permanent: false,
      },
      {
        source: "/lab/:path*",
        destination: "/lol/matches",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Next.js Route Handler가 있는 경로 제외: auth/*, csp-report
        // 나머지는 NestJS 백엔드로 프록시
        source:
          "/api/:path((?!auth/refresh|auth/login|auth/logout|auth/register|auth/me|auth/callback|csp-report).*)",
        destination: `${process.env.API_URL || "http://localhost:4000"}/api/:path*`,
      },
      {
        // 업로드 파일을 API 서버에서 프록시
        source: "/uploads/:path*",
        destination: `${process.env.API_URL || "http://localhost:4000"}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
