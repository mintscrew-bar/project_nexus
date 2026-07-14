import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { RESOURCE_ARTICLES } from "./resources/articles";

const staticRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  // lab은 아직 비공개 — 공개 전까지 사이트맵·robots에서 제외 (크롤 예산을 내전 페이지에 집중)
  { path: "/about", priority: 0.75, changeFrequency: "monthly" },
  { path: "/resources", priority: 0.8, changeFrequency: "monthly" },
  { path: "/guide", priority: 0.85, changeFrequency: "monthly" },
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

  // 공개 경기·커뮤니티 데이터가 충분히 축적되기 전까지는 제품 문서만 색인에
  // 제출한다. 빈 목록·테스트성 UGC가 사이트 전체 품질 평가를 낮추지 않게 한다.
  return [...staticEntries, ...articleEntries];
}
