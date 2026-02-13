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
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "raw.communitydragon.org",
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Proxy all /api requests to backend except NextAuth routes
        source: "/api/:path((?!auth/\\[...nextauth\\]).*)",
        destination: `${process.env.API_URL || "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
