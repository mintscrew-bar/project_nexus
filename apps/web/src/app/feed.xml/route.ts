import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";

interface Post {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: { id: string; username: string };
  category?: string;
}

interface PostListResponse {
  posts: Post[];
}

// HTML 태그 및 마크다운 제거 후 plain text 요약 반환
function toPlainText(raw: string, maxLength = 200): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/[#*`~>\-_[\]]/g, "")
    .trim()
    .slice(0, maxLength);
}

// XML 특수문자 이스케이프
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const apiUrl = process.env.API_URL || "http://localhost:4000";

  let posts: Post[] = [];
  try {
    const res = await fetch(
      `${apiUrl}/api/community/posts?limit=30`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const data: PostListResponse | Post[] = await res.json();
      posts = Array.isArray(data) ? data : (data.posts ?? []);
    }
  } catch {
    // 피드 생성 실패 시 빈 채널 반환
  }

  const siteUrl = absoluteUrl("/").replace(/\/$/, "");
  const now = new Date().toUTCString();

  const items = posts
    .map((post) => {
      const link = `${siteUrl}/community/${post.id}`;
      const description = escapeXml(toPlainText(post.content));
      const pubDate = new Date(post.createdAt).toUTCString();

      return `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${link}</link>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${link}</guid>
      <author>${escapeXml(post.author.username)}</author>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_NAME)} 커뮤니티</title>
    <link>${siteUrl}/community</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>ko</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/icon.png</url>
      <title>${escapeXml(SITE_NAME)}</title>
      <link>${siteUrl}</link>
    </image>${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
