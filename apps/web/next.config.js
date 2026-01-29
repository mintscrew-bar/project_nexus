/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexus/types"],
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
    ],
  },
  async rewrites() {
    return [
      {
        // Exclude routes that have explicit Next.js API handlers
        source: "/api/:path((?!auth/callback|auth/refresh|auth/login|auth/register|auth/me|auth/logout|auth/\\[...nextauth\\]).*)",
        destination: `${process.env.API_URL || "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
