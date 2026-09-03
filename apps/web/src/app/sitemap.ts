import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { RESOURCE_ARTICLES } from "./resources/articles";

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

type PublicMatchSitemapItem = {
  id: string;
  completedAt: string;
  updatedAt: string;
};

async function getPublicMatchEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const response = await fetch(`${API_BASE}/api/public/matches?limit=5000`, {
      next: { revalidate: 3600 },
    });
    if (!response.ok) return [];

    const matches = (await response.json()) as PublicMatchSitemapItem[];
    return matches.map((match) => ({
      url: absoluteUrl(`/lol/matches/match/${match.id}`),
      lastModified: new Date(match.updatedAt || match.completedAt),
      changeFrequency: "monthly",
      priority: 0.65,
    }));
  } catch {
    // API 점검 중에도 정적 사이트맵은 정상 제공한다.
    return [];
  }
}

// 게임별 화면은 `/lol/*` 아래에 있다. 옛 경로는 301로 리다이렉트되지만
// 사이트맵에는 최종 URL 을 실어야 한다 — 리다이렉트되는 URL 을 올리면
// 크롤 예산이 낭비되고 색인이 늦어진다.
const staticRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  // lab은 아직 비공개 — 공개 전까지 사이트맵·robots에서 제외 (크롤 예산을 내전 페이지에 집중)
  { path: "/about", priority: 0.75, changeFrequency: "monthly" },
  { path: "/lol/guide", priority: 0.85, changeFrequency: "monthly" },
  { path: "/lol/guide/start", priority: 0.72, changeFrequency: "monthly" },
  { path: "/lol/guide/team-modes", priority: 0.72, changeFrequency: "monthly" },
  { path: "/lol/guide/match-flow", priority: 0.72, changeFrequency: "monthly" },
  { path: "/lol/guide/discord", priority: 0.72, changeFrequency: "monthly" },
  { path: "/lol/guide/records", priority: 0.68, changeFrequency: "monthly" },
  { path: "/lol/guide/resources", priority: 0.8, changeFrequency: "monthly" },
  { path: "/lol/guide/faq", priority: 0.68, changeFrequency: "monthly" },
  { path: "/lol/matches", priority: 0.9, changeFrequency: "daily" },
  { path: "/lol/ranking", priority: 0.82, changeFrequency: "daily" },
  { path: "/community", priority: 0.78, changeFrequency: "daily" },
  { path: "/clans", priority: 0.72, changeFrequency: "daily" },
  { path: "/lol/tournaments", priority: 0.72, changeFrequency: "daily" },
  { path: "/streamers", priority: 0.68, changeFrequency: "hourly" },
  { path: "/contact", priority: 0.45, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const articleEntries: MetadataRoute.Sitemap = RESOURCE_ARTICLES.map(
    (article) => ({
      url: absoluteUrl(`/lol/guide/${article.slug}`),
      lastModified: new Date(article.updatedAt),
      changeFrequency: "monthly",
      priority: 0.8,
    }),
  );

  const publicMatchEntries = await getPublicMatchEntries();

  return [...staticEntries, ...articleEntries, ...publicMatchEntries];
}
