import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { RESOURCE_ARTICLES } from "./resources/articles";

const staticRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  // lab은 아직 비공개 — 공개 전까지 사이트맵·robots에서 제외 (크롤 예산을 내전 페이지에 집중)
  { path: "/about", priority: 0.75, changeFrequency: "monthly" },
  { path: "/resources", priority: 0.8, changeFrequency: "monthly" },
  { path: "/guide", priority: 0.85, changeFrequency: "monthly" },
  { path: "/community", priority: 0.9, changeFrequency: "daily" },
  { path: "/matches", priority: 0.9, changeFrequency: "daily" },
  { path: "/tournaments", priority: 0.9, changeFrequency: "hourly" },
  { path: "/ranking", priority: 0.8, changeFrequency: "daily" },
  { path: "/clans", priority: 0.75, changeFrequency: "daily" },
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

  const articleEntries: MetadataRoute.Sitemap = RESOURCE_ARTICLES.map((article) => ({
    url: absoluteUrl(`/resources/${article.slug}`),
    lastModified: new Date(article.updatedAt),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  // 실제 내전 룸처럼 휘발성·진행 중심인 화면은 제외하고, 공개 서비스 목록과
  // 검색·커뮤니티 진입점은 검색엔진에 제출한다.
  return [...staticEntries, ...articleEntries];
}
