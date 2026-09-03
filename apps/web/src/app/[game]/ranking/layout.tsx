import type { Metadata } from "next";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "내전 랭킹",
  description:
    "Nexus 내전 전적 기반 글로벌 랭킹입니다. 승률, 판수, KDA 기준으로 최상위 플레이어를 확인하세요.",
  alternates: {
    canonical: absoluteUrl("/ranking"),
  },
  openGraph: {
    title: "내전 랭킹 | Nexus",
    description:
      "롤 내전 전적 기반 글로벌 랭킹. 최소 10판 이상 플레이어 대상 승률·KDA 순위를 제공합니다.",
    url: absoluteUrl("/ranking"),
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: `내전 랭킹 | ${SITE_NAME}`,
  description: "롤 내전 전적 기반 글로벌 랭킹 페이지",
  url: absoluteUrl("/ranking"),
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "랭킹", item: absoluteUrl("/ranking") },
    ],
  },
};

export default function RankingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}
