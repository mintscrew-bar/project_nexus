import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

const publicRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/lab", priority: 0.9, changeFrequency: "daily" },
  { path: "/lab/champions", priority: 0.85, changeFrequency: "daily" },
  { path: "/lab/champions/compare", priority: 0.75, changeFrequency: "daily" },
  { path: "/lab/compositions", priority: 0.75, changeFrequency: "daily" },
  { path: "/lab/oracle", priority: 0.75, changeFrequency: "daily" },
  { path: "/lab/oracle/balance", priority: 0.7, changeFrequency: "daily" },
  { path: "/lab/oracle/ban", priority: 0.7, changeFrequency: "daily" },
  { path: "/lab/oracle/h2h", priority: 0.7, changeFrequency: "daily" },
  { path: "/ranking", priority: 0.8, changeFrequency: "daily" },
  { path: "/clans", priority: 0.7, changeFrequency: "daily" },
  { path: "/community", priority: 0.65, changeFrequency: "daily" },
  { path: "/matches", priority: 0.6, changeFrequency: "daily" },
  { path: "/tournaments", priority: 0.6, changeFrequency: "weekly" },
  { path: "/simulation", priority: 0.55, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/feed.xml", priority: 0.5, changeFrequency: "hourly" },
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
