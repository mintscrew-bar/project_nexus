import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const staticRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  // lab은 아직 비공개 — 공개 전까지 사이트맵·robots에서 제외 (크롤 예산을 내전 페이지에 집중)
  { path: "/tournaments", priority: 0.9, changeFrequency: "daily" },
  { path: "/matches", priority: 0.8, changeFrequency: "daily" },
  { path: "/ranking", priority: 0.8, changeFrequency: "daily" },
  { path: "/clans", priority: 0.7, changeFrequency: "daily" },
  { path: "/community", priority: 0.65, changeFrequency: "daily" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/feed.xml", priority: 0.5, changeFrequency: "hourly" },
] as const;

async function fetchCommunityPosts(): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(`${API_BASE}/api/community?page=1&limit=100&sort=latest`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const posts: Array<{ id: string; createdAt?: string; updatedAt?: string }> =
      data.posts ?? data ?? [];
    return posts.map((post) => ({
      url: absoluteUrl(`/community/${post.id}`),
      lastModified: post.updatedAt ? new Date(post.updatedAt) : new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

async function fetchClans(): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(`${API_BASE}/api/clans?page=1&limit=100`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const clans: Array<{ id: string; updatedAt?: string }> =
      data.clans ?? data ?? [];
    return clans.map((clan) => ({
      url: absoluteUrl(`/clans/${clan.id}`),
      lastModified: clan.updatedAt ? new Date(clan.updatedAt) : new Date(),
      changeFrequency: "weekly",
      priority: 0.65,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const [communityEntries, clanEntries] = await Promise.all([
    fetchCommunityPosts(),
    fetchClans(),
  ]);

  return [...staticEntries, ...communityEntries, ...clanEntries];
}
