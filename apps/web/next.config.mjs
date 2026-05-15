/** @ts-check */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  optimizeFonts: false,
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
        ],
      },
      {
        source:
          "/:path(admin|api|auth|dashboard|profile|settings|role-selection|draft|auction)(.*)",
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
