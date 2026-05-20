import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import PostDetailClient from "./_PostDetailClient";

interface Props {
  // Next.js 15: 동적 라우트 params 는 Promise 로 전달됨 → await 필요
  params: Promise<{ id: string }>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchPost(id: string) {
  const res = await fetch(`${API_BASE}/api/community/${id}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const post = await fetchPost(id);
    if (post) {
      const title = post.title ?? "커뮤니티 글";
      const description = post.content
        ? post.content.replace(/[#*>`\[\]]/g, "").slice(0, 120)
        : `${post.author?.username ?? "Nexus"} 님의 게시글을 확인하세요.`;
      return {
        title,
        description,
        alternates: { canonical: absoluteUrl(`/community/${id}`) },
        openGraph: {
          title: `${title} | ${SITE_NAME} 커뮤니티`,
          description,
          url: absoluteUrl(`/community/${id}`),
          type: "article",
          ...(post.author?.username && { authors: [post.author.username] }),
          ...(post.createdAt && { publishedTime: post.createdAt }),
        },
      };
    }
  } catch {
    // 게시글 fetch 실패 시 기본 메타데이터 반환
  }

  return {
    title: "커뮤니티 글",
    description: "Nexus 커뮤니티 게시글을 확인하세요.",
    alternates: { canonical: absoluteUrl(`/community/${id}`) },
  };
}

export default async function PostDetailPage({ params }: Props) {
  const { id } = await params;
  let jsonLd: object | null = null;

  try {
    const post = await fetchPost(id);
    if (post) {
      const title = post.title ?? "커뮤니티 글";
      const description = post.content
        ? post.content.replace(/[#*>`\[\]]/g, "").slice(0, 120)
        : "";
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        url: absoluteUrl(`/community/${id}`),
        datePublished: post.createdAt,
        dateModified: post.updatedAt ?? post.createdAt,
        author: {
          "@type": "Person",
          name: post.author?.username ?? SITE_NAME,
        },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          url: absoluteUrl("/"),
        },
      };
    }
  } catch {
    // JSON-LD 생성 실패 시 생략
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <PostDetailClient />
    </>
  );
}
