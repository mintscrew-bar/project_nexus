import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";
const SITEMAP_REVALIDATE_SECONDS = 3600;
const COMMUNITY_PAGE_SIZE = 100;

const staticRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  // lab은 아직 비공개 — 공개 전까지 사이트맵·robots에서 제외 (크롤 예산을 내전 페이지에 집중)
  { path: "/about", priority: 0.75, changeFrequency: "monthly" },
  { path: "/resources", priority: 0.8, changeFrequency: "monthly" },
  { path: "/guide", priority: 0.85, changeFrequency: "monthly" },
  { path: "/tournaments", priority: 0.9, changeFrequency: "daily" },
  { path: "/matches", priority: 0.8, changeFrequency: "daily" },
  { path: "/ranking", priority: 0.8, changeFrequency: "daily" },
  { path: "/clans", priority: 0.7, changeFrequency: "daily" },
  { path: "/community", priority: 0.65, changeFrequency: "daily" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/feed.xml", priority: 0.5, changeFrequency: "hourly" },
] as const;

interface CommunityPost {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

interface CommunityPostsResponse {
  posts?: CommunityPost[];
  total?: number;
}

interface Clan {
  id: string;
  updatedAt?: string;
}

function toLastModified(value?: string): Date | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function fetchCommunityPosts(): Promise<MetadataRoute.Sitemap> {
  try {
    const posts: CommunityPost[] = [];
    let offset = 0;
    let total: number | undefined;

    do {
      const params = new URLSearchParams({
        limit: String(COMMUNITY_PAGE_SIZE),
        offset: String(offset),
        sortBy: "latest",
      });
      const res = await fetch(`${API_BASE}/api/community/posts?${params}`, {
        next: { revalidate: SITEMAP_REVALIDATE_SECONDS },
      });
      if (!res.ok) return [];

      const data: CommunityPostsResponse = await res.json();
      const page = data.posts ?? [];
      posts.push(...page);
      total = data.total;
      offset += page.length;

      if (page.length === 0) break;
    } while (total !== undefined && offset < total);

    return posts.map((post) => ({
      url: absoluteUrl(`/community/${post.id}`),
      lastModified:
        toLastModified(post.updatedAt) ?? toLastModified(post.createdAt),
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

async function fetchClans(): Promise<MetadataRoute.Sitemap> {
  try {
    const res = await fetch(`${API_BASE}/api/clans`, {
      next: { revalidate: SITEMAP_REVALIDATE_SECONDS },
    });
    if (!res.ok) return [];
    const data: Clan[] | { clans?: Clan[] } = await res.json();
    const clans = Array.isArray(data) ? data : (data.clans ?? []);
    return clans.map((clan) => ({
      url: absoluteUrl(`/clans/${clan.id}`),
      lastModified: toLastModified(clan.updatedAt),
      changeFrequency: "weekly",
      priority: 0.65,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const [communityEntries, clanEntries] = await Promise.all([
    fetchCommunityPosts(),
    fetchClans(),
  ]);

  return [...staticEntries, ...communityEntries, ...clanEntries];
}
