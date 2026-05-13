import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import ClanDetailClient from "./_ClanDetailClient";

interface Props {
  params: { id: string };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function fetchClan(id: string) {
  const res = await fetch(`${API_BASE}/api/clans/${id}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = params;

  try {
    const clan = await fetchClan(id);
    if (clan) {
      const title = `${clan.name} 클랜`;
      const description = clan.description
        ? `${clan.name} - ${clan.description.slice(0, 120)}`
        : `${clan.name} 클랜의 멤버, 랭킹, 내전 기록을 확인하세요.`;
      return {
        title,
        description,
        alternates: { canonical: absoluteUrl(`/clans/${id}`) },
        openGraph: {
          title: `${title} | ${SITE_NAME}`,
          description,
          url: absoluteUrl(`/clans/${id}`),
        },
      };
    }
  } catch {
    // 클랜 정보 fetch 실패 시 기본 메타데이터 반환
  }

  return {
    title: "클랜 상세",
    description: "클랜 멤버, 랭킹, 내전 기록을 확인하세요.",
    alternates: { canonical: absoluteUrl(`/clans/${id}`) },
  };
}

export default async function ClanDetailPage({ params }: Props) {
  const { id } = params;
  let jsonLd: object | null = null;

  try {
    const clan = await fetchClan(id);
    if (clan) {
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: clan.name,
        description: clan.description ?? "",
        url: absoluteUrl(`/clans/${id}`),
        ...(clan.avatarUrl && { logo: clan.avatarUrl }),
        memberOf: {
          "@type": "WebSite",
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
      <ClanDetailClient />
    </>
  );
}
