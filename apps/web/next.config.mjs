/** @ts-check */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    ];
  },
  async rewrites() {
    return [
      {
        // Proxy all /api requests to backend except routes handled by Next.js API handlers
        source: "/api/:path((?!auth/refresh|auth/\\[...nextauth\\]).*)",
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
