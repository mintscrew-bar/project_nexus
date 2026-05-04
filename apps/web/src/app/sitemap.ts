import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

const publicRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/clans", priority: 0.7, changeFrequency: "daily" },
  { path: "/community", priority: 0.65, changeFrequency: "daily" },
  { path: "/matches", priority: 0.6, changeFrequency: "daily" },
  { path: "/tournaments", priority: 0.6, changeFrequency: "weekly" },
  { path: "/simulation", priority: 0.55, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return publicRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
