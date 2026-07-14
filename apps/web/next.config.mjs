/** @ts-check */

// XSS/서드파티 스크립트 리스크 완화용 CSP.
// 우선 Report-Only로 시작 — 실제 차단은 하지 않고 위반만 콘솔/리포트로 수집해
// 광고(AdSense)·분석(GA)·폰트·소켓 등 누락 도메인을 파악한 뒤 강제(enforce) 전환한다.
const cspReportOnly = [
  "default-src 'self'",
  // Next.js 인라인 스크립트 + AdSense/GA 로더 (초기엔 unsafe-inline/eval 허용, 이후 nonce화 검토)
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://adservice.google.com https://www.googletagmanager.com https://www.google-analytics.com https://*.google.com",
  // 폰트 CDN(jsdelivr)·구글 폰트 + Tailwind/런타임 인라인 스타일
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  // 이미지: 업로드/디스코드/ddragon/광고 픽셀 등 다양 → https 전반 허용
  "img-src 'self' data: blob: https:",
  // API REST + Socket.IO(ws/wss) + GA/AdSense 비콘
  "connect-src 'self' ws: wss: https://www.google-analytics.com https://*.google-analytics.com https://region1.google-analytics.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.google.com",
  // AdSense iframe
  "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.googlesyndication.com https://*.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
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
  transpilePackages: ["@nexus/types", "@uiw/react-md-editor", "@uiw/react-markdown-preview"],
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
      ...(uploadRemotePattern ? [uploadRemotePattern] : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: cspReportOnly,
          },
        ],
      },
      {
        source:
          "/:path(admin|api|auth|dashboard|profile|settings|role-selection|draft|auction|lab|broadcast|broadcast-control)(.*)",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
      {
        source: "/community/:path(write|bookmarks)(.*)",
        headers: [
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
        // 데이터가 쌓이기 전의 빈 목록·테스트성 UGC는 공개 접근은 유지하되
        // 검색 색인에서는 제외한다. 큐레이션된 공개 콘텐츠가 축적되면 해제한다.
        source: "/:path(tournaments|matches|ranking|clans|community)(.*)",
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
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Next.js Route Handler가 있는 경로 제외: auth/refresh, auth/login, auth/logout,
        // auth/register, auth/me, auth/callback — 나머지는 NestJS 백엔드로 프록시
        source: "/api/:path((?!auth/refresh|auth/login|auth/logout|auth/register|auth/me|auth/callback).*)",
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
